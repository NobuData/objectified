"""REST routes for project-scoped versions and version history."""

import json
import logging
import re
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth import (
    require_authenticated,
    require_project_permission,
    require_version_permission,
)
from app.database import db
from app.quotas import ensure_version_quota_allows_create
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.schema_webhook_service import (
    build_schema_webhook_payload,
    load_project_row,
    load_version_row,
    try_emit_schema_webhook,
)
from app.schemas.version import (
    VersionCreate,
    VersionHistorySchema,
    VersionMetadataUpdate,
    VersionPublishRequest,
    VersionPullDiff,
    VersionPullModifiedClass,
    VersionSchema,
    VersionSnapshotCreate,
    VersionSnapshotMetadataSchema,
    VersionSnapshotSchema,
    VersionSnapshotSchemaChangesAuditSchema,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Versions"])

_CODE_GENERATION_TAG_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$")

_VERSION_COLUMNS = (
    "id, project_id, source_version_id, creator_id, name, code_generation_tag, description, "
    "change_log, enabled, published, visibility, metadata, created_at, updated_at, "
    "deleted_at, published_at"
)


def _normalize_code_generation_tag(raw: Optional[str]) -> Optional[str]:
    """Return stripped tag or None to clear. Raises HTTP 400 if invalid when non-empty."""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if len(s) > 64 or not _CODE_GENERATION_TAG_PATTERN.match(s):
        raise HTTPException(
            status_code=400,
            detail=(
                "code_generation_tag must be 1–64 characters, start with a letter or digit, "
                "and contain only letters, digits, dots, underscores, and hyphens."
            ),
        )
    return s


def _qualify_columns(columns: str, alias: str) -> str:
    """Prefix each column in a comma-separated list with a table alias."""
    return ", ".join(f"{alias}.{col.strip()}" for col in columns.split(","))


def _get_version_by_id(
    version_id: str,
    *,
    include_deleted: bool = False,
) -> Optional[dict[str, Any]]:
    deleted_clause = "" if include_deleted else "AND v.deleted_at IS NULL"
    qualified = _qualify_columns(_VERSION_COLUMNS, "v")
    rows = db.execute_query(
        f"""
        SELECT {qualified}
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


def _insert_version_row(
    *,
    project_id: str,
    creator_id: str,
    name: str,
    description: str = "",
    code_generation_tag: Optional[str] = None,
    change_log: Optional[str] = None,
    enabled: bool = True,
    published: bool = False,
    visibility: Optional[Any] = None,
    metadata: Optional[dict[str, Any]] = None,
    source_version_id: Optional[str] = None,
    _conn: Any = None,
) -> Optional[dict[str, Any]]:
    """Insert a version row and return it. Used by create_version and create_version_from_revision."""
    visibility_value = visibility.value if hasattr(visibility, "value") else visibility
    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.version
            (project_id, creator_id, name, code_generation_tag, description, change_log, enabled,
             published, visibility, metadata, source_version_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        RETURNING {_VERSION_COLUMNS}
        """,
        (
            project_id,
            creator_id,
            name,
            code_generation_tag,
            description,
            change_log,
            enabled,
            published,
            visibility_value,
            json.dumps(metadata or {}),
            source_version_id,
        ),
        _conn=_conn,
    )
    return dict(row) if row else None


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/versions",
    response_model=List[VersionSchema],
    summary="List versions for a project",
    description="Return all active versions for a project within a tenant.",
)
def list_versions(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("version:read"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("version:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Create a version for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    ensure_version_quota_allows_create(tenant_id, project_id)

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

    tag: Optional[str] = None
    if "code_generation_tag" in payload.model_fields_set:
        tag = _normalize_code_generation_tag(payload.code_generation_tag)

    try:
        row = _insert_version_row(
            project_id=project_id,
            creator_id=creator_id,
            name=payload.name.strip(),
            description=payload.description,
            code_generation_tag=tag,
            change_log=payload.change_log,
            enabled=payload.enabled,
            published=payload.published,
            visibility=payload.visibility,
            metadata=payload.metadata,
            source_version_id=payload.source_version_id,
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="code_generation_tag is already used by another version in this project.",
            ) from exc
        raise
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
    "/versions/{version_id}/tags",
    response_model=List[str],
    summary="List tags for version",
    description=(
        "Return all tag names used by classes in this version (project tag list). "
        "GitHub #103."
    ),
)
def list_tags_for_version(
    version_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[str]:
    """List all tag names assigned to any class in the version."""
    _assert_version_exists(version_id, include_deleted=False)
    rows = db.execute_query(
        """
        SELECT metadata FROM objectified.class
        WHERE version_id = %s AND deleted_at IS NULL
        """,
        (version_id,),
    )
    seen: set[str] = set()
    for row in rows:
        meta = row.get("metadata") or {}
        tags = meta.get("tags")
        if isinstance(tags, str) and tags.strip():
            seen.add(tags.strip())
        elif isinstance(tags, list):
            for t in tags:
                if t is not None and str(t).strip():
                    seen.add(str(t).strip())
    return sorted(seen)


@router.get(
    "/versions/{version_id}",
    response_model=VersionSchema,
    summary="Get version by ID",
    description="Retrieve a version by UUID within a tenant scope.",
)
def get_version(
    version_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Get a version by ID."""
    version = _assert_version_exists(version_id, include_deleted=False)
    return VersionSchema(**version)


@router.put(
    "/versions/{version_id}",
    response_model=VersionSchema,
    summary="Update version metadata",
    description=(
        "Update mutable metadata fields for a version (description, change_log, "
        "code_generation_tag). Omit fields to leave them unchanged; send code_generation_tag "
        "as empty string to clear. Tags are unique per project (case-insensitive)."
    ),
)
def update_version_metadata(
    version_id: str,
    payload: VersionMetadataUpdate,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionSchema:
    """Update a version's metadata fields."""
    old_row = _assert_version_exists(version_id, include_deleted=False)

    updates: list[str] = []
    params: list[Any] = []
    fields_set = payload.model_fields_set

    if "description" in fields_set and payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)

    if "change_log" in fields_set:
        updates.append("change_log = %s")
        params.append(payload.change_log)

    if "code_generation_tag" in fields_set:
        tag = _normalize_code_generation_tag(payload.code_generation_tag)
        updates.append("code_generation_tag = %s")
        params.append(tag)

    if not updates:
        return VersionSchema(**old_row)

    params.append(version_id)

    try:
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
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="code_generation_tag is already used by another version in this project.",
            ) from exc
        raise
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:write"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:publish"))] = None,
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

    pid = str(row["project_id"])
    prow = load_project_row(pid)
    if prow:
        vrow = load_version_row(version_id) or dict(row)
        hook_payload = build_schema_webhook_payload(
            tenant_id=str(prow["tenant_id"]),
            event_type="schema.published",
            project_row=prow,
            version_row=vrow,
            actor_user_id=user_id,
            snapshot_row=None,
            extra={"visibility": row.get("visibility")},
        )
        try_emit_schema_webhook(
            project_id=pid,
            event_type="schema.published",
            payload=hook_payload,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:publish"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:publish"))] = None,
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

_SNAPSHOT_METADATA_COLUMNS = (
    "id, version_id, project_id, committed_by, revision, label, description, created_at"
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


def _class_name_key(name: Optional[str]) -> str:
    """Normalize class name for comparison (case-insensitive)."""
    return (name or "").strip().lower()


def _prop_name_key(prop: dict[str, Any]) -> str:
    """Normalize property name for comparison (case-insensitive)."""
    return (prop.get("name") or prop.get("property_name") or "").strip().lower()


def _prop_unique_key(prop: dict[str, Any]) -> str:
    """Composite key combining normalized name and property_id.

    Using ``property_id`` as a tiebreaker prevents silent overwrites when a
    class contains multiple properties whose normalized names collide (e.g.
    same name under different parents or legitimate duplicates).  Matching
    across snapshots is still correct because ``property_id`` is a stable
    reference to the underlying property definition.
    """
    name_part = _prop_name_key(prop)
    pid = prop.get("property_id")
    if pid is not None:
        return f"{name_part}:{pid}"
    return name_part


def _compute_schema_changes_diff(
    old_classes: list[dict[str, Any]],
    new_classes: list[dict[str, Any]],
) -> VersionPullDiff:
    """Compute diff between two version snapshot class/property lists.

    Matching is by class name and property name (case-insensitive). A property
    is considered "modified" when its join JSON schema (`data`) or join
    description (`description`) changes.
    """

    old_by_name: dict[str, dict[str, Any]] = {}
    for c in old_classes:
        old_by_name[_class_name_key(c.get("name"))] = c

    new_by_name: dict[str, dict[str, Any]] = {}
    for c in new_classes:
        new_by_name[_class_name_key(c.get("name"))] = c

    added_class_names: list[str] = []
    removed_class_names: list[str] = []
    modified_classes: list[VersionPullModifiedClass] = []

    def _prop_signature(prop: dict[str, Any]) -> dict[str, Any]:
        data = prop.get("data")
        data_norm = data if isinstance(data, dict) else {}
        desc = prop.get("description")
        return {"data": data_norm, "description": desc if desc is not None else ""}

    for name_key, new_c in new_by_name.items():
        class_display_name = (new_c.get("name") or name_key).strip() or name_key

        if name_key not in old_by_name:
            added_class_names.append(class_display_name)
            continue

        old_c = old_by_name[name_key]
        old_props = {_prop_unique_key(p): p for p in (old_c.get("properties") or [])}
        new_props = {_prop_unique_key(p): p for p in (new_c.get("properties") or [])}

        added_props = [
            (p.get("name") or k).strip() or k for k, p in new_props.items() if k not in old_props
        ]
        removed_props = [
            (p.get("name") or k).strip() or k for k, p in old_props.items() if k not in new_props
        ]
        modified_props = [
            (new_props[k].get("name") or k).strip() or k
            for k in old_props
            if k in new_props and _prop_signature(old_props[k]) != _prop_signature(new_props[k])
        ]

        if added_props or removed_props or modified_props:
            modified_classes.append(
                VersionPullModifiedClass(
                    class_name=class_display_name,
                    added_property_names=added_props,
                    removed_property_names=removed_props,
                    modified_property_names=modified_props,
                )
            )

    for name_key, old_c in old_by_name.items():
        if name_key not in new_by_name:
            removed_class_names.append(
                (old_c.get("name") or name_key).strip() or name_key
            )

    return VersionPullDiff(
        added_class_names=added_class_names,
        removed_class_names=removed_class_names,
        modified_classes=modified_classes,
    )


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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("version:publish"))] = None,
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
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
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
    "/versions/{version_id}/snapshots/metadata",
    response_model=List[VersionSnapshotMetadataSchema],
    summary="List version snapshot metadata",
    description=(
        "Return metadata (revision, date, label, description) for all committed snapshots "
        "for a version, newest revision first. The snapshot payload is excluded for efficiency."
    ),
)
def list_version_snapshots_metadata(
    version_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[VersionSnapshotMetadataSchema]:
    """List metadata for all snapshots for a version, without the snapshot payload."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        f"""
        SELECT {_SNAPSHOT_METADATA_COLUMNS}
        FROM objectified.version_snapshot
        WHERE version_id = %s
        ORDER BY revision DESC
        """,
        (version_id,),
    )
    return [VersionSnapshotMetadataSchema(**dict(r)) for r in rows]


@router.get(
    "/versions/{version_id}/snapshots/schema-changes",
    response_model=List[VersionSnapshotSchemaChangesAuditSchema],
    summary="List schema change audit entries (per snapshot)",
    description=(
        "Return an optional audit-style summary of schema changes for each snapshot "
        "revision of this version. For revision N, the diff is computed between snapshot "
        "revisions N-1 and N (first revision is diffed against an empty state)."
    ),
)
def list_version_snapshots_schema_changes(
    version_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[VersionSnapshotSchemaChangesAuditSchema]:
    """List per-snapshot schema change diffs."""
    _assert_version_exists(version_id, include_deleted=True)

    rows = db.execute_query(
        """
        SELECT
            id,
            version_id,
            project_id,
            committed_by,
            revision,
            label,
            description,
            snapshot,
            created_at
        FROM objectified.version_snapshot
        WHERE version_id = %s
        ORDER BY revision ASC
        """,
        (version_id,),
    )

    audit_rows: list[dict[str, Any]] = []
    prev_classes: list[dict[str, Any]] = []

    for row in rows:
        row_dict = dict(row)
        snapshot = row_dict.pop("snapshot") or {}
        classes = snapshot.get("classes") if isinstance(snapshot, dict) else None
        classes_list: list[dict[str, Any]] = classes if isinstance(classes, list) else []

        diff = _compute_schema_changes_diff(prev_classes, classes_list)
        audit_rows.append(
            {
                **row_dict,
                "diff": diff,
            }
        )
        prev_classes = classes_list

    # Newest first (matches UI expectations / existing metadata endpoints).
    audit_rows.reverse()
    return [VersionSnapshotSchemaChangesAuditSchema(**r) for r in audit_rows]


@router.get(
    "/versions/{version_id}/snapshots/{revision}",
    response_model=VersionSnapshotSchema,
    summary="Get version snapshot by revision",
    description="Return a specific committed snapshot for a version by its revision number.",
)
def get_version_snapshot_by_revision(
    version_id: str,
    revision: int,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("audit:read"))] = None,
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
    _conn: Any = None,
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
                COALESCE(
                    (SELECT MAX(revision) FROM objectified.version_history WHERE version_id = %s),
                    0
                ) + 1 AS revision,
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
            _conn=_conn,
        )
    except Exception:
        logger.exception(
            "_record_history: failed to record history for version %s op %s",
            version_id,
            operation,
        )
