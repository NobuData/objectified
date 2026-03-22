"""Shared URL checks for server-side HTTP fetches (SSRF mitigation)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpcore
import httpx
from fastapi import HTTPException


class SSRFBlockedError(Exception):
    """Raised by SSRF-validation code when a connection target is blocked.

    Kept as a plain :class:`Exception` subclass (not an :mod:`httpcore`
    exception) so that it propagates unchanged through httpx's exception
    mapper and can be caught specifically in route handlers.
    """

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def _is_unsafe_address(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the address should be blocked for SSRF prevention."""
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
        or addr.is_multicast
    )


class _SSRFValidatingNetworkBackend(httpcore.SyncBackend):
    """Network backend that re-validates resolved IPs at connect time.

    Prevents DNS rebinding / TOCTOU attacks by resolving the hostname immediately
    before opening the TCP socket, checking every resolved address against the SSRF
    blocklist, and connecting to the first validated IP directly (rather than
    allowing the OS to resolve DNS again at the socket level).

    Raises :class:`SSRFBlockedError` (not :class:`httpcore.ConnectError`) so
    callers can distinguish SSRF rejections from ordinary network errors.
    """

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: object = None,
    ) -> httpcore.NetworkStream:
        try:
            results = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise httpcore.ConnectError(f"DNS resolution failed for {host!r}") from exc

        if not results:
            raise httpcore.ConnectError(f"No DNS results for {host!r}")

        validated_ip: str | None = None
        for _family, _type, _proto, _canonname, sockaddr in results:
            addr_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(addr_str)
            except ValueError:
                continue
            if _is_unsafe_address(ip):
                raise SSRFBlockedError(
                    "Import URL must not target a private, loopback, "
                    "multicast, or reserved address"
                )
            if validated_ip is None:
                validated_ip = addr_str

        if validated_ip is None:
            raise httpcore.ConnectError(f"Could not validate any DNS result for {host!r}")

        # Connect to the pre-validated IP directly to avoid a second DNS lookup.
        return super().connect_tcp(validated_ip, port, timeout, local_address, socket_options)


def make_ssrf_validated_transport() -> httpx.HTTPTransport:
    """Return an :class:`httpx.HTTPTransport` that validates DNS at connect time.

    The returned transport subclasses :class:`httpx.HTTPTransport` so that the
    underlying :mod:`httpcore` connection pool uses
    :class:`_SSRFValidatingNetworkBackend`.  This closes the DNS rebinding /
    TOCTOU window left open when host validation and actual connection happen in
    separate steps.
    """

    class _SSRFTransport(httpx.HTTPTransport):
        def __init__(self) -> None:
            super().__init__(verify=True)
            old_pool = self._pool
            ssl_ctx = old_pool._ssl_context
            old_pool.close()
            self._pool = httpcore.ConnectionPool(
                ssl_context=ssl_ctx,
                network_backend=_SSRFValidatingNetworkBackend(),
            )

    return _SSRFTransport()


def assert_https_url_safe_for_fetch(url: str) -> str:
    """Validate ``url`` for HTTPS GET fetches: scheme, host, and resolved IPs.

    Import fetch only allows ``https`` (no plain ``http``). Raises ``HTTPException``
    on invalid or unsafe URLs. Returns the stripped URL string.
    """
    u = url.strip()
    p = urlparse(u)
    if p.scheme != "https":
        raise HTTPException(
            status_code=400,
            detail="Import URL must use https",
        )
    if not p.netloc:
        raise HTTPException(status_code=400, detail="Import URL must include a host")
    if p.username or p.password:
        raise HTTPException(
            status_code=400,
            detail="Import URL must not embed credentials; use optional request headers instead",
        )
    hostname = p.hostname or ""
    if not hostname:
        raise HTTPException(status_code=400, detail="Import URL must include a host")
    lowered = hostname.lower()
    if lowered in ("localhost",) or lowered.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="Import URL host is not allowed")

    try:
        results = socket.getaddrinfo(hostname, None)
    except OSError:
        raise HTTPException(status_code=400, detail="Import URL host could not be resolved")

    for _family, _type, _proto, _canonname, sockaddr in results:
        addr_str = sockaddr[0]
        try:
            addr = ipaddress.ip_address(addr_str)
        except ValueError:
            continue
        if _is_unsafe_address(addr):
            raise HTTPException(
                status_code=400,
                detail="Import URL must not target a private, loopback, or reserved address",
            )

    return u
