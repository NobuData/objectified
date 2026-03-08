"""REST routes for /v1/tenants/{tenant_id}/projects — Project CRUD."""

import json
import logging
import re
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _assert_tenant_exists, _not_found
from app.schemas.project import ProjectCreate, ProjectHistorySchema, ProjectSchema, ProjectUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Projects"])

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")

_PROJECT_COLUMNS = (
    "id, tenant_id, creator_id, name, description, slug, enabled, metadata, "
    "created_at, updated_at, deleted_at"
)


def _assert_project_exists(project_id: str, tenant_id: str) -> dict[str, Any]:
    """Raise 404 if the project does not exist or belongs to a different tenant."""
    rows = db.execute_query(
        f"SELECT {_PROJECT_COLUMNS} FROM objectified.project "
        "WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL",
        (project_id, tenant_id),
    )
    if not rows:
        raise _not_found("Project", project_id)
    return dict(rows[0])


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
    "/tenants/{tenant_id}/projects/{project_id}",
    response_model=ProjectSchema,
    summary="Get project by ID",
    description="Retrieve a single project by its UUID within a tenant.",
)
def get_project(
    tenant_id: str,
    project_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted project"),
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
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Create a new project."""
    _assert_tenant_exists(tenant_id)

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

    # Per-tenant slug uniqueness check
    existing = db.execute_query(
        "SELECT id FROM objectified.project WHERE tenant_id = %s AND slug ILIKE %s AND deleted_at IS NULL",
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
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ProjectSchema:
    """Update a project by ID."""
    _assert_tenant_exists(tenant_id)
    old_row = _assert_project_exists(project_id, tenant_id)

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
        # Check uniqueness within tenant (excluding this project)
        existing = db.execute_query(
            "SELECT id FROM objectified.project "
            "WHERE tenant_id = %s AND slug ILIKE %s AND id != %s AND deleted_at IS NULL",
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
        # Nothing to update — return existing row
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
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Soft-delete a project."""
    _assert_tenant_exists(tenant_id)
    old_row = _assert_project_exists(project_id, tenant_id)

    row = db.execute_mutation(
        f"""
        UPDATE objectified.project
        SET deleted_at = timezone('utc', clock_timestamp())
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
        )
    except Exception:
        logger.exception(
            "_record_history: failed to record history for project %s op %s",
            project_id,
            operation,
        )

