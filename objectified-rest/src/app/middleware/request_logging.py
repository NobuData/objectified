"""Structured HTTP request logging with request id and trace id."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings
from app.request_context import (
    parse_traceparent_header,
    reset_request_context,
    set_request_id,
    set_trace_id,
)

_log = logging.getLogger("app.http")

# Paths that skip access logs (high-volume probes)
_SKIP_LOG_PATHS: frozenset[str] = frozenset({"/health", "/ready"})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Assign request/trace ids, attach response headers, log one line per request."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        reset_request_context()
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        set_request_id(request_id)

        traceparent = request.headers.get("traceparent")
        trace_id = parse_traceparent_header(traceparent)
        if not trace_id:
            xt = (request.headers.get("x-trace-id") or "").strip()
            trace_id = xt if xt else uuid.uuid4().hex
        set_trace_id(trace_id)

        skip_log = request.url.path in _SKIP_LOG_PATHS
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except BaseException:
            if settings.log_http_requests and not skip_log:
                duration_ms = (time.perf_counter() - start) * 1000
                _log.exception(
                    "request_failed",
                    extra={
                        "http_method": request.method,
                        "http_path": request.url.path,
                        "http_status_code": 500,
                        "duration_ms": round(duration_ms, 3),
                    },
                )
            reset_request_context()
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Trace-ID"] = trace_id

        if settings.log_http_requests and not skip_log:
            _log.info(
                "request_completed",
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "http_status_code": response.status_code,
                    "duration_ms": round(duration_ms, 3),
                },
            )
        reset_request_context()
        return response
