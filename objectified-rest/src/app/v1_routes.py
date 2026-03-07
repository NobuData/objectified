"""
Stub routes for /v1/users, /v1/tenants, /v1/tenants/{id}/members,
/v1/tenants/{id}/administrators. Documented in OpenAPI; no CRUD implementation yet.
"""

from typing import List

from fastapi import APIRouter, HTTPException

from app.schemas import (
    AccountSchema,
    TenantAccountSchema,
    TenantSchema,
)

router = APIRouter(prefix="/v1", tags=["users and tenants"])


@router.get(
    "/users",
    response_model=List[AccountSchema],
    summary="List users",
    description="List accounts (users). Not implemented yet.",
)
async def list_users() -> List[AccountSchema]:
    """Stub: list users. No endpoint services yet."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get(
    "/users/{user_id}",
    response_model=AccountSchema,
    summary="Get user",
    description="Get a single account by id. Not implemented yet.",
)
async def get_user(user_id: str) -> AccountSchema:
    """Stub: get user by id."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get(
    "/tenants",
    response_model=List[TenantSchema],
    summary="List tenants",
    description="List tenants. Not implemented yet.",
)
async def list_tenants() -> List[TenantSchema]:
    """Stub: list tenants."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    summary="Get tenant",
    description="Get a single tenant by id. Not implemented yet.",
)
async def get_tenant(tenant_id: str) -> TenantSchema:
    """Stub: get tenant by id."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get(
    "/tenants/{tenant_id}/members",
    response_model=List[TenantAccountSchema],
    summary="List tenant members",
    description="List tenant_account rows for this tenant (members). Not implemented yet.",
)
async def list_tenant_members(tenant_id: str) -> List[TenantAccountSchema]:
    """Stub: list members of a tenant."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get(
    "/tenants/{tenant_id}/administrators",
    response_model=List[TenantAccountSchema],
    summary="List tenant administrators",
    description="List tenant_account rows with access_level=administrator. Not implemented yet.",
)
async def list_tenant_administrators(
    tenant_id: str,
) -> List[TenantAccountSchema]:
    """Stub: list administrators of a tenant."""
    raise HTTPException(status_code=501, detail="Not implemented")
