"""Per-request context for structured logging (request id, trace, tenant, user)."""

from __future__ import annotations

import contextvars
import re
from typing import Any

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "trace_id", default=None
)
_tenant_slug: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "tenant_slug", default=None
)
_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "user_id", default=None
)
_auth_method: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "auth_method", default=None
)

_TRACEPARENT_RE = re.compile(
    r"^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$",
    re.IGNORECASE,
)


def reset_request_context() -> None:
    """Clear all request-scoped logging fields (call at start/end of request)."""
    _request_id.set(None)
    _trace_id.set(None)
    _tenant_slug.set(None)
    _user_id.set(None)
    _auth_method.set(None)


def set_request_id(value: str) -> None:
    _request_id.set(value)


def set_trace_id(value: str) -> None:
    _trace_id.set(value)


def parse_traceparent_header(traceparent: str | None) -> str | None:
    """Extract 32-char hex trace id from W3C traceparent, or None if invalid."""
    if not traceparent:
        return None
    m = _TRACEPARENT_RE.match(traceparent.strip())
    if not m:
        return None
    return m.group(1).lower()


def bind_auth_context(auth: dict[str, Any]) -> None:
    """Bind tenant and user fields after authentication succeeds."""
    slug = auth.get("tenant_slug")
    if slug is not None:
        _tenant_slug.set(str(slug))
    uid = auth.get("user_id") or auth.get("account_id")
    if uid is not None:
        _user_id.set(str(uid))
    method = auth.get("auth_method")
    if method is not None:
        _auth_method.set(str(method))


def snapshot_context_for_log() -> dict[str, Any]:
    """Return current context values for structured log records."""
    return {
        "request_id": _request_id.get(),
        "trace_id": _trace_id.get(),
        "tenant_slug": _tenant_slug.get(),
        "user_id": _user_id.get(),
        "auth_method": _auth_method.get(),
    }
