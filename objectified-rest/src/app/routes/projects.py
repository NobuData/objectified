"""REST routes for /v1/tenants/{tenant_id}/projects — Project CRUD."""

import copy
import json
import logging
import re
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated, require_tenant_permission
from app.database import db
from app.quotas import ensure_project_quota_allows_create, ensure_version_quota_allows_create
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.routes.version_commits import _apply_snapshot_state, _create_snapshot
from app.routes.versions import (
    _VERSION_COLUMNS,
    _capture_version_state,
    _insert_version_row,
    _normalize_code_generation_tag,
    _record_history as _record_version_history,
)
from app.schemas.project import (
    ProjectClone,
    ProjectCloneResult,
    ProjectCreate,
    ProjectHistorySchema,
    ProjectSchema,
    ProjectUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Projects"])

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")

_PROJECT_COLUMNS = (
    "id, tenant_id, creator_id, name, description, slug, enabled, metadata, "
    "created_at, updated_at, deleted_at"
)


def _validate_slug(slug: str) -> str:
    """Normalise and validate a project slug. Returns the normalised value."""
    slug = slug.strip().lower()
    if not slug:
        raise HTTPException(status_code=400, detail="Project slug is required")
    if len(slug) < 2:
        raise HTTPException(status_code=400, detail="Project slug must be at least 2 characters")
    if len(slug) > 80:
        raise HTTPException(status_code=400, detail="Project slug must be 80 characters or less")
    if not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="Project slug can only contain lowercase letters, numbers, hyphens, and underscores",
        )
    return slug


# ---------------------------------------------------------------------------
# Projects CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/tenants/{tenant_id}/projects",
    response_model=List[ProjectSchema],
    summary="List projects for a tenant",
    description=(
        "Return all projects scoped to the given tenant. "
        "Soft-deleted projects are excluded by default; pass ``include_deleted=true`` to include them."
    ),
)
def list_projects(
    tenant_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted projects"),
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ProjectSchema]:
    """List projects for a tenant."""
    _assert_tenant_exists(tenant_id)

    if include_deleted:
        rows = db.execute_query(
            f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
            "WHERE tenant_id = %s ORDER BY created_at ASC",
            (tenant_id,),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
            "WHERE tenant_id = %s AND deleted_at IS NULL ORDER BY created_at ASC",
            (tenant_id,),
        )
    return [ProjectSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}/projects/deleted",
    response_model=List[ProjectSchema],
    summary="List deleted projects for a tenant",
    description="Return only soft-deleted projects for undelete or historical rename workflows.",
)
def list_deleted_projects(
    tenant_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ProjectSchema]:
    """List only soft-deleted projects for a tenant."""
    _assert_tenant_exists(tenant_id)

    rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
        "WHERE tenant_id = %s AND deleted_at IS NOT NULL "
        "ORDER BY deleted_at DESC, created_at ASC",
        (tenant_id,),
    )
    return [ProjectSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}",
    response_model=ProjectSchema,
    summary="Get project by ID",
    description="Retrieve a single project by its UUID within a tenant.",
)
def get_project(
    tenant_id: str,
    project_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted project"),
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Get a project by ID."""
    _assert_tenant_exists(tenant_id)

    if include_deleted:
        rows = db.execute_query(
            f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
            "WHERE id = %s AND tenant_id = %s",
            (project_id, tenant_id),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
            "WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL",
            (project_id, tenant_id),
        )
    if not rows:
        raise _not_found("Project", project_id)
    return ProjectSchema(**dict(rows[0]))


@router.post(
    "/tenants/{tenant_id}/projects",
    response_model=ProjectSchema,
    status_code=201,
    summary="Create project",
    description=(
        "Create a new project scoped to the given tenant. "
        "Slug must be unique within the tenant."
    ),
)
def create_project(
    tenant_id: str,
    payload: ProjectCreate,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Create a new project."""
    _assert_tenant_exists(tenant_id)
    ensure_project_quota_allows_create(tenant_id)

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Project name is required")

    # Validate payload.tenant_id — must match the path parameter if provided
    if payload.tenant_id is not None and payload.tenant_id != tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Payload tenant_id does not match path tenant_id",
        )

    # Resolve creator_id from the authenticated caller
    caller_user_id = caller.get("user_id") if caller else None

    # Validate payload.creator_id — clients must not override the authenticated identity
    if payload.creator_id is not None:
        if caller_user_id and payload.creator_id != caller_user_id:
            raise HTTPException(
                status_code=400,
                detail="Payload creator_id does not match the authenticated user",
            )

    creator_id = caller_user_id or payload.creator_id
    if not creator_id:
        raise HTTPException(status_code=400, detail="creator_id is required when not authenticated")

    slug = _validate_slug(payload.slug)

    # Per-tenant slug uniqueness is enforced only for active projects.
    existing = db.execute_query(
        "SELECT id FROM objectified.project "
        "WHERE tenant_id = %s AND slug = %s AND deleted_at IS NULL",
        (tenant_id, slug),
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug already in use within this tenant: {slug}")


    try:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.project
                (tenant_id, creator_id, name, description, slug, enabled, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING {_PROJECT_COLUMNS}
            """,
            (
                tenant_id,
                creator_id,
                payload.name.strip(),
                payload.description,
                slug,
                payload.enabled,
                json.dumps(payload.metadata),
            ),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"A project with slug '{slug}' already exists in this tenant",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to create project") from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create project")

    # Record history
    _record_history(
        project_id=str(row["id"]),
        tenant_id=tenant_id,
        changed_by=creator_id,
        operation="INSERT",
        old_data=None,
        new_data=dict(row),
    )

    return ProjectSchema(**dict(row))


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/clone",
    response_model=ProjectCloneResult,
    status_code=201,
    summary="Clone project",
    description=(
        "Create a new project as a copy of an existing project in the same tenant. "
        "When ``copy_latest_version`` is true and the source has at least one version, "
        "the newest version's schema (classes, properties, and canvas metadata) is "
        "copied into an initial version on the new project."
    ),
)
def clone_project(
    tenant_id: str,
    project_id: str,
    payload: ProjectClone,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectCloneResult:
    """Clone a project, optionally copying the latest version's schema state."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    ensure_project_quota_allows_create(tenant_id)

    source_rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
        "WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL",
        (project_id, tenant_id),
    )
    if not source_rows:
        raise _not_found("Project", project_id)
    source_row = dict(source_rows[0])

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Project name is required")

    caller_user_id = caller.get("user_id") if caller else None
    caller_account_id = caller.get("account_id") if caller else None
    creator_id = caller_user_id or caller_account_id
    if not creator_id:
        raise HTTPException(status_code=400, detail="creator_id is required when not authenticated")

    slug = _validate_slug(payload.slug)

    existing = db.execute_query(
        "SELECT id FROM objectified.project "
        "WHERE tenant_id = %s AND slug = %s AND deleted_at IS NULL",
        (tenant_id, slug),
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug already in use within this tenant: {slug}")

    description = (
        payload.description.strip()
        if payload.description is not None
        else (source_row.get("description") or "")
    )
    meta: dict[str, Any]
    if payload.metadata is not None:
        meta = dict(payload.metadata)
    else:
        raw_meta = source_row.get("metadata")
        meta = copy.deepcopy(raw_meta) if isinstance(raw_meta, dict) else {}

    latest_rows = db.execute_query(
        f"""
        SELECT {_VERSION_COLUMNS}
        FROM objectified.version
        WHERE project_id = %s AND deleted_at IS NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
        """,
        (project_id,),
    )
    source_version: Optional[dict[str, Any]] = dict(latest_rows[0]) if latest_rows else None

    snapshot_state: Optional[dict[str, Any]] = None
    if payload.copy_latest_version and source_version is not None:
        sv_id = str(source_version["id"])
        snapshot_state = _capture_version_state(sv_id)
        vm = source_version.get("metadata")
        if isinstance(vm, dict):
            snapshot_state["canvas_metadata"] = vm.get("canvas_metadata")
        else:
            snapshot_state["canvas_metadata"] = None

    def _insert_new_project_row(_conn: Any = None) -> dict[str, Any]:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.project
                (tenant_id, creator_id, name, description, slug, enabled, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING {_PROJECT_COLUMNS}
            """,
            (
                tenant_id,
                creator_id,
                payload.name.strip(),
                description,
                slug,
                True,
                json.dumps(meta),
            ),
            _conn=_conn,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to clone project")
        return dict(row)

    cloned_version_id: Optional[str] = None

    if snapshot_state is None:
        try:
            new_row = _insert_new_project_row()
        except Exception as exc:
            if "23505" in str(exc) or "unique constraint" in str(exc).lower():
                raise HTTPException(
                    status_code=409,
                    detail=f"A project with slug '{slug}' already exists in this tenant",
                ) from exc
            raise HTTPException(status_code=500, detail="Failed to clone project") from exc

        _record_history(
            project_id=str(new_row["id"]),
            tenant_id=tenant_id,
            changed_by=caller_user_id,
            operation="CLONE",
            old_data={"source_project_id": project_id},
            new_data=new_row,
        )
        return ProjectCloneResult(project=ProjectSchema(**new_row), cloned_version_id=None)

    sv = source_version
    assert sv is not None

    raw_tag = sv.get("code_generation_tag")
    try:
        code_tag = _normalize_code_generation_tag(raw_tag) if raw_tag else None
    except HTTPException:
        code_tag = None

    version_name = (payload.cloned_version_name or "").strip()
    if not version_name:
        base = (sv.get("name") or "Version").strip() or "Version"
        version_name = f"{base} (copy)"

    vm_insert = sv.get("metadata")
    version_metadata: dict[str, Any]
    if isinstance(vm_insert, dict):
        version_metadata = copy.deepcopy(vm_insert)
    else:
        version_metadata = {}

    with db.transaction() as conn:
        try:
            new_row = _insert_new_project_row(_conn=conn)
        except Exception as exc:
            if "23505" in str(exc) or "unique constraint" in str(exc).lower():
                raise HTTPException(
                    status_code=409,
                    detail=f"A project with slug '{slug}' already exists in this tenant",
                ) from exc
            raise HTTPException(status_code=500, detail="Failed to clone project") from exc

        new_project_id = str(new_row["id"])
        ensure_version_quota_allows_create(tenant_id, new_project_id)

        _record_history(
            project_id=new_project_id,
            tenant_id=tenant_id,
            changed_by=caller_user_id,
            operation="CLONE",
            old_data={"source_project_id": project_id},
            new_data=new_row,
            _conn=conn,
        )

        try:
            ver_row = _insert_version_row(
                project_id=new_project_id,
                creator_id=creator_id,
                name=version_name,
                description=sv.get("description") or "",
                code_generation_tag=code_tag,
                change_log=sv.get("change_log"),
                enabled=bool(sv.get("enabled", True)),
                published=False,
                visibility=sv.get("visibility"),
                metadata=version_metadata,
                source_version_id=str(sv["id"]),
                _conn=conn,
            )
        except Exception as exc:
            if "23505" in str(exc) or "unique constraint" in str(exc).lower():
                raise HTTPException(
                    status_code=409,
                    detail="code_generation_tag is already used by another version in this project.",
                ) from exc
            raise

        if not ver_row:
            raise HTTPException(status_code=500, detail="Failed to create cloned version")

        new_version_id = str(ver_row["id"])
        cloned_version_id = new_version_id

        _record_version_history(
            version_id=new_version_id,
            project_id=new_project_id,
            changed_by=caller_user_id,
            operation="INSERT",
            old_data=None,
            new_data=dict(ver_row),
            _conn=conn,
        )

        _apply_snapshot_state(new_version_id, new_project_id, snapshot_state, _conn=conn)

        _create_snapshot(
            version_id=new_version_id,
            project_id=new_project_id,
            committed_by=caller_user_id,
            label="clone",
            description=f"Cloned from project {project_id} version {sv['id']}",
            _conn=conn,
        )

    return ProjectCloneResult(
        project=ProjectSchema(**new_row),
        cloned_version_id=cloned_version_id,
    )


@router.put(
    "/tenants/{tenant_id}/projects/{project_id}",
    response_model=ProjectSchema,
    summary="Update project",
    description="Update an existing project. Only provided fields are modified.",
)
def update_project(
    tenant_id: str,
    project_id: str,
    payload: ProjectUpdate,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Update a project by ID."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    old_rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project WHERE id = %s AND deleted_at IS NULL",
        (project_id,),
    )
    old_row = dict(old_rows[0])

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Project name cannot be empty")
        updates.append("name = %s")
        params.append(payload.name.strip())

    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)

    if payload.slug is not None:
        slug = _validate_slug(payload.slug)
        # Match the DB's partial unique index: only active projects reserve a slug.
        existing = db.execute_query(
            "SELECT id FROM objectified.project "
            "WHERE tenant_id = %s AND slug = %s AND id != %s AND deleted_at IS NULL",
            (tenant_id, slug, project_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Slug already in use within this tenant: {slug}",
            )
        updates.append("slug = %s")
        params.append(slug)

    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        # Nothing to update — re-fetch and return the existing row unchanged
        rows = db.execute_query(
            f"SELECT {_PROJECT_COLUMNS} FROM objectified.project WHERE id = %s",
            (project_id,),
        )
        return ProjectSchema(**dict(rows[0]))

    params.extend([project_id, tenant_id])

    try:
        row = db.execute_mutation(
            f"UPDATE objectified.project SET {', '.join(updates)} "
            f"WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL "
            f"RETURNING {_PROJECT_COLUMNS}",
            tuple(params),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A project with that slug already exists in this tenant",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to update project") from exc

    if not row:
        raise _not_found("Project", project_id)

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        project_id=project_id,
        tenant_id=tenant_id,
        changed_by=changed_by,
        operation="UPDATE",
        old_data=old_row,
        new_data=dict(row),
    )

    return ProjectSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/projects/{project_id}",
    status_code=204,
    summary="Delete (soft-delete) project",
    description="Soft-delete a project by setting its ``deleted_at`` timestamp.",
)
def delete_project(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Soft-delete a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    old_rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project WHERE id = %s AND deleted_at IS NULL",
        (project_id,),
    )
    old_row = dict(old_rows[0])

    row = db.execute_mutation(
        f"""
        UPDATE objectified.project
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        RETURNING {_PROJECT_COLUMNS}
        """,
        (project_id, tenant_id),
    )
    if not row:
        raise _not_found("Project", project_id)

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        project_id=project_id,
        tenant_id=tenant_id,
        changed_by=changed_by,
        operation="DELETE",
        old_data=old_row,
        new_data=None,
    )


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/restore",
    response_model=ProjectSchema,
    summary="Restore a soft-deleted project",
    description=(
        "Restore a previously soft-deleted project by clearing its "
        "``deleted_at`` timestamp and re-enabling it."
    ),
)
def restore_project(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Restore a soft-deleted project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    old_rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project WHERE id = %s AND deleted_at IS NOT NULL",
        (project_id,),
    )
    if not old_rows:
        raise HTTPException(status_code=409, detail="Project is not deleted and cannot be restored")
    old_row = dict(old_rows[0])

    row = db.execute_mutation(
        f"""
        UPDATE objectified.project
        SET deleted_at = NULL, enabled = true, updated_at = timezone('utc', clock_timestamp())
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NOT NULL
        RETURNING {_PROJECT_COLUMNS}
        """,
        (project_id, tenant_id),
    )
    if not row:
        raise _not_found("Project", project_id)

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        project_id=project_id,
        tenant_id=tenant_id,
        changed_by=changed_by,
        operation="RESTORE",
        old_data=old_row,
        new_data=dict(row),
    )

    return ProjectSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/projects/{project_id}/permanent",
    status_code=204,
    summary="Permanently delete a project",
    description="Permanently remove a soft-deleted project and all its data. This action cannot be undone.",
)
def permanent_delete_project(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Permanently delete a previously soft-deleted project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project WHERE id = %s AND deleted_at IS NOT NULL",
        (project_id,),
    )
    if not rows:
        raise HTTPException(status_code=409, detail="Project must be soft-deleted before permanent deletion")
    old_row = dict(rows[0])

    db.execute_mutation(
        "DELETE FROM objectified.project WHERE id = %s AND tenant_id = %s AND deleted_at IS NOT NULL",
        (project_id, tenant_id),
        returning=False,
    )

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        project_id=project_id,
        tenant_id=tenant_id,
        changed_by=changed_by,
        operation="PERMANENT_DELETE",
        old_data=old_row,
        new_data=None,
    )


# ---------------------------------------------------------------------------
# Project history
# ---------------------------------------------------------------------------


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/history",
    response_model=List[ProjectHistorySchema],
    summary="Get project change history",
    description="Return the full audit history of changes made to a project, newest first.",
)
def get_project_history(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_tenant_permission("audit:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ProjectHistorySchema]:
    """Return change history for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    rows = db.execute_query(
        """
        SELECT id, project_id, tenant_id, changed_by, operation, old_data, new_data, changed_at
        FROM objectified.project_history
        WHERE project_id = %s AND tenant_id = %s
        ORDER BY changed_at DESC
        """,
        (project_id, tenant_id),
    )
    return [ProjectHistorySchema(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _record_history(
    *,
    project_id: str,
    tenant_id: str,
    changed_by: Optional[str],
    operation: str,
    old_data: Optional[dict[str, Any]],
    new_data: Optional[dict[str, Any]],
    _conn: Any = None,
) -> None:
    """Insert a row into project_history. Failures are logged but not raised."""
    try:
        db.execute_mutation(
            """
            INSERT INTO objectified.project_history
                (project_id, tenant_id, changed_by, operation, old_data, new_data)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb)
            """,
            (
                project_id,
                tenant_id,
                changed_by,
                operation,
                json.dumps(old_data, default=str) if old_data is not None else None,
                json.dumps(new_data, default=str) if new_data is not None else None,
            ),
            returning=False,
            _conn=_conn,
        )
    except Exception:
        logger.exception(
            "_record_history: failed to record history for project %s op %s",
            project_id,
            operation,
        )
