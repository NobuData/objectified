"""REST routes for /v1/tenants, /v1/tenants/{id}/members, /v1/tenants/{id}/administrators."""

import json
import logging
from typing import Annotated, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_user_tenants, require_admin, require_authenticated
from app.database import db
from app.routes.helpers import (
    _assert_tenant_exists,
    _not_found,
    _resolve_account_id,
    _validate_payload_tenant_id,
)
from app.schemas import (
    TenantAccountCreate,
    TenantAccountSchema,
    TenantAccountUpdate,
    TenantAdministratorCreate,
    TenantCreate,
    TenantSchema,
    TenantUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tenants"])


# ---------------------------------------------------------------------------
# Tenant CRUD
# ---------------------------------------------------------------------------

@router.get(
    "/tenants",
    response_model=List[TenantSchema],
    summary="List tenants",
    description="List all tenants. Soft-deleted tenants are excluded by default.",
)
def list_tenants(
    include_deleted: bool = Query(False, description="Include soft-deleted tenants"),
) -> List[TenantSchema]:
    """List tenants."""
    if include_deleted:
        query = """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    else:
        query = """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE deleted_at IS NULL
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    return [TenantSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/me",
    response_model=List[TenantSchema],
    summary="List current user's tenants",
    description=(
        "List tenants the authenticated user is a member of (requires JWT). "
        "Returns full tenant details. Soft-deleted tenants are excluded."
    ),
)
def list_my_tenants(
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
) -> List[TenantSchema]:
    """List tenants for the current user (JWT only)."""
    user_id = caller.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="This endpoint requires JWT authentication.",
        )
    tenant_refs = get_user_tenants(user_id)
    if not tenant_refs:
        return []
    ids = [t["id"] for t in tenant_refs]
    placeholders = ",".join(["%s"] * len(ids))
    query = f"""
        SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
        FROM objectified.tenant
        WHERE id IN ({placeholders}) AND deleted_at IS NULL
        ORDER BY name ASC
    """
    rows = db.execute_query(query, tuple(ids))
    return [TenantSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    summary="Get tenant by ID",
    description="Retrieve a single tenant by its UUID. Soft-deleted tenants are excluded by default.",
)
def get_tenant(
    tenant_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted tenant"),
) -> TenantSchema:
    """Get a tenant by ID."""
    if include_deleted:
        rows = db.execute_query(
            """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE id = %s
            """,
            (tenant_id,),
        )
    else:
        rows = db.execute_query(
            """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE id = %s AND deleted_at IS NULL
            """,
            (tenant_id,),
        )
    if not rows:
        raise _not_found("Tenant", tenant_id)
    return TenantSchema(**dict(rows[0]))


@router.post(
    "/tenants",
    response_model=TenantSchema,
    status_code=201,
    summary="Create tenant",
    description=(
        "Create a new tenant. Slug must be unique and URL-safe (lowercase alphanumeric with hyphens). "
        "Requires authentication. The authenticated user is assigned as an administrator of the new tenant."
    ),
)
def create_tenant(
    payload: TenantCreate,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
) -> TenantSchema:
    """Create a new tenant and assign the current user as administrator."""
    existing = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE slug = %s",
        (payload.slug,),
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug already in use: {payload.slug}")

    user_id = caller.get("user_id")

    if user_id:
        # Atomically create the tenant and assign the creator as administrator using a CTE.
        # If either INSERT fails the whole transaction is rolled back.
        row = db.execute_mutation(
            """
            WITH inserted_tenant AS (
                INSERT INTO objectified.tenant (name, description, slug, enabled, metadata)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                RETURNING id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            ),
            inserted_admin AS (
                INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
                SELECT id, %s, 'administrator', true
                FROM inserted_tenant
            )
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM inserted_tenant
            """,
            (
                payload.name,
                payload.description,
                payload.slug,
                payload.enabled,
                json.dumps(payload.metadata),
                user_id,
            ),
        )
    else:
        row = db.execute_mutation(
            """
            INSERT INTO objectified.tenant (name, description, slug, enabled, metadata)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            RETURNING id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            """,
            (payload.name, payload.description, payload.slug, payload.enabled, json.dumps(payload.metadata)),
        )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create tenant")

    return TenantSchema(**dict(row))


@router.put(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    summary="Update tenant",
    description="Update an existing tenant. Only provided fields are updated. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def update_tenant(tenant_id: str, payload: TenantUpdate) -> TenantSchema:
    """Update a tenant by ID."""
    rows = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s AND deleted_at IS NULL",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)
    if payload.slug is not None:
        existing_slug_rows = db.execute_query(
            "SELECT id FROM objectified.tenant WHERE slug = %s AND id <> %s",
            (payload.slug, tenant_id),
        )
        if existing_slug_rows:
            raise HTTPException(status_code=409, detail="Tenant slug already exists")
        updates.append("slug = %s")
        params.append(payload.slug)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(tenant_id)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET {", ".join(updates)}
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("Tenant", tenant_id)
    return TenantSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}",
    status_code=204,
    summary="Deactivate tenant",
    description=(
        "Soft-delete (deactivate) a tenant by setting deleted_at. "
        "The record is retained; no hard delete is performed. **Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def deactivate_tenant(tenant_id: str) -> None:
    """Deactivate (soft-delete) a tenant."""
    rows = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s AND deleted_at IS NULL",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)

    db.execute_mutation(
        """
        UPDATE objectified.tenant
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
        returning=False,
    )


# ---------------------------------------------------------------------------
# Tenant Members
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/members",
    response_model=List[TenantAccountSchema],
    summary="List tenant members",
    description="List all active members (tenant_account rows) for a tenant.",
)
def list_tenant_members(tenant_id: str) -> List[TenantAccountSchema]:
    """List members of a tenant."""
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        FROM objectified.tenant_account
        WHERE tenant_id = %s AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (tenant_id,),
    )
    return [TenantAccountSchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/members",
    response_model=TenantAccountSchema,
    status_code=201,
    summary="Add tenant member",
    description=(
        "Add an account to a tenant with a given access level. "
        "The account can be identified by ``account_id`` (UUID) or ``email``. "
        "If both are provided, ``account_id`` takes precedence."
    ),
    dependencies=[Depends(require_admin)],
)
def add_tenant_member(tenant_id: str, payload: TenantAccountCreate) -> TenantAccountSchema:
    """Add a member to a tenant by account_id or email."""
    _assert_tenant_exists(tenant_id)
    _validate_payload_tenant_id(payload.tenant_id, tenant_id)
    resolved_account_id = _resolve_account_id(payload.account_id, payload.email)

    existing = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, resolved_account_id),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Account is already a member of this tenant")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
        VALUES (%s, %s, %s, %s)
        RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        """,
        (tenant_id, resolved_account_id, payload.access_level.value, payload.enabled),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to add member")
    return TenantAccountSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/members/{account_id}",
    status_code=204,
    summary="Remove tenant member",
    description="Remove (soft-delete) an account from a tenant. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def remove_tenant_member(tenant_id: str, account_id: str) -> None:
    """Remove a member from a tenant (soft-delete)."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    db.execute_mutation(
        """
        UPDATE objectified.tenant_account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
        returning=False,
    )


@router.put(
    "/tenants/{tenant_id}/members/{account_id}",
    response_model=TenantAccountSchema,
    summary="Update tenant member",
    description="Update the access level or enabled status of a tenant member. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def update_tenant_member(
    tenant_id: str, account_id: str, payload: TenantAccountUpdate
) -> TenantAccountSchema:
    """Update a tenant member's access level or enabled status."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    updates: list[str] = []
    params: list = []

    if payload.access_level is not None:
        updates.append("access_level = %s")
        params.append(payload.access_level.value)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.extend([tenant_id, account_id])
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant_account
        SET {", ".join(updates)}
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        """,
        tuple(params),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")
    return TenantAccountSchema(**dict(row))


# ---------------------------------------------------------------------------
# Tenant Administrators
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/administrators",
    response_model=List[TenantAccountSchema],
    summary="List tenant administrators",
    description="List all active members with access_level=administrator for a tenant.",
)
def list_tenant_administrators(tenant_id: str) -> List[TenantAccountSchema]:
    """List administrators of a tenant."""
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        FROM objectified.tenant_account
        WHERE tenant_id = %s AND access_level = 'administrator' AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (tenant_id,),
    )
    return [TenantAccountSchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/administrators",
    response_model=TenantAccountSchema,
    status_code=201,
    summary="Add tenant administrator",
    description=(
        "Add an account to a tenant with the ``administrator`` access level, or "
        "promote an existing member to administrator. "
        "The account can be identified by ``account_id`` (UUID) or ``email``. "
        "If both are provided, ``account_id`` takes precedence. "
        "**Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def add_tenant_administrator(
    tenant_id: str, payload: TenantAdministratorCreate
) -> TenantAccountSchema:
    """Add or promote an administrator in a tenant (admin only)."""
    _assert_tenant_exists(tenant_id)
    _validate_payload_tenant_id(payload.tenant_id, tenant_id)
    resolved_account_id = _resolve_account_id(payload.account_id, payload.email)

    existing_rows = db.execute_query(
        """
        SELECT id, access_level FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, resolved_account_id),
    )
    if existing_rows:
        existing = existing_rows[0]
        if existing["access_level"] == "administrator":
            raise HTTPException(
                status_code=409,
                detail="Account is already an administrator of this tenant",
            )
        row = db.execute_mutation(
            """
            UPDATE objectified.tenant_account
            SET access_level = 'administrator'
            WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
            RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
            """,
            (tenant_id, resolved_account_id),
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to promote member to administrator")
        return TenantAccountSchema(**dict(row))

    row = db.execute_mutation(
        """
        INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
        VALUES (%s, %s, 'administrator', %s)
        RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        """,
        (tenant_id, resolved_account_id, payload.enabled),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to add administrator")
    return TenantAccountSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/administrators/{account_id}",
    status_code=204,
    summary="Remove tenant administrator",
    description=(
        "Soft-delete the administrator tenant_account row for the given account. "
        "**Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def remove_tenant_administrator(tenant_id: str, account_id: str) -> None:
    """Remove an administrator from a tenant (admin only)."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND access_level = 'administrator'
          AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Administrator not found in this tenant")

    db.execute_mutation(
        """
        UPDATE objectified.tenant_account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s AND account_id = %s AND access_level = 'administrator'
          AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
        returning=False,
    )

