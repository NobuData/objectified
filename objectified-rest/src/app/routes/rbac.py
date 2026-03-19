"""REST routes for tenant-scoped RBAC (roles, permissions, assignments)."""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth import (
    _IMPLICIT_VIEWER_PERMISSIONS,
    require_authenticated,
    require_tenant_admin,
    require_tenant_permission,
)
from app.database import db
from app.routes.helpers import _assert_tenant_exists, _not_found
from app.schemas.rbac import (
    AccountRoleAssignmentCreate,
    EffectivePermissionsResponse,
    PermissionSchema,
    RoleCreate,
    RolePermissionsUpdate,
    RoleSchema,
    RoleUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["RBAC"])


def _is_tenant_admin(tenant_id: str, account_id: str) -> bool:
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account
        WHERE tenant_id = %s
          AND account_id = %s
          AND access_level = 'administrator'
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, account_id),
    )
    return bool(rows)


def _get_effective_permission_keys(
    tenant_id: str,
    account_id: str,
) -> set[str]:
    # Baseline for any tenant member: viewer permissions. The auth layer already
    # enforces membership; here we just compute the permission list.
    keys: set[str] = set(_IMPLICIT_VIEWER_PERMISSIONS)

    rows = db.execute_query(
        """
        SELECT DISTINCT p.key
        FROM objectified.account_role ar
        JOIN objectified.role r ON r.id = ar.role_id
        JOIN objectified.role_permission rp ON rp.role_id = r.id
        JOIN objectified.permission p ON p.id = rp.permission_id
        WHERE ar.tenant_id = %s
          AND ar.account_id = %s
          AND ar.enabled = true
          AND r.enabled = true
          AND rp.enabled = true
          AND ar.deleted_at IS NULL
          AND r.deleted_at IS NULL
          AND rp.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND p.enabled = true
        """,
        (tenant_id, account_id),
    )
    for r in rows:
        k = r.get("key")
        if isinstance(k, str) and k:
            keys.add(k)
    return keys


@router.get(
    "/tenants/{tenant_id}/me/permissions",
    response_model=EffectivePermissionsResponse,
    summary="Get effective permission keys for the current caller in a tenant",
    description=(
        "Return the effective permission keys for the authenticated caller for the given tenant. "
        "Tenant administrators receive all permissions implicitly; non-admin members receive the "
        "baseline viewer permissions plus any role-derived permissions."
    ),
)
def get_my_effective_permissions(
    tenant_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:read"))] = None,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> EffectivePermissionsResponse:
    _assert_tenant_exists(tenant_id)
    account_id = caller.get("account_id")
    if not account_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    tenant_admin = bool(caller.get("is_admin")) or _is_tenant_admin(tenant_id, account_id)
    if tenant_admin:
        # Use the permission registry as the source of truth.
        all_rows = db.execute_query(
            """
            SELECT key
            FROM objectified.permission
            WHERE deleted_at IS NULL
              AND enabled = true
            ORDER BY key ASC
            """
        )
        keys = [r["key"] for r in all_rows if r.get("key")]
        role_ids_rows = db.execute_query(
            """
            SELECT DISTINCT role_id
            FROM objectified.account_role
            WHERE tenant_id = %s
              AND account_id = %s
              AND deleted_at IS NULL
            """,
            (tenant_id, account_id),
        )
        role_ids = [str(r["role_id"]) for r in role_ids_rows if r.get("role_id")]
        return EffectivePermissionsResponse(
            tenant_id=tenant_id,
            account_id=account_id,
            is_tenant_admin=True,
            role_ids=role_ids,
            permission_keys=keys,
        )

    keys_set = _get_effective_permission_keys(tenant_id, account_id)
    role_ids_rows = db.execute_query(
        """
        SELECT DISTINCT role_id
        FROM objectified.account_role
        WHERE tenant_id = %s
          AND account_id = %s
          AND deleted_at IS NULL
          AND enabled = true
        """,
        (tenant_id, account_id),
    )
    role_ids = [str(r["role_id"]) for r in role_ids_rows if r.get("role_id")]
    return EffectivePermissionsResponse(
        tenant_id=tenant_id,
        account_id=account_id,
        is_tenant_admin=False,
        role_ids=role_ids,
        permission_keys=sorted(keys_set),
    )


@router.get(
    "/tenants/{tenant_id}/rbac/permissions",
    response_model=List[PermissionSchema],
    summary="List permission registry (tenant admin)",
    description="List all enabled permissions available for role configuration. Tenant admin only.",
)
def list_permissions(
    tenant_id: str,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> List[PermissionSchema]:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, key, description, enabled, metadata
        FROM objectified.permission
        WHERE deleted_at IS NULL
        ORDER BY key ASC
        """
    )
    return [PermissionSchema(**{**dict(r), "id": str(r["id"])}) for r in rows]


@router.get(
    "/tenants/{tenant_id}/rbac/roles",
    response_model=List[RoleSchema],
    summary="List roles for a tenant (tenant admin)",
)
def list_roles(
    tenant_id: str,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> List[RoleSchema]:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, key, name, description, enabled, metadata
        FROM objectified.role
        WHERE tenant_id = %s
          AND deleted_at IS NULL
        ORDER BY LOWER(key) ASC
        """,
        (tenant_id,),
    )
    return [
        RoleSchema(**{**dict(r), "id": str(r["id"]), "tenant_id": str(r["tenant_id"])})
        for r in rows
    ]


@router.post(
    "/tenants/{tenant_id}/rbac/roles",
    response_model=RoleSchema,
    status_code=201,
    summary="Create a custom role for a tenant (tenant admin)",
)
def create_role(
    tenant_id: str,
    payload: RoleCreate,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> RoleSchema:
    _assert_tenant_exists(tenant_id)
    key = payload.key.strip()
    if not key:
        raise HTTPException(status_code=422, detail="Role key must not be empty.")

    existing = db.execute_query(
        """
        SELECT id
        FROM objectified.role
        WHERE tenant_id = %s
          AND LOWER(key) = LOWER(%s)
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, key),
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Role key already exists in tenant: {key}")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.role (tenant_id, key, name, description, enabled, metadata)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, tenant_id, key, name, description, enabled, metadata
        """,
        (
            tenant_id,
            key,
            payload.name.strip(),
            payload.description,
            payload.enabled,
            json.dumps(payload.metadata),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create role.")
    d = dict(row)
    d["id"] = str(d["id"])
    d["tenant_id"] = str(d["tenant_id"])
    return RoleSchema(**d)


@router.put(
    "/tenants/{tenant_id}/rbac/roles/{role_id}",
    response_model=RoleSchema,
    summary="Update a role (tenant admin)",
)
def update_role(
    tenant_id: str,
    role_id: str,
    payload: RoleUpdate,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> RoleSchema:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id
        FROM objectified.role
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (role_id, tenant_id),
    )
    if not rows:
        raise _not_found("Role", role_id)

    updates: list[str] = []
    params: list[Any] = []

    if payload.key is not None:
        key = payload.key.strip()
        if not key:
            raise HTTPException(status_code=422, detail="Role key must not be empty.")
        dup = db.execute_query(
            """
            SELECT id
            FROM objectified.role
            WHERE tenant_id = %s
              AND LOWER(key) = LOWER(%s)
              AND id != %s
              AND deleted_at IS NULL
            LIMIT 1
            """,
            (tenant_id, key, role_id),
        )
        if dup:
            raise HTTPException(status_code=409, detail=f"Role key already exists in tenant: {key}")
        updates.append("key = %s")
        params.append(key)
    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name.strip())
    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        row = db.execute_query(
            """
            SELECT id, tenant_id, key, name, description, enabled, metadata
            FROM objectified.role
            WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (role_id, tenant_id),
        )
        d = dict(row[0])
        d["id"] = str(d["id"])
        d["tenant_id"] = str(d["tenant_id"])
        return RoleSchema(**d)

    params.extend([role_id, tenant_id])
    row = db.execute_mutation(
        f"""
        UPDATE objectified.role
        SET {", ".join(updates)}
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        RETURNING id, tenant_id, key, name, description, enabled, metadata
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("Role", role_id)
    d = dict(row)
    d["id"] = str(d["id"])
    d["tenant_id"] = str(d["tenant_id"])
    return RoleSchema(**d)


@router.get(
    "/tenants/{tenant_id}/rbac/roles/{role_id}/permissions",
    response_model=List[str],
    summary="List permission keys for a role (tenant admin)",
)
def list_role_permissions(
    tenant_id: str,
    role_id: str,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> List[str]:
    _assert_tenant_exists(tenant_id)
    role_rows = db.execute_query(
        "SELECT id FROM objectified.role WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL LIMIT 1",
        (role_id, tenant_id),
    )
    if not role_rows:
        raise _not_found("Role", role_id)
    rows = db.execute_query(
        """
        SELECT p.key
        FROM objectified.role_permission rp
        JOIN objectified.permission p ON p.id = rp.permission_id
        WHERE rp.role_id = %s
          AND rp.deleted_at IS NULL
          AND rp.enabled = true
          AND p.deleted_at IS NULL
          AND p.enabled = true
        ORDER BY p.key ASC
        """,
        (role_id,),
    )
    return [r["key"] for r in rows if r.get("key")]


@router.put(
    "/tenants/{tenant_id}/rbac/roles/{role_id}/permissions",
    response_model=List[str],
    summary="Replace permissions for a role (tenant admin)",
)
def replace_role_permissions(
    tenant_id: str,
    role_id: str,
    payload: RolePermissionsUpdate,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> List[str]:
    _assert_tenant_exists(tenant_id)
    role_rows = db.execute_query(
        "SELECT id FROM objectified.role WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL LIMIT 1",
        (role_id, tenant_id),
    )
    if not role_rows:
        raise _not_found("Role", role_id)

    desired = sorted({k.strip() for k in (payload.permission_keys or []) if k and k.strip()})

    # Soft-delete existing mappings.
    db.execute_mutation(
        """
        UPDATE objectified.role_permission
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE role_id = %s AND deleted_at IS NULL
        """,
        (role_id,),
        returning=False,
    )

    if not desired:
        return []

    # Insert new mappings by permission keys.
    perm_rows = db.execute_query(
        """
        SELECT id, key
        FROM objectified.permission
        WHERE deleted_at IS NULL
          AND enabled = true
          AND key = ANY(%s)
        """,
        (desired,),
    )
    found_by_key = {r["key"]: str(r["id"]) for r in perm_rows if r.get("key")}
    missing = [k for k in desired if k not in found_by_key]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown permission keys: {', '.join(missing)}")

    for key in desired:
        db.execute_mutation(
            """
            INSERT INTO objectified.role_permission (role_id, permission_id, enabled, metadata)
            VALUES (%s, %s, true, '{}'::jsonb)
            ON CONFLICT DO NOTHING
            """,
            (role_id, found_by_key[key]),
            returning=False,
        )

    logger.info("replace_role_permissions: tenant=%s role=%s permissions=%d", tenant_id, role_id, len(desired))
    return desired


@router.post(
    "/tenants/{tenant_id}/rbac/assignments",
    status_code=201,
    summary="Assign a role to an account (tenant admin)",
)
def create_account_role_assignment(
    tenant_id: str,
    payload: AccountRoleAssignmentCreate,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)] = None,
) -> dict[str, Any]:
    _assert_tenant_exists(tenant_id)

    # Validate role belongs to tenant.
    role_rows = db.execute_query(
        """
        SELECT id
        FROM objectified.role
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (payload.role_id, tenant_id),
    )
    if not role_rows:
        raise _not_found("Role", payload.role_id)

    # Validate account exists.
    acct_rows = db.execute_query(
        "SELECT id FROM objectified.account WHERE id = %s AND deleted_at IS NULL LIMIT 1",
        (payload.account_id,),
    )
    if not acct_rows:
        raise _not_found("User", payload.account_id)

    resource_type = payload.resource_type
    resource_id = payload.resource_id
    if (resource_type is None) != (resource_id is None):
        raise HTTPException(status_code=422, detail="resource_type and resource_id must be provided together.")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.account_role
            (tenant_id, account_id, role_id, resource_type, resource_id, enabled, metadata)
        VALUES (%s, %s, %s, %s::objectified.rbac_resource_type, %s::uuid, %s, %s::jsonb)
        RETURNING id, tenant_id, account_id, role_id, resource_type, resource_id, enabled, metadata
        """,
        (
            tenant_id,
            payload.account_id,
            payload.role_id,
            resource_type,
            resource_id,
            payload.enabled,
            json.dumps(payload.metadata),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create role assignment.")

    d = dict(row)
    d["id"] = str(d["id"])
    d["tenant_id"] = str(d["tenant_id"])
    d["account_id"] = str(d["account_id"])
    d["role_id"] = str(d["role_id"])
    d["resource_id"] = str(d["resource_id"]) if d.get("resource_id") is not None else None
    return d

