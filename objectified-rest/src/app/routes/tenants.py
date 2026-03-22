"""REST routes for /v1/tenants, /v1/tenants/{id}/members, /v1/tenants/{id}/administrators."""

import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import (
    get_user_tenants,
    require_admin,
    require_authenticated,
    require_tenant_admin,
    require_tenant_permission,
)
from app.database import db
from app.routes.helpers import (
    _assert_project_exists,
    _assert_tenant_exists,
    _not_found,
    _resolve_account_id,
    _validate_payload_tenant_id,
)
from app.schemas import (
    TenantAccessLevel,
    TenantAccountCreate,
    TenantAccountSchema,
    TenantAccountUpdate,
    TenantActivitySummarySchema,
    TenantAdminAuditEventSchema,
    TenantAdministratorCreate,
    TenantAppearanceUpdate,
    TenantBulkInviteResultEntry,
    TenantCreate,
    TenantMemberInvitationCreate,
    TenantMemberInvitationSchema,
    TenantMemberInvitationStatus,
    TenantMemberInviteOutcome,
    TenantMemberListEntrySchema,
    TenantMembersBulkInvite,
    TenantMembersBulkInviteResponse,
    TenantMembersBulkRemove,
    TenantPrimaryAdminTransfer,
    TenantQuotaStatusSchema,
    TenantSchema,
    TenantUpdate,
)
from app.tenant_member_helpers import (
    assign_workspace_role,
    fetch_workspace_roles_for_members,
    replace_workspace_roles,
    validate_member_role_in_tenant,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tenants"])

_TENANT_ROW_COLUMNS = (
    "id, name, description, slug, enabled, metadata, "
    "rate_limit_requests_per_minute, max_projects, max_versions_per_project, "
    "primary_admin_account_id, "
    "created_at, updated_at, deleted_at"
)


def _actor_account_id(caller: Optional[dict[str, Any]]) -> Optional[str]:
    if not caller:
        return None
    return caller.get("account_id") or caller.get("user_id")


def _get_primary_admin_account_id(tenant_id: str) -> Optional[str]:
    rows = db.execute_query(
        """
        SELECT primary_admin_account_id
        FROM objectified.tenant
        WHERE id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
    )
    if not rows:
        return None
    val = rows[0].get("primary_admin_account_id")
    return str(val) if val is not None else None


def _log_tenant_admin_audit_event(
    tenant_id: str,
    event_type: str,
    *,
    actor_account_id: Optional[str],
    target_account_id: Optional[str] = None,
    previous_primary_account_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Best-effort logging of tenant admin audit events.

    Failures to insert audit rows are logged with context but do not raise,
    so they cannot cause primary admin operations to fail after succeeding.
    """
    try:
        db.execute_mutation(
            """
            INSERT INTO objectified.tenant_admin_audit_event (
                tenant_id, event_type, actor_account_id, target_account_id,
                previous_primary_account_id, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                tenant_id,
                event_type,
                actor_account_id,
                target_account_id,
                previous_primary_account_id,
                json.dumps(metadata or {}),
            ),
            returning=False,
        )
    except Exception:
        logger.exception(
            "Failed to write tenant admin audit event",
            extra={
                "tenant_id": tenant_id,
                "event_type": event_type,
                "actor_account_id": actor_account_id,
                "target_account_id": target_account_id,
                "previous_primary_account_id": previous_primary_account_id,
            },
        )


def _maybe_fill_primary_admin(tenant_id: str, account_id: str) -> None:
    """If the tenant has no primary administrator, assign the given account atomically."""
    db.execute_mutation(
        """
        UPDATE objectified.tenant
        SET primary_admin_account_id = %s
        WHERE id = %s
          AND deleted_at IS NULL
          AND primary_admin_account_id IS NULL
        """,
        (account_id, tenant_id),
        returning=False,
    )


def _assert_not_primary_admin_before_leave(tenant_id: str, account_id: str) -> None:
    primary = _get_primary_admin_account_id(tenant_id)
    if primary and primary == account_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This account is the designated primary administrator. "
                "Transfer that role to another administrator first."
            ),
        )


# ---------------------------------------------------------------------------
# Tenant CRUD
# ---------------------------------------------------------------------------

@router.get(
    "/tenants",
    response_model=List[TenantSchema],
    summary="List tenants",
    description=(
        "List all tenants. Soft-deleted tenants are excluded by default. "
        "Use ``archived_only=true`` for archived tenants only; optional ``search`` "
        "filters by case-insensitive substring on name, slug, and description."
    ),
)
def list_tenants(
    include_deleted: bool = Query(False, description="Include soft-deleted tenants"),
    archived_only: bool = Query(
        False,
        description="When true, return only archived (soft-deleted) tenants.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=200,
        description="Case-insensitive substring match on name, slug, and description.",
    ),
) -> List[TenantSchema]:
    """List tenants with optional archive filter and search."""
    wheres: list[str] = []
    params: list[Any] = []

    if archived_only:
        wheres.append("deleted_at IS NOT NULL")
    elif not include_deleted:
        wheres.append("deleted_at IS NULL")

    term = (search or "").strip().lower()
    if term:
        wheres.append(
            "("
            "POSITION(%s IN LOWER(name)) > 0 OR "
            "POSITION(%s IN LOWER(slug)) > 0 OR "
            "POSITION(%s IN LOWER(COALESCE(description, ''))) > 0"
            ")"
        )
        params.extend([term, term, term])

    where_sql = " AND ".join(wheres) if wheres else "TRUE"
    query = f"""
        SELECT {_TENANT_ROW_COLUMNS}
        FROM objectified.tenant
        WHERE {where_sql}
        ORDER BY created_at ASC
    """
    rows = db.execute_query(query, tuple(params) if params else None)
    return [TenantSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/me",
    response_model=List[TenantSchema],
    summary="List current user's tenants",
    description=(
        "List tenants the authenticated user is a member of (requires JWT). "
        "Returns full tenant details. Soft-deleted tenants are excluded unless "
        "``include_archived=true``."
    ),
)
def list_my_tenants(
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
    include_archived: bool = Query(
        False,
        description="Include tenants that are soft-deleted (archived) but still have membership rows.",
    ),
) -> List[TenantSchema]:
    """List tenants for the current user (JWT only)."""
    user_id = caller.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="This endpoint requires JWT authentication.",
        )
    tenant_refs = get_user_tenants(user_id, include_archived=include_archived)
    if not tenant_refs:
        return []
    ids = [t["id"] for t in tenant_refs]
    placeholders = ",".join(["%s"] * len(ids))
    deleted_filter = "" if include_archived else "AND deleted_at IS NULL"
    query = f"""
        SELECT {_TENANT_ROW_COLUMNS}
        FROM objectified.tenant
        WHERE id IN ({placeholders}) {deleted_filter}
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
            f"""
            SELECT {_TENANT_ROW_COLUMNS}
            FROM objectified.tenant
            WHERE id = %s
            """,
            (tenant_id,),
        )
    else:
        rows = db.execute_query(
            f"""
            SELECT {_TENANT_ROW_COLUMNS}
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
            f"""
            WITH inserted_tenant AS (
                INSERT INTO objectified.tenant (
                    name, description, slug, enabled, metadata, primary_admin_account_id
                )
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                RETURNING {_TENANT_ROW_COLUMNS}
            ),
            inserted_admin AS (
                INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
                SELECT id, %s, 'administrator', true
                FROM inserted_tenant
            )
            SELECT {_TENANT_ROW_COLUMNS}
            FROM inserted_tenant
            """,
            (
                payload.name,
                payload.description,
                payload.slug,
                payload.enabled,
                json.dumps(payload.metadata),
                user_id,
                user_id,
            ),
        )
    else:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.tenant (name, description, slug, enabled, metadata)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            RETURNING {_TENANT_ROW_COLUMNS}
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
    if "rate_limit_requests_per_minute" in payload.model_fields_set:
        updates.append("rate_limit_requests_per_minute = %s")
        params.append(payload.rate_limit_requests_per_minute)
    if "max_projects" in payload.model_fields_set:
        updates.append("max_projects = %s")
        params.append(payload.max_projects)
    if "max_versions_per_project" in payload.model_fields_set:
        updates.append("max_versions_per_project = %s")
        params.append(payload.max_versions_per_project)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(tenant_id)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET {", ".join(updates)}
        WHERE id = %s AND deleted_at IS NULL
        RETURNING {_TENANT_ROW_COLUMNS}
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


@router.post(
    "/tenants/{tenant_id}/restore",
    response_model=TenantSchema,
    summary="Restore archived tenant",
    description=(
        "Clear soft-delete (``deleted_at``) and re-enable the tenant. "
        "**Admin only** (JWT platform administrators)."
    ),
    dependencies=[Depends(require_admin)],
)
def restore_tenant(tenant_id: str) -> TenantSchema:
    """Restore a soft-deleted tenant."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant
        WHERE id = %s AND deleted_at IS NOT NULL
        """,
        (tenant_id,),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Tenant is not archived or does not exist.",
        )
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET deleted_at = NULL, enabled = true
        WHERE id = %s AND deleted_at IS NOT NULL
        RETURNING {_TENANT_ROW_COLUMNS}
        """,
        (tenant_id,),
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Tenant is not archived or does not exist.",
        )
    return TenantSchema(**dict(row))


@router.get(
    "/tenants/{tenant_id}/activity-summary",
    response_model=TenantActivitySummarySchema,
    summary="Tenant activity summary",
    description=(
        "Return project, member, and schema version counts for the tenant, plus an optional "
        "count of dashboard page visits in the last 7 days when the audit table exists. "
        "Requires tenant membership or platform admin."
    ),
)
def get_tenant_activity_summary(
    tenant_id: str,
    _authz: Annotated[
        dict[str, Any],
        Depends(require_tenant_permission("project:read")),
    ],
) -> TenantActivitySummarySchema:
    """Aggregated counts for tenant overview (dashboard)."""
    exists = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s",
        (tenant_id,),
    )
    if not exists:
        raise _not_found("Tenant", tenant_id)

    summary_rows = db.execute_query(
        """
        SELECT
            (
                SELECT COUNT(*)::int
                FROM objectified.project p
                WHERE p.tenant_id = %s AND p.deleted_at IS NULL
            ) AS active_project_count,
            (
                SELECT COUNT(*)::int
                FROM objectified.tenant_account ta
                WHERE ta.tenant_id = %s AND ta.deleted_at IS NULL
            ) AS active_member_count,
            (
                SELECT COUNT(*)::int
                FROM objectified.version v
                JOIN objectified.project p ON p.id = v.project_id
                WHERE p.tenant_id = %s
                  AND v.deleted_at IS NULL
                  AND p.deleted_at IS NULL
            ) AS schema_version_count
        """,
        (tenant_id, tenant_id, tenant_id),
    )
    if not summary_rows:
        return TenantActivitySummarySchema(
            active_project_count=0,
            active_member_count=0,
            schema_version_count=0,
            dashboard_page_visits_last_7_days=None,
        )
    srow = dict(summary_rows[0])

    visit_count: Optional[int] = None
    try:
        vrows = db.execute_query(
            """
            SELECT COUNT(*)::int AS c
            FROM objectified.dashboard_page_visit
            WHERE tenant_id = %s::uuid
              AND visited_at >= (timezone('utc', clock_timestamp()) - interval '7 days')
            """,
            (tenant_id,),
        )
        if vrows:
            visit_count = int(vrows[0]["c"])
    except Exception:
        logger.exception(
            "get_tenant_activity_summary: dashboard_page_visit query failed for tenant %s",
            tenant_id,
        )

    return TenantActivitySummarySchema(
        active_project_count=int(srow["active_project_count"] or 0),
        active_member_count=int(srow["active_member_count"] or 0),
        schema_version_count=int(srow["schema_version_count"] or 0),
        dashboard_page_visits_last_7_days=visit_count,
    )


@router.get(
    "/tenants/{tenant_id}/quota-status",
    response_model=TenantQuotaStatusSchema,
    summary="Tenant quota usage vs limits",
    description=(
        "Returns active project count and configured caps. "
        "When ``project_id`` is provided, also returns the active version count for that project "
        "(the project must belong to the tenant). Requires project:read."
    ),
)
def get_tenant_quota_status(
    tenant_id: str,
    _authz: Annotated[
        dict[str, Any],
        Depends(require_tenant_permission("project:read")),
    ],
    project_id: Optional[str] = Query(
        None,
        description="Optional project UUID; when set, includes active version count for that project.",
    ),
) -> TenantQuotaStatusSchema:
    """Usage vs tenant max_projects and max_versions_per_project for dashboard UI."""
    _assert_tenant_exists(tenant_id)
    cap_rows = db.execute_query(
        """
        SELECT max_projects, max_versions_per_project
        FROM objectified.tenant
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id,),
    )
    if not cap_rows:
        raise _not_found("Tenant", tenant_id)
    max_projects = cap_rows[0].get("max_projects")
    max_versions_per_project = cap_rows[0].get("max_versions_per_project")

    proj_rows = db.execute_query(
        """
        SELECT COUNT(*)::int AS c
        FROM objectified.project
        WHERE tenant_id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
    )
    active_project_count = int(proj_rows[0]["c"]) if proj_rows else 0

    active_version_count_for_project: Optional[int] = None
    if project_id:
        _assert_project_exists(project_id, tenant_id)
        vc_rows = db.execute_query(
            """
            SELECT COUNT(*)::int AS c
            FROM objectified.version v
            INNER JOIN objectified.project p ON p.id = v.project_id AND p.deleted_at IS NULL
            WHERE v.project_id = %s AND v.deleted_at IS NULL
            """,
            (project_id,),
        )
        active_version_count_for_project = int(vc_rows[0]["c"]) if vc_rows else 0

    return TenantQuotaStatusSchema(
        max_projects=int(max_projects) if max_projects is not None else None,
        active_project_count=active_project_count,
        max_versions_per_project=int(max_versions_per_project)
        if max_versions_per_project is not None
        else None,
        active_version_count_for_project=active_version_count_for_project,
    )


def _merge_tenant_appearance_metadata(
    existing: dict[str, Any],
    payload: TenantAppearanceUpdate,
) -> dict[str, Any]:
    meta = dict(existing)
    branding: dict[str, Any]
    raw_b = meta.get("branding")
    if isinstance(raw_b, dict):
        branding = dict(raw_b)
    else:
        branding = {}

    if "logo_url" in payload.model_fields_set:
        if payload.logo_url is None:
            branding.pop("logoUrl", None)
        else:
            branding["logoUrl"] = payload.logo_url
    if "favicon_url" in payload.model_fields_set:
        if payload.favicon_url is None:
            branding.pop("faviconUrl", None)
        else:
            branding["faviconUrl"] = payload.favicon_url
    if "primary_color" in payload.model_fields_set:
        if payload.primary_color is None:
            branding.pop("primaryColor", None)
        else:
            branding["primaryColor"] = payload.primary_color

    if branding:
        meta["branding"] = branding
    else:
        meta.pop("branding", None)

    if "default_theme" in payload.model_fields_set:
        if payload.default_theme is None:
            meta.pop("defaultTheme", None)
        else:
            meta["defaultTheme"] = payload.default_theme

    return meta


@router.put(
    "/tenants/{tenant_id}/appearance",
    response_model=TenantSchema,
    summary="Update tenant appearance",
    description=(
        "Merge branding (logo, favicon, primary color) and default UI theme into ``metadata``. "
        "Send JSON ``null`` for a field to clear it. **Tenant administrators** or **platform admins**."
    ),
)
def update_tenant_appearance(
    tenant_id: str,
    payload: TenantAppearanceUpdate,
    _admin: Annotated[dict[str, Any], Depends(require_tenant_admin)],
) -> TenantSchema:
    """Update tenant branding/theme metadata (tenant or platform administrators)."""
    if not payload.model_fields_set:
        raise HTTPException(status_code=400, detail="No fields to update")

    rows = db.execute_query(
        "SELECT metadata FROM objectified.tenant WHERE id = %s",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)

    existing_meta = rows[0].get("metadata")
    if not isinstance(existing_meta, dict):
        existing_meta = {}

    merged = _merge_tenant_appearance_metadata(existing_meta, payload)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET metadata = %s::jsonb
        WHERE id = %s
        RETURNING {_TENANT_ROW_COLUMNS}
        """,
        (json.dumps(merged), tenant_id),
    )
    if not row:
        raise _not_found("Tenant", tenant_id)
    return TenantSchema(**dict(row))


# ---------------------------------------------------------------------------
# Tenant Members
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/members",
    response_model=List[TenantMemberListEntrySchema],
    summary="List tenant members",
    description=(
        "List all active memberships for a tenant. "
        "Use ``include_roles=true`` to load tenant-scoped workspace roles per member."
    ),
)
def list_tenant_members(
    tenant_id: str,
    include_roles: bool = Query(
        False,
        description="Include workspace (RBAC) roles for each account.",
    ),
) -> List[TenantMemberListEntrySchema]:
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
    if not include_roles:
        return [TenantMemberListEntrySchema(**dict(r), roles=[]) for r in rows]
    ids = [str(r["account_id"]) for r in rows]
    role_map = fetch_workspace_roles_for_members(tenant_id, ids)
    return [
        TenantMemberListEntrySchema(**dict(r), roles=role_map.get(str(r["account_id"]), []))
        for r in rows
    ]


def _email_shape_ok(addr: str) -> bool:
    if len(addr) < 3 or len(addr) > 320 or addr.count("@") != 1:
        return False
    local, domain = addr.split("@", 1)
    return bool(local.strip()) and bool(domain.strip()) and "." in domain


def _tenant_member_list_entry(tenant_id: str, row: dict) -> TenantMemberListEntrySchema:
    d = dict(row)
    roles = fetch_workspace_roles_for_members(tenant_id, [str(d["account_id"])]).get(
        str(d["account_id"]), []
    )
    return TenantMemberListEntrySchema(**d, roles=roles)


def _invitation_row_to_schema(row: dict) -> TenantMemberInvitationSchema:
    d = dict(row)
    status = d.get("status")
    if isinstance(status, str):
        status = TenantMemberInvitationStatus(status)
    return TenantMemberInvitationSchema(
        id=str(d["id"]),
        tenant_id=str(d["tenant_id"]),
        email=str(d["email"]),
        role_id=str(d["role_id"]) if d.get("role_id") is not None else None,
        role_key=str(d["role_key"]) if d.get("role_key") else None,
        role_name=str(d["role_name"]) if d.get("role_name") else None,
        status=status,
        invited_by_account_id=str(d["invited_by_account_id"])
        if d.get("invited_by_account_id")
        else None,
        last_sent_at=d.get("last_sent_at"),
        created_at=d["created_at"],
        updated_at=d.get("updated_at"),
    )


@router.get(
    "/tenants/{tenant_id}/members/invitations",
    response_model=List[TenantMemberInvitationSchema],
    summary="List pending member invitations",
    description="Pending email invitations to join the tenant as a member. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def list_tenant_member_invitations(tenant_id: str) -> List[TenantMemberInvitationSchema]:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT i.id, i.tenant_id, i.email, i.role_id, i.status,
               i.invited_by_account_id, i.last_sent_at, i.created_at, i.updated_at,
               r.key AS role_key, r.name AS role_name
        FROM objectified.tenant_member_invitation i
        LEFT JOIN objectified.role r ON r.id = i.role_id AND r.deleted_at IS NULL
        WHERE i.tenant_id = %s
          AND i.status = 'pending'
          AND i.deleted_at IS NULL
        ORDER BY i.created_at ASC
        """,
        (tenant_id,),
    )
    return [_invitation_row_to_schema(dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/members/invite-email",
    response_model=TenantMemberInviteOutcome,
    status_code=201,
    summary="Invite member by email",
    description=(
        "If an account exists for the email, adds tenant membership (member) and optional workspace role. "
        "Otherwise creates a pending invitation until the user registers. **Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def invite_tenant_member_by_email(
    tenant_id: str,
    payload: TenantMemberInvitationCreate,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> TenantMemberInviteOutcome:
    _assert_tenant_exists(tenant_id)
    email = payload.email.strip().lower()
    if not _email_shape_ok(email):
        raise HTTPException(status_code=422, detail="Invalid email address.")
    if payload.member_role_id:
        validate_member_role_in_tenant(tenant_id, payload.member_role_id)
    invited_by = caller.get("user_id") or caller.get("account_id")

    acc_rows = db.execute_query(
        """
        SELECT id FROM objectified.account
        WHERE LOWER(email) = LOWER(%s) AND deleted_at IS NULL
        LIMIT 1
        """,
        (email,),
    )
    if acc_rows:
        account_id = str(acc_rows[0]["id"])
        existing = db.execute_query(
            """
            SELECT id FROM objectified.tenant_account
            WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (tenant_id, account_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Account is already a member of this tenant.",
            )
        row = db.execute_mutation(
            """
            INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
            VALUES (%s, %s, 'member', true)
            RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
            """,
            (tenant_id, account_id),
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to add member")
        if payload.member_role_id:
            assign_workspace_role(tenant_id, account_id, payload.member_role_id)
        return TenantMemberInviteOutcome(
            kind="member",
            member=_tenant_member_list_entry(tenant_id, dict(row)),
            invitation=None,
        )

    pending = db.execute_query(
        """
        SELECT id FROM objectified.tenant_member_invitation
        WHERE tenant_id = %s
          AND LOWER(email) = LOWER(%s)
          AND status = 'pending'
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, email),
    )
    if pending:
        raise HTTPException(
            status_code=409,
            detail="A pending invitation already exists for this email.",
        )
    inv_row = db.execute_mutation(
        """
        INSERT INTO objectified.tenant_member_invitation
            (tenant_id, email, role_id, status, invited_by_account_id, last_sent_at)
        VALUES (%s, %s, %s, 'pending', %s, timezone('utc', clock_timestamp()))
        RETURNING id, tenant_id, email, role_id, status,
            invited_by_account_id, last_sent_at, created_at, updated_at
        """,
        (tenant_id, email, payload.member_role_id, invited_by),
    )
    if not inv_row:
        raise HTTPException(status_code=500, detail="Failed to create invitation")
    inv_id = str(dict(inv_row)["id"])
    full = db.execute_query(
        """
        SELECT i.id, i.tenant_id, i.email, i.role_id, i.status,
               i.invited_by_account_id, i.last_sent_at, i.created_at, i.updated_at,
               r.key AS role_key, r.name AS role_name
        FROM objectified.tenant_member_invitation i
        LEFT JOIN objectified.role r ON r.id = i.role_id AND r.deleted_at IS NULL
        WHERE i.id = %s
        LIMIT 1
        """,
        (inv_id,),
    )
    if not full:
        raise HTTPException(status_code=500, detail="Failed to load invitation")
    return TenantMemberInviteOutcome(
        kind="pending_invitation",
        member=None,
        invitation=_invitation_row_to_schema(dict(full[0])),
    )


@router.post(
    "/tenants/{tenant_id}/members/invitations/{invitation_id}/resend",
    response_model=TenantMemberInvitationSchema,
    summary="Resend member invitation",
    description="Updates ``last_sent_at`` for a pending invitation. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def resend_tenant_member_invitation(
    tenant_id: str, invitation_id: str
) -> TenantMemberInvitationSchema:
    _assert_tenant_exists(tenant_id)
    row = db.execute_mutation(
        """
        UPDATE objectified.tenant_member_invitation
        SET last_sent_at = timezone('utc', clock_timestamp())
        WHERE id = %s
          AND tenant_id = %s
          AND status = 'pending'
          AND deleted_at IS NULL
        RETURNING id
        """,
        (invitation_id, tenant_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pending invitation not found.")
    full = db.execute_query(
        """
        SELECT i.id, i.tenant_id, i.email, i.role_id, i.status,
               i.invited_by_account_id, i.last_sent_at, i.created_at, i.updated_at,
               r.key AS role_key, r.name AS role_name
        FROM objectified.tenant_member_invitation i
        LEFT JOIN objectified.role r ON r.id = i.role_id AND r.deleted_at IS NULL
        WHERE i.id = %s AND i.tenant_id = %s
        LIMIT 1
        """,
        (invitation_id, tenant_id),
    )
    if not full:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    return _invitation_row_to_schema(dict(full[0]))


@router.delete(
    "/tenants/{tenant_id}/members/invitations/{invitation_id}",
    status_code=204,
    summary="Cancel member invitation",
    description="Cancel a pending invitation. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def cancel_tenant_member_invitation(tenant_id: str, invitation_id: str) -> None:
    _assert_tenant_exists(tenant_id)
    updated = db.execute_mutation(
        """
        UPDATE objectified.tenant_member_invitation
        SET status = 'cancelled',
            deleted_at = timezone('utc', clock_timestamp())
        WHERE id = %s
          AND tenant_id = %s
          AND status = 'pending'
          AND deleted_at IS NULL
        RETURNING id
        """,
        (invitation_id, tenant_id),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Pending invitation not found.")


@router.post(
    "/tenants/{tenant_id}/members/bulk-invite",
    response_model=TenantMembersBulkInviteResponse,
    summary="Bulk invite tenant members by email",
    description=(
        "Resolve each email to an active account and add or promote membership. "
        "``access_level`` ``member`` adds members; ``administrator`` adds or promotes "
        "to administrator. Emails not matching an account return ``not_found`` unless "
        "``invite_unknown_emails`` is true (member only), which creates a ``pending_invitation``. "
        "Optional ``member_role_id`` assigns a tenant workspace role for new member rows. "
        "**Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def bulk_invite_tenant_members(
    tenant_id: str,
    payload: TenantMembersBulkInvite,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> TenantMembersBulkInviteResponse:
    """Add or promote many tenant memberships by email (admin)."""
    _assert_tenant_exists(tenant_id)
    want_admin = payload.access_level == TenantAccessLevel.ADMINISTRATOR
    invited_by = caller.get("user_id") or caller.get("account_id")

    if payload.member_role_id:
        validate_member_role_in_tenant(tenant_id, payload.member_role_id)

    seen: set[str] = set()
    ordered: list[str] = []
    for raw in payload.emails:
        e = raw.strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        ordered.append(e)

    results: list[TenantBulkInviteResultEntry] = []

    # Separate invalid emails upfront so they don't pollute the bulk queries.
    valid_emails: list[str] = []
    for email in ordered:
        if not _email_shape_ok(email):
            results.append(TenantBulkInviteResultEntry(email=email, status="invalid_email"))
        else:
            valid_emails.append(email)

    if not valid_emails:
        return TenantMembersBulkInviteResponse(results=results)

    # Bulk-fetch all accounts matching the valid emails in a single query.
    # Emails in valid_emails are already lowercased (normalised above), but
    # explicitly lowercase again here to make the intent clear.
    lower_valid_emails = [e.lower() for e in valid_emails]
    acc_rows = db.execute_query(
        """
        SELECT id, LOWER(email) AS email FROM objectified.account
        WHERE LOWER(email) = ANY(%s) AND deleted_at IS NULL
        """,
        (lower_valid_emails,),
    )
    email_to_account_id: dict[str, str] = {r["email"]: str(r["id"]) for r in acc_rows}

    found_account_ids = list(email_to_account_id.values())

    # Bulk-fetch all existing memberships for found accounts in a single query.
    existing_map: dict[str, str] = {}  # account_id -> access_level
    if found_account_ids:
        membership_rows = db.execute_query(
            """
            SELECT account_id, access_level FROM objectified.tenant_account
            WHERE tenant_id = %s AND account_id = ANY(%s) AND deleted_at IS NULL
            """,
            (tenant_id, found_account_ids),
        )
        existing_map = {str(r["account_id"]): r["access_level"] for r in membership_rows}

    # Bulk-fetch existing pending invitations for all unknown emails in a single query,
    # avoiding an N+1 pattern when invite_unknown_emails is requested.
    unknown_emails = [e for e in valid_emails if e not in email_to_account_id]
    existing_pending_set: set[str] = set()
    if (
        unknown_emails
        and not want_admin
        and payload.invite_unknown_emails
        and payload.access_level == TenantAccessLevel.MEMBER
    ):
        pending_rows = db.execute_query(
            """
            SELECT LOWER(email) AS email FROM objectified.tenant_member_invitation
            WHERE tenant_id = %s
              AND LOWER(email) = ANY(%s)
              AND status = 'pending'
              AND deleted_at IS NULL
            """,
            (tenant_id, unknown_emails),
        )
        existing_pending_set = {r["email"] for r in pending_rows}

    # Process each valid email using the pre-fetched data.
    for email in valid_emails:
        account_id = email_to_account_id.get(email)
        if account_id is None:
            if (
                not want_admin
                and payload.invite_unknown_emails
                and payload.access_level == TenantAccessLevel.MEMBER
            ):
                if email in existing_pending_set:
                    results.append(
                        TenantBulkInviteResultEntry(
                            email=email, status="already_invited", account_id=None
                        )
                    )
                else:
                    inv_row = db.execute_mutation(
                        """
                        INSERT INTO objectified.tenant_member_invitation
                            (tenant_id, email, role_id, status, invited_by_account_id, last_sent_at)
                        VALUES (%s, %s, %s, 'pending', %s, timezone('utc', clock_timestamp()))
                        RETURNING id
                        """,
                        (tenant_id, email, payload.member_role_id, invited_by),
                    )
                    if inv_row:
                        results.append(
                            TenantBulkInviteResultEntry(
                                email=email, status="pending_invitation", account_id=None
                            )
                        )
                    else:
                        results.append(
                            TenantBulkInviteResultEntry(email=email, status="not_found")
                        )
            else:
                results.append(TenantBulkInviteResultEntry(email=email, status="not_found"))
            continue

        current_level = existing_map.get(account_id)
        if current_level is not None:
            if want_admin:
                if current_level == "administrator":
                    results.append(
                        TenantBulkInviteResultEntry(
                            email=email, status="already_member", account_id=account_id
                        )
                    )
                else:
                    row = db.execute_mutation(
                        """
                        UPDATE objectified.tenant_account
                        SET access_level = 'administrator'
                        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
                        RETURNING id, tenant_id, account_id, access_level, enabled,
                            created_at, updated_at, deleted_at
                        """,
                        (tenant_id, account_id),
                    )
                    if not row:
                        results.append(
                            TenantBulkInviteResultEntry(
                                email=email, status="not_found", account_id=account_id
                            )
                        )
                    else:
                        _log_tenant_admin_audit_event(
                            tenant_id,
                            "admin_promoted",
                            actor_account_id=invited_by,
                            target_account_id=account_id,
                        )
                        _maybe_fill_primary_admin(tenant_id, account_id)
                        results.append(
                            TenantBulkInviteResultEntry(
                                email=email, status="promoted", account_id=account_id
                            )
                        )
            else:
                results.append(
                    TenantBulkInviteResultEntry(
                        email=email, status="already_member", account_id=account_id
                    )
                )
            continue

        access_level_val = "administrator" if want_admin else "member"
        row = db.execute_mutation(
            """
            INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
            VALUES (%s, %s, %s, true)
            RETURNING id, tenant_id, account_id, access_level, enabled,
                created_at, updated_at, deleted_at
            """,
            (tenant_id, account_id, access_level_val),
        )
        if not row:
            results.append(
                TenantBulkInviteResultEntry(email=email, status="not_found", account_id=account_id)
            )
        else:
            if not want_admin and payload.member_role_id:
                assign_workspace_role(tenant_id, account_id, payload.member_role_id)
            if want_admin:
                _log_tenant_admin_audit_event(
                    tenant_id,
                    "admin_added",
                    actor_account_id=invited_by,
                    target_account_id=account_id,
                )
                _maybe_fill_primary_admin(tenant_id, account_id)
            results.append(
                TenantBulkInviteResultEntry(email=email, status="added", account_id=account_id)
            )

    return TenantMembersBulkInviteResponse(results=results)


@router.post(
    "/tenants/{tenant_id}/members/bulk-remove",
    status_code=204,
    summary="Bulk remove tenant members",
    description=(
        "Soft-delete tenant memberships for the given account IDs. Missing IDs are ignored. "
        "**Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def bulk_remove_tenant_members(
    tenant_id: str,
    payload: TenantMembersBulkRemove,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> None:
    _assert_tenant_exists(tenant_id)
    seen: set[str] = set()
    account_ids: list[str] = []
    for raw_id in payload.account_ids:
        aid = raw_id.strip()
        if not aid or aid in seen:
            continue
        seen.add(aid)
        account_ids.append(aid)

    if not account_ids:
        return

    primary = _get_primary_admin_account_id(tenant_id)
    if primary and primary in account_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot bulk-remove the designated primary administrator. "
                "Transfer that role first, or omit that account from the request."
            ),
        )

    admin_targets = db.execute_query(
        """
        SELECT account_id
        FROM objectified.tenant_account
        WHERE tenant_id = %s
          AND account_id = ANY(%s)
          AND access_level = 'administrator'
          AND deleted_at IS NULL
        """,
        (tenant_id, account_ids),
    )
    actor = _actor_account_id(caller)

    db.execute_mutation(
        """
        UPDATE objectified.tenant_account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s
          AND account_id = ANY(%s)
          AND deleted_at IS NULL
        """,
        (tenant_id, account_ids),
        returning=False,
    )

    for r in admin_targets:
        _log_tenant_admin_audit_event(
            tenant_id,
            "admin_removed",
            actor_account_id=actor,
            target_account_id=str(r["account_id"]),
        )


@router.post(
    "/tenants/{tenant_id}/members",
    response_model=TenantMemberListEntrySchema,
    status_code=201,
    summary="Add tenant member",
    description=(
        "Add an account to a tenant with a given access level. "
        "The account can be identified by ``account_id`` (UUID) or ``email``. "
        "If both are provided, ``account_id`` takes precedence."
    ),
    dependencies=[Depends(require_admin)],
)
def add_tenant_member(
    tenant_id: str,
    payload: TenantAccountCreate,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> TenantMemberListEntrySchema:
    """Add a member to a tenant by account_id or email."""
    _assert_tenant_exists(tenant_id)
    _validate_payload_tenant_id(payload.tenant_id, tenant_id)
    if (
        payload.member_role_id
        and payload.access_level == TenantAccessLevel.MEMBER
    ):
        validate_member_role_in_tenant(tenant_id, payload.member_role_id)
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
    if (
        payload.access_level == TenantAccessLevel.MEMBER
        and payload.member_role_id
    ):
        assign_workspace_role(tenant_id, resolved_account_id, payload.member_role_id)
    if payload.access_level == TenantAccessLevel.ADMINISTRATOR:
        _log_tenant_admin_audit_event(
            tenant_id,
            "admin_added",
            actor_account_id=_actor_account_id(caller),
            target_account_id=resolved_account_id,
        )
        _maybe_fill_primary_admin(tenant_id, resolved_account_id)
    return _tenant_member_list_entry(tenant_id, dict(row))


@router.delete(
    "/tenants/{tenant_id}/members/{account_id}",
    status_code=204,
    summary="Remove tenant member",
    description="Remove (soft-delete) an account from a tenant. **Admin only.**",
    dependencies=[Depends(require_admin)],
)
def remove_tenant_member(
    tenant_id: str,
    account_id: str,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> None:
    """Remove a member from a tenant (soft-delete)."""
    rows = db.execute_query(
        """
        SELECT id, access_level FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    was_admin = rows[0].get("access_level") == "administrator"
    if was_admin:
        _assert_not_primary_admin_before_leave(tenant_id, account_id)

    db.execute_mutation(
        """
        UPDATE objectified.tenant_account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
        returning=False,
    )

    if was_admin:
        _log_tenant_admin_audit_event(
            tenant_id,
            "admin_removed",
            actor_account_id=_actor_account_id(caller),
            target_account_id=account_id,
        )


@router.put(
    "/tenants/{tenant_id}/members/{account_id}",
    response_model=TenantMemberListEntrySchema,
    summary="Update tenant member",
    description=(
        "Update access level, enabled flag, and/or tenant-scoped workspace role assignments. "
        "Send ``member_role_id`` as null to clear explicit roles (viewer baseline). **Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def update_tenant_member(
    tenant_id: str,
    account_id: str,
    payload: TenantAccountUpdate,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> TenantMemberListEntrySchema:
    """Update a tenant member's access level, enabled status, or workspace roles."""
    rows = db.execute_query(
        """
        SELECT id, access_level FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    prior_level = rows[0].get("access_level")
    actor = _actor_account_id(caller)

    raw = payload.model_dump(exclude_unset=True)
    updates: list[str] = []
    params: list = []

    if payload.access_level is not None:
        if prior_level == "administrator" and payload.access_level == TenantAccessLevel.MEMBER:
            _assert_not_primary_admin_before_leave(tenant_id, account_id)
        updates.append("access_level = %s")
        params.append(payload.access_level.value)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if updates:
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
    else:
        full = db.execute_query(
            """
            SELECT id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
            FROM objectified.tenant_account
            WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (tenant_id, account_id),
        )
        if not full:
            raise HTTPException(status_code=404, detail="Member not found in this tenant")
        row = full[0]

    if "member_role_id" in raw:
        level = dict(row).get("access_level")
        if level in (TenantAccessLevel.MEMBER, "member"):
            rid = raw["member_role_id"]
            if rid is not None:
                validate_member_role_in_tenant(tenant_id, rid)
            replace_workspace_roles(tenant_id, account_id, rid)
        elif raw["member_role_id"] is not None:
            raise HTTPException(
                status_code=422,
                detail="member_role_id applies only to members, not administrators.",
            )

    if not updates and "member_role_id" not in raw:
        raise HTTPException(status_code=400, detail="No fields to update")

    final_level = dict(row).get("access_level")
    if payload.access_level is not None:
        if prior_level == "administrator" and final_level == "member":
            _log_tenant_admin_audit_event(
                tenant_id,
                "admin_demoted",
                actor_account_id=actor,
                target_account_id=account_id,
            )
        elif prior_level == "member" and final_level == "administrator":
            _log_tenant_admin_audit_event(
                tenant_id,
                "admin_promoted",
                actor_account_id=actor,
                target_account_id=account_id,
            )
            _maybe_fill_primary_admin(tenant_id, account_id)

    return _tenant_member_list_entry(tenant_id, dict(row))


# ---------------------------------------------------------------------------
# Tenant Administrators
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/administrator-audit-events",
    response_model=List[TenantAdminAuditEventSchema],
    summary="List tenant administrator audit events",
    description=(
        "Return recent append-only audit entries for administrator membership changes "
        "and primary-administrator transfers. **Tenant administrators** and **platform "
        "administrators** may access this list."
    ),
)
def list_tenant_administrator_audit_events(
    tenant_id: str,
    _caller: Annotated[dict[str, Any], Depends(require_tenant_admin)],
    limit: int = Query(50, ge=1, le=100, description="Maximum rows to return (most recent first)."),
) -> List[TenantAdminAuditEventSchema]:
    """List administrator audit events for a tenant."""
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, event_type, actor_account_id, target_account_id,
               previous_primary_account_id, metadata, created_at
        FROM objectified.tenant_admin_audit_event
        WHERE tenant_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (tenant_id, limit),
    )
    result: list[TenantAdminAuditEventSchema] = []
    for r in rows:
        d = dict(r)
        for key in ("actor_account_id", "target_account_id", "previous_primary_account_id"):
            if d.get(key) is not None:
                d[key] = str(d[key])
        if not isinstance(d.get("metadata"), dict):
            d["metadata"] = {}
        result.append(TenantAdminAuditEventSchema(**d))
    return result


@router.post(
    "/tenants/{tenant_id}/primary-administrator",
    response_model=TenantSchema,
    summary="Transfer primary tenant administrator",
    description=(
        "Designate another active administrator as the primary (ownership) administrator. "
        "Requires **tenant administrator** access. Only the **current primary** or a "
        "**platform administrator** may transfer when a primary is already set. "
        "``confirm_tenant_slug`` must match the tenant slug exactly (case-sensitive)."
    ),
)
def transfer_tenant_primary_administrator(
    tenant_id: str,
    payload: TenantPrimaryAdminTransfer,
    caller: Annotated[dict[str, Any], Depends(require_tenant_admin)],
) -> TenantSchema:
    """Transfer designated primary administrator (GitHub #194)."""
    _assert_tenant_exists(tenant_id)
    trows = db.execute_query(
        """
        SELECT slug, primary_admin_account_id
        FROM objectified.tenant
        WHERE id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
    )
    if not trows:
        raise _not_found("Tenant", tenant_id)
    slug = trows[0]["slug"]
    if payload.confirm_tenant_slug != slug:
        raise HTTPException(
            status_code=422,
            detail="confirm_tenant_slug does not match this tenant's slug.",
        )

    cur = trows[0].get("primary_admin_account_id")
    current_s = str(cur) if cur is not None else None
    actor = _actor_account_id(caller)
    is_platform = bool(caller.get("is_admin"))

    if current_s:
        if not is_platform and actor != current_s:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Only the current primary administrator or a platform administrator "
                    "can transfer the primary administrator role."
                ),
            )

    adm = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account
        WHERE tenant_id = %s
          AND account_id = %s
          AND access_level = 'administrator'
          AND deleted_at IS NULL
          AND enabled = true
        LIMIT 1
        """,
        (tenant_id, payload.new_primary_account_id),
    )
    if not adm:
        raise HTTPException(
            status_code=422,
            detail="new_primary_account_id must be an active tenant administrator.",
        )

    if current_s and current_s == payload.new_primary_account_id:
        raise HTTPException(
            status_code=422,
            detail="The selected account is already the primary administrator.",
        )

    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET primary_admin_account_id = %s
        WHERE id = %s AND deleted_at IS NULL
        RETURNING {_TENANT_ROW_COLUMNS}
        """,
        (payload.new_primary_account_id, tenant_id),
    )
    if not row:
        raise _not_found("Tenant", tenant_id)

    _log_tenant_admin_audit_event(
        tenant_id,
        "primary_admin_transferred",
        actor_account_id=actor,
        target_account_id=payload.new_primary_account_id,
        previous_primary_account_id=current_s,
    )
    return TenantSchema(**dict(row))


@router.get(
    "/tenants/{tenant_id}/administrators",
    response_model=List[TenantAccountSchema],
    summary="List tenant administrators",
    description=(
        "List all active members with access_level=administrator for a tenant. "
        "Requires **tenant administrator** or **platform administrator** authentication."
    ),
)
def list_tenant_administrators(
    tenant_id: str,
    _caller: Annotated[dict[str, Any], Depends(require_tenant_admin)],
) -> List[TenantAccountSchema]:
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
    tenant_id: str,
    payload: TenantAdministratorCreate,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> TenantAccountSchema:
    """Add or promote an administrator in a tenant (admin only)."""
    _assert_tenant_exists(tenant_id)
    _validate_payload_tenant_id(payload.tenant_id, tenant_id)
    resolved_account_id = _resolve_account_id(payload.account_id, payload.email)
    actor = _actor_account_id(caller)

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
        _log_tenant_admin_audit_event(
            tenant_id,
            "admin_promoted",
            actor_account_id=actor,
            target_account_id=resolved_account_id,
        )
        _maybe_fill_primary_admin(tenant_id, resolved_account_id)
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
    _log_tenant_admin_audit_event(
        tenant_id,
        "admin_added",
        actor_account_id=actor,
        target_account_id=resolved_account_id,
    )
    _maybe_fill_primary_admin(tenant_id, resolved_account_id)
    return TenantAccountSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/administrators/{account_id}",
    status_code=204,
    summary="Remove tenant administrator",
    description=(
        "Soft-delete the administrator tenant_account row for the given account. "
        "Cannot remove the designated primary administrator until that role is transferred. "
        "**Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def remove_tenant_administrator(
    tenant_id: str,
    account_id: str,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
) -> None:
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

    _assert_not_primary_admin_before_leave(tenant_id, account_id)

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
    _log_tenant_admin_audit_event(
        tenant_id,
        "admin_removed",
        actor_account_id=_actor_account_id(caller),
        target_account_id=account_id,
    )

