"""Sliding-window rate limits: API key, JWT (tenant-scoped or global), then client IP."""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from typing import Any, DefaultDict, Deque, Optional

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.auth import decode_jwt
from app.config import settings
from app.database import db

_windows: DefaultDict[str, Deque[float]] = defaultdict(deque)
WINDOW_SECONDS = 60.0

_TENANT_IN_PATH = re.compile(
    r"^/v1/tenants/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/"
)


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _prune(ts_deque: Deque[float], now: float) -> None:
    cutoff = now - WINDOW_SECONDS
    while ts_deque and ts_deque[0] < cutoff:
        ts_deque.popleft()


def _exempt_path(path: str) -> bool:
    if path in ("/health", "/ready", "/openapi.json", "/openapi.yaml"):
        return True
    if path.startswith("/docs"):
        return True
    return False


def _resolve_rpm_limit(override: Optional[int]) -> int:
    if override is not None:
        return max(1, int(override))
    return max(1, settings.rate_limit_per_minute)


def _member_tenant_rpm(tenant_id: str, account_id: str) -> Optional[dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT t.rate_limit_requests_per_minute
        FROM objectified.tenant t
        INNER JOIN objectified.tenant_account ta ON ta.tenant_id = t.id
        WHERE t.id = %s
          AND ta.account_id = %s
          AND t.deleted_at IS NULL
          AND ta.deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, account_id),
    )
    return dict(rows[0]) if rows else None


def _enforce(bucket_key: str, limit: int, now: float) -> Optional[JSONResponse]:
    bucket = _windows[bucket_key]
    _prune(bucket, now)
    if len(bucket) >= limit:
        remaining = WINDOW_SECONDS - (now - bucket[0])
        retry_after = max(1, int(remaining))
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Retry after a short interval."},
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now)
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enforce per-key, per-tenant-JWT, and per-IP sliding-window limits when enabled."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not settings.rate_limit_enabled:
            return await call_next(request)

        path = request.url.path
        if _exempt_path(path):
            return await call_next(request)

        now = time.monotonic()
        global_default = max(1, settings.rate_limit_per_minute)

        api_key_header = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
        if api_key_header and api_key_header.strip():
            key_data = db.validate_api_key(api_key_header.strip(), record_usage=False)
            if key_data:
                eff = _resolve_rpm_limit(key_data.get("rate_limit_requests_per_minute"))
                err = _enforce(f"apikey:{key_data['key_id']}", eff, now)
                if err:
                    return err
                return await call_next(request)

        auth_header = request.headers.get("authorization")
        token: Optional[str] = None
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if token:
            payload = decode_jwt(token)
            sub = str(payload["sub"]) if payload and payload.get("sub") else None
            if sub:
                match = _TENANT_IN_PATH.match(path)
                if match:
                    tenant_id = match.group(1)
                    member = _member_tenant_rpm(tenant_id, sub)
                    if member:
                        rpm = member.get("rate_limit_requests_per_minute")
                        ovr = int(rpm) if rpm is not None else None
                        err = _enforce(
                            f"jwt:{sub}:tenant:{tenant_id}",
                            _resolve_rpm_limit(ovr),
                            now,
                        )
                    else:
                        err = _enforce(f"jwt:{sub}", global_default, now)
                else:
                    err = _enforce(f"jwt:{sub}", global_default, now)
                if err:
                    return err
                return await call_next(request)

        err = _enforce(f"ip:{_client_ip(request)}", global_default, now)
        if err:
            return err
        return await call_next(request)
