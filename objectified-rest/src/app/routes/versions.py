"""REST routes for project-scoped versions and version history."""

import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.schemas.version import (
    VersionCreate,
    VersionHistorySchema,
    VersionMetadataUpdate,
    VersionPublishRequest,
    VersionSchema,
    VersionSnapshotCreate,
    VersionSnapshotSchema,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Versions"])

_VERSION_COLUMNS = (
    "id, project_id, source_version_id, creator_id, name, description, change_log, enabled, "
    "published, visibility, metadata, created_at, updated_at, deleted_at, published_at"
)


def _get_version_by_id(
    version_id: str,
    *,
    include_deleted: bool = False,
) -> Optional[dict[str, Any]]:
    deleted_clause = "" if include_deleted else "AND v.deleted_at IS NULL"
    rows = db.execute_query(
        f"""
        SELECT {_VERSION_COLUMNS}
        FROM objectified.version v
        JOIN objectified.project p ON p.id = v.project_id
        WHERE v.id = %s
          AND p.deleted_at IS NULL
          {deleted_clause}
        LIMIT 1
        """,
        (version_id,),
    )
    return dict(rows[0]) if rows else None


def _assert_version_exists(
    version_id: str,
    *,
    include_deleted: bool = False,
) -> dict[str, Any]:
    """Raise 404 when a version is missing."""
    version = _get_version_by_id(version_id, include_deleted=include_deleted)
    if not version:
        raise _not_found("Version", version_id)
    return version


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/versions",
    response_model=List[VersionSchema],
    summary="List versions for a project",
    description="Return all active versions for a project within a tenant.",
)
def list_versions(
    tenant_id: str,
    project_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[VersionSchema]:
    """List active versions for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    rows = db.execute_query(
        f"""
        SELECT {_VERSION_COLUMNS}
        FROM objectified.version
        WHERE project_id = %s
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (project_id,),
    )
    return [VersionSchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/versions",
    response_model=VersionSchema,
    status_code=201,
    summary="Create version",
    description="Create a project-scoped version. Optionally validate a source version for branch operations.",
)
def create_version(
    tenant_id: str,
    project_id: str,
    payload: VersionCreate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Create a version for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    if payload.project_id is not None and payload.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Payload project_id does not match path project_id",
        )

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Version name is required")

    caller_user_id = caller.get("user_id") if caller else None
    if payload.creator_id is not None and caller_user_id and payload.creator_id != caller_user_id:
        raise HTTPException(
            status_code=400,
            detail="Payload creator_id does not match the authenticated user",
        )

    creator_id = caller_user_id or payload.creator_id
    if not creator_id:
        raise HTTPException(status_code=400, detail="creator_id is required when not authenticated")

    if payload.source_version_id:
        source_version = _assert_version_exists(
            payload.source_version_id,
            include_deleted=False,
        )
        if source_version["project_id"] != project_id:
            raise HTTPException(
                status_code=400,
                detail="source_version_id must belong to the same project",
            )

    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.version
            (project_id, creator_id, name, description, change_log, enabled, published, visibility, metadata, source_version_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        RETURNING {_VERSION_COLUMNS}
        """,
        (
            project_id,
            creator_id,
            payload.name.strip(),
            payload.description,
            payload.change_log,
            payload.enabled,
            payload.published,
            payload.visibility.value if payload.visibility else None,
            json.dumps(payload.metadata),
            payload.source_version_id,
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create version")

    _record_history(
        version_id=str(row["id"]),
        project_id=project_id,
        changed_by=creator_id,
        operation="INSERT",
        old_data=None,
        new_data=dict(row),
    )

    return VersionSchema(**dict(row))


@router.get(
    "/versions/{version_id}",
    response_model=VersionSchema,
    summary="Get version by ID",
    description="Retrieve a version by UUID within a tenant scope.",
)
def get_version(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Get a version by ID."""
    version = _assert_version_exists(version_id, include_deleted=False)
    return VersionSchema(**version)


@router.put(
    "/versions/{version_id}",
    response_model=VersionSchema,
    summary="Update version metadata",
    description="Update mutable metadata fields for a version (description, change_log).",
)
def update_version_metadata(
    version_id: str,
    payload: VersionMetadataUpdate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Update a version's metadata fields."""
    old_row = _assert_version_exists(version_id, include_deleted=False)

    updates: list[str] = []
    params: list[Any] = []

    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)

    if payload.change_log is not None:
        updates.append("change_log = %s")
        params.append(payload.change_log)

    if not updates:
        return VersionSchema(**old_row)

    params.append(version_id)

    row = db.execute_mutation(
        f"""
        UPDATE objectified.version
        SET {', '.join(updates)}
        WHERE id = %s
          AND deleted_at IS NULL
        RETURNING {_VERSION_COLUMNS}
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("Version", version_id)

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        version_id=version_id,
        project_id=str(row["project_id"]),
        changed_by=changed_by,
        operation="UPDATE",
        old_data=old_row,
        new_data=dict(row),
    )

    return VersionSchema(**dict(row))


@router.delete(
    "/versions/{version_id}",
    status_code=204,
    summary="Delete (soft-delete) version",
    description="Soft-delete a version by setting deleted_at and disabling it.",
)
def delete_version(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Soft-delete a version."""
    old_row = _assert_version_exists(version_id, include_deleted=False)

    row = db.execute_mutation(
        f"""
        UPDATE objectified.version
        SET deleted_at = timezone('utc', clock_timestamp()),
            enabled = false
        WHERE id = %s
          AND deleted_at IS NULL
        RETURNING {_VERSION_COLUMNS}
        """,
        (version_id,),
    )
    if not row:
        raise _not_found("Version", version_id)

    changed_by = caller.get("user_id") if caller else None
    _record_history(
        version_id=version_id,
        project_id=str(row["project_id"]),
        changed_by=changed_by,
        operation="DELETE",
        old_data=old_row,
        new_data=None,
    )


@router.get(
    "/versions/{version_id}/history",
    response_model=List[VersionHistorySchema],
    summary="Get version history",
    description="Return revision history for a version, newest revision first.",
)
def get_version_history(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[VersionHistorySchema]:
    """Return a version's revision history."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        """
        SELECT id, version_id, project_id, changed_by, revision, operation, old_data, new_data, changed_at
        FROM objectified.version_history
        WHERE version_id = %s
        ORDER BY revision DESC
        """,
        (version_id,),
    )
    return [VersionHistorySchema(**dict(r)) for r in rows]


@router.get(
    "/versions/{version_id}/revisions/{revision}",
    response_model=VersionHistorySchema,
    summary="Get version by revision",
    description="Return the version history snapshot for a specific revision number.",
)
def get_version_by_revision(
    version_id: str,
    revision: int,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionHistorySchema:
    """Get a single history revision for a version."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        """
        SELECT id, version_id, project_id, changed_by, revision, operation, old_data, new_data, changed_at
        FROM objectified.version_history
        WHERE version_id = %s
          AND revision = %s
        LIMIT 1
        """,
        (version_id, revision),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Version revision not found: {version_id} @ {revision}",
        )

    return VersionHistorySchema(**dict(rows[0]))


# ---------------------------------------------------------------------------
# Publish / Unpublish / Freeze-schema
# ---------------------------------------------------------------------------


@router.post(
    "/versions/{version_id}/publish",
    response_model=VersionSchema,
    summary="Publish a version",
    description=(
        "Mark a version as published. Published versions are visible for pull by others "
        "according to the specified visibility policy (private or public)."
    ),
)
def publish_version(
    version_id: str,
    payload: Optional[VersionPublishRequest] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Publish a version."""
    if payload is None:
        payload = VersionPublishRequest()

    old_row = _assert_version_exists(version_id, include_deleted=False)

    if old_row.get("published"):
        raise HTTPException(status_code=400, detail="Version is already published")

    user_id = caller.get("user_id") if caller else None
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="Publishing requires user authentication (JWT token)",
        )

    visibility = payload.visibility.value if payload.visibility else "private"

    row = db.execute_mutation(
        f"""
        UPDATE objectified.version
        SET published = true,
            published_at = timezone('utc', clock_timestamp()),
            visibility = %s::objectified.version_visibility
        WHERE id = %s
          AND deleted_at IS NULL
        RETURNING {_VERSION_COLUMNS}
        """,
        (visibility, version_id),
    )
    if not row:
        raise _not_found("Version", version_id)

    _record_history(
        version_id=version_id,
        project_id=str(row["project_id"]),
        changed_by=user_id,
        operation="UPDATE",
        old_data=old_row,
        new_data=dict(row),
    )

    return VersionSchema(**dict(row))


@router.post(
    "/versions/{version_id}/unpublish",
    response_model=VersionSchema,
    summary="Unpublish a version",
    description=(
        "Mark a published version as unpublished. The version can be edited again after unpublishing."
    ),
)
def unpublish_version(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Unpublish a version."""
    old_row = _assert_version_exists(version_id, include_deleted=False)

    if not old_row.get("published"):
        raise HTTPException(status_code=400, detail="Version is not published")

    user_id = caller.get("user_id") if caller else None
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="Unpublishing requires user authentication (JWT token)",
        )

    row = db.execute_mutation(
        f"""
        UPDATE objectified.version
        SET published = false,
            published_at = NULL
        WHERE id = %s
          AND deleted_at IS NULL
        RETURNING {_VERSION_COLUMNS}
        """,
        (version_id,),
    )
    if not row:
        raise _not_found("Version", version_id)

    _record_history(
        version_id=version_id,
        project_id=str(row["project_id"]),
        changed_by=user_id,
        operation="UPDATE",
        old_data=old_row,
        new_data=dict(row),
    )

    return VersionSchema(**dict(row))


@router.post(
    "/versions/{version_id}/freeze-schema",
    response_model=VersionSnapshotSchema,
    status_code=201,
    summary="Freeze (capture) a version schema snapshot",
    description=(
        "Capture and freeze the current state of all classes and properties for a version "
        "as an immutable snapshot. This is a one-time operation per version — if a snapshot "
        "already exists, use the /snapshots endpoint to commit additional revisions. "
        "Freezing a schema requires user authentication (JWT token)."
    ),
)
def freeze_version_schema(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSnapshotSchema:
    """Freeze-schema: commit an immutable snapshot capturing the current version state."""
    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])

    user_id = caller.get("user_id") if caller else None
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="Freeze schema requires user authentication (JWT token)",
        )

    snapshot_data = _capture_version_state(version_id)

    row = db.execute_mutation(
        f"""
        WITH locked_version AS (
            SELECT id
            FROM objectified.version
            WHERE id = %s
            FOR UPDATE
        )
        INSERT INTO objectified.version_snapshot
            (version_id, project_id, committed_by, revision, label, description, snapshot)
        SELECT
            %s AS version_id,
            %s AS project_id,
            %s AS committed_by,
            1 AS revision,
            'frozen-schema' AS label,
            'Schema frozen via freeze-schema endpoint' AS description,
            %s::jsonb AS snapshot
        FROM locked_version
        WHERE NOT EXISTS (
            SELECT 1 FROM objectified.version_snapshot WHERE version_id = %s
        )
        RETURNING {_SNAPSHOT_COLUMNS}
        """,
        (
            version_id,
            version_id,
            project_id,
            user_id,
            json.dumps(snapshot_data, default=str),
            version_id,
        ),
    )
    if not row:
        raise HTTPException(
            status_code=400,
            detail=(
                "Schema already frozen for this version. "
                "A snapshot already exists — use POST /versions/{id}/snapshots to commit additional revisions."
            ),
        )

    return VersionSnapshotSchema(**dict(row))


# ---------------------------------------------------------------------------
# Version Snapshots – committed state capture (classes + properties)
# ---------------------------------------------------------------------------

_SNAPSHOT_COLUMNS = (
    "id, version_id, project_id, committed_by, revision, label, description, snapshot, created_at"
)


def _capture_version_state(version_id: str) -> dict[str, Any]:
    """Capture the current state of all active classes and their properties for a version.

    Returns a dict with ``classes`` containing a list of class snapshots, each
    including its associated ``properties`` list.
    """
    class_rows = db.execute_query(
        """
        SELECT id, version_id, name, description, schema, metadata, enabled, created_at, updated_at
        FROM objectified.class
        WHERE version_id = %s
          AND deleted_at IS NULL
        ORDER BY name ASC
        """,
        (version_id,),
    )

    class_by_id: dict[str, dict[str, Any]] = {}
    classes: list[dict[str, Any]] = []

    for cls in class_rows:
        cls_dict = dict(cls)
        cls_dict["properties"] = []
        classes.append(cls_dict)
        class_by_id[str(cls_dict["id"])] = cls_dict

    if not classes:
        return {"classes": []}

    # Build one %s placeholder per class ID for the IN clause.
    class_ids = [str(cls_dict["id"]) for cls_dict in classes]
    placeholders = ", ".join(["%s"] * len(class_ids))

    prop_rows = db.execute_query(
        f"""
        SELECT cp.id,
               cp.class_id,
               cp.property_id,
               cp.name,
               cp.description,
               cp.data,
               p.name AS property_name,
               p.description AS property_description,
               p.data AS property_data,
               p.enabled AS property_enabled
        FROM objectified.class_property cp
        JOIN objectified.property p ON p.id = cp.property_id
        WHERE cp.class_id IN ({placeholders})
          AND p.deleted_at IS NULL
        ORDER BY cp.name ASC
        """,
        tuple(class_ids),
    )

    for prop in prop_rows:
        prop_dict = dict(prop)
        class_id = prop_dict.get("class_id")
        cls_dict = class_by_id.get(str(class_id)) if class_id is not None else None
        if cls_dict is not None:
            cls_dict["properties"].append(prop_dict)

    return {"classes": classes}


@router.post(
    "/versions/{version_id}/snapshots",
    response_model=VersionSnapshotSchema,
    status_code=201,
    summary="Commit a version snapshot",
    description=(
        "Capture the current state of all classes and properties for this version "
        "as an immutable snapshot. Each snapshot receives an auto-incremented revision number."
    ),
)
def commit_version_snapshot(
    version_id: str,
    payload: Optional[VersionSnapshotCreate] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSnapshotSchema:
    """Commit a snapshot of the current version state (classes + properties)."""
    if payload is None:
        payload = VersionSnapshotCreate()

    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])
    committed_by = caller.get("user_id") if caller else None

    snapshot_data = _capture_version_state(version_id)
    version_metadata = version.get("metadata") or {}
    snapshot_data["canvas_metadata"] = (
        version_metadata.get("canvas_metadata")
        if isinstance(version_metadata, dict)
        else None
    )

    row = db.execute_mutation(
        f"""
        WITH locked_version AS (
            SELECT id
            FROM objectified.version
            WHERE id = %s
            FOR UPDATE
        )
        INSERT INTO objectified.version_snapshot
            (version_id, project_id, committed_by, revision, label, description, snapshot)
        SELECT
            %s AS version_id,
            %s AS project_id,
            %s AS committed_by,
            COALESCE(
                (SELECT MAX(revision) FROM objectified.version_snapshot WHERE version_id = %s),
                0
            ) + 1 AS revision,
            %s AS label,
            %s AS description,
            %s::jsonb AS snapshot
        FROM locked_version
        RETURNING {_SNAPSHOT_COLUMNS}
        """,
        (
            version_id,
            version_id,
            project_id,
            committed_by,
            version_id,
            payload.label,
            payload.description,
            json.dumps(snapshot_data, default=str),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to commit version snapshot")

    return VersionSnapshotSchema(**dict(row))


@router.get(
    "/versions/{version_id}/snapshots",
    response_model=List[VersionSnapshotSchema],
    summary="List version snapshots",
    description="Return all committed snapshots for a version, newest revision first.",
)
def list_version_snapshots(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[VersionSnapshotSchema]:
    """List all snapshots for a version."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        f"""
        SELECT {_SNAPSHOT_COLUMNS}
        FROM objectified.version_snapshot
        WHERE version_id = %s
        ORDER BY revision DESC
        """,
        (version_id,),
    )
    return [VersionSnapshotSchema(**dict(r)) for r in rows]


@router.get(
    "/versions/{version_id}/snapshots/{revision}",
    response_model=VersionSnapshotSchema,
    summary="Get version snapshot by revision",
    description="Return a specific committed snapshot for a version by its revision number.",
)
def get_version_snapshot_by_revision(
    version_id: str,
    revision: int,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSnapshotSchema:
    """Get a single snapshot revision for a version."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        f"""
        SELECT {_SNAPSHOT_COLUMNS}
        FROM objectified.version_snapshot
        WHERE version_id = %s
          AND revision = %s
        LIMIT 1
        """,
        (version_id, revision),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Version snapshot not found: {version_id} @ revision {revision}",
        )

    return VersionSnapshotSchema(**dict(rows[0]))


def _record_history(
    *,
    version_id: str,
    project_id: str,
    changed_by: Optional[str],
    operation: str,
    old_data: Optional[dict[str, Any]],
    new_data: Optional[dict[str, Any]],
) -> None:
    """Insert a revision row into version_history atomically. Failures are logged only."""
    try:
        db.execute_mutation(
            """
            INSERT INTO objectified.version_history
                (version_id, project_id, changed_by, revision, operation, old_data, new_data)
            SELECT
                %s AS version_id,
                %s AS project_id,
                %s AS changed_by,
                COALESCE((SELECT MAX(revision) FROM objectified.version_history WHERE version_id = %s), 0) + 1 AS revision,
                %s AS operation,
                %s::jsonb AS old_data,
                %s::jsonb AS new_data
            """,
            (
                version_id,
                project_id,
                changed_by,
                version_id,
                operation,
                json.dumps(old_data, default=str) if old_data is not None else None,
                json.dumps(new_data, default=str) if new_data is not None else None,
            ),
            returning=False,
        )
    except Exception:
        logger.exception(
            "_record_history: failed to record history for version %s op %s",
            version_id,
            operation,
        )
