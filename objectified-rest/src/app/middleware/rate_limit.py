"""Optional in-process rate limiting (per client IP)."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import DefaultDict, Deque

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings

_windows: DefaultDict[str, Deque[float]] = defaultdict(deque)
WINDOW_SECONDS = 60.0


def _client_key(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _prune_old(ts_deque: Deque[float], now: float) -> None:
    cutoff = now - WINDOW_SECONDS
    while ts_deque and ts_deque[0] < cutoff:
        ts_deque.popleft()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Return 429 when a client exceeds ``settings.rate_limit_per_minute`` in a sliding window."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not settings.rate_limit_enabled:
            return await call_next(request)

        # Never rate-limit probes or docs
        path = request.url.path
        if path in ("/health", "/ready") or path.startswith("/docs"):
            return await call_next(request)

        now = time.monotonic()
        key = _client_key(request)
        bucket = _windows[key]
        _prune_old(bucket, now)

        limit = max(1, settings.rate_limit_per_minute)
        if len(bucket) >= limit:
            # Compute how long until the oldest request in the window expires.
            remaining = WINDOW_SECONDS - (now - bucket[0])
            retry_after_seconds = max(1, int(remaining))
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Retry after a short interval.",
                },
                headers={"Retry-After": str(retry_after_seconds)},
            )

        bucket.append(now)
        return await call_next(request)
