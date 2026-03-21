"""Optional audit logging for dashboard UI navigation (GitHub #188)."""

from __future__ import annotations

import logging
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from app.auth import _is_tenant_member, require_authenticated
from app.config import settings
from app.database import db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Users"])

_MAX_ROUTE_LEN = 2048


class DashboardPageVisitCreate(BaseModel):
    """Client-reported dashboard route view for compliance audit."""

    route: str = Field(
        ...,
        description="Path-only route (e.g. /dashboard/projects/…/versions/…).",
        max_length=_MAX_ROUTE_LEN,
    )
    tenant_id: Optional[UUID] = Field(
        default=None,
        description="Active tenant context when the page was viewed, if applicable.",
    )

    @field_validator("route")
    @classmethod
    def route_must_be_absolute_path(cls, v: str) -> str:
        t = v.strip()
        if not t.startswith("/"):
            raise ValueError("route must start with /")
        if "\n" in t or "\r" in t:
            raise ValueError("route must be a single-line path")
        return t


@router.post(
    "/me/dashboard/page-visits",
    status_code=204,
    summary="Record a dashboard page visit (optional audit)",
    description=(
        "When ``DASHBOARD_PAGE_VISIT_AUDIT_ENABLED`` is true on the API, append one row "
        "with tenant (optional), authenticated account, route, and timestamp. "
        "When disabled, returns 204 without writing. JWT or API key callers only; "
        "if ``tenant_id`` is set, the caller must be a member of that tenant."
    ),
    response_class=Response,
)
def record_dashboard_page_visit(
    body: DashboardPageVisitCreate,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
) -> Response:
    if not settings.dashboard_page_visit_audit_enabled:
        return Response(status_code=204)

    account_id = caller.get("account_id") or caller.get("user_id")
    if not account_id:
        logger.debug("dashboard page visit audit: no account id on caller; skipping insert")
        return Response(status_code=204)

    tid: Optional[str] = None
    if body.tenant_id is not None:
        tid = str(body.tenant_id)
        if not _is_tenant_member(str(account_id), tid):
            raise HTTPException(
                status_code=403,
                detail="Not a member of the specified tenant.",
            )

    try:
        db.execute_mutation(
            """
            INSERT INTO objectified.dashboard_page_visit (tenant_id, account_id, route_path)
            VALUES (%s::uuid, %s::uuid, %s)
            """,
            (tid, str(account_id), body.route),
            returning=False,
        )
    except Exception:
        logger.exception("dashboard page visit audit insert failed")
        return Response(status_code=204)

    return Response(status_code=204)
