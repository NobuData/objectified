"""Shared URL checks for server-side HTTP fetches (SSRF mitigation)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException


def _is_unsafe_address(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the address should be blocked for SSRF prevention."""
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


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
