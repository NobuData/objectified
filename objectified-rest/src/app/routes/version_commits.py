"""REST routes for version commit operations (commit, push, pull, merge).

Endpoints:
  POST /v1/versions/{version_id}/commit
  POST /v1/versions/{version_id}/push
  GET  /v1/versions/{version_id}/pull
  POST /v1/versions/{version_id}/merge
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.merge_utils import merge_classes, merge_classes_three_way
from app.routes.versions import (
    _SNAPSHOT_COLUMNS,
    _assert_version_exists,
    _capture_version_state,
    _record_history,
)
from app.schema_validation import validate_json_schema_object
from app.schemas.version import (
    MergeConflict,
    VersionCommitPayload,
    VersionCommitResponse,
    VersionMergePreviewResponse,
    VersionMergeRequest,
    VersionMergeResolveRequest,
    VersionMergeResolveResponse,
    VersionMergeResponse,
    VersionPullDiff,
    VersionPullModifiedClass,
    VersionPullResponse,
    VersionRollbackRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Version Commits"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _class_name_key(name: Optional[str]) -> str:
    """Normalize class name for comparison (case-insensitive)."""
    return (name or "").strip().lower()


def _prop_name_key(prop: dict[str, Any]) -> str:
    """Normalize property name for comparison (case-insensitive)."""
    return (prop.get("name") or prop.get("property_name") or "").strip().lower()


def _raw_conflicts_to_merge_conflicts(raw_conflicts: list[dict[str, Any]]) -> list[MergeConflict]:
    """Convert merge_utils conflict dicts to MergeConflict models (path, description, etc.)."""
    result: list[MergeConflict] = []
    for rc in raw_conflicts:
        field = rc.get("field", "")
        path = rc.get("path", field)
        description = rc.get("description", "")
        parts = field.split(".")
        class_name = parts[0] if parts else ""
        property_name = parts[1] if len(parts) > 1 else None
        result.append(
            MergeConflict(
                path=path,
                description=description,
                class_name=class_name,
                property_name=property_name,
                field=field,
                local_value=rc.get("local_value"),
                remote_value=rc.get("remote_value"),
                resolution=rc.get("resolution", ""),
            )
        )
    return result


def _set_nested_dict_value(d: dict[str, Any], keys: list[str], value: Any) -> None:
    """Recursively set a value in a nested dict by key path. Creates intermediate dicts as needed."""
    if not keys:
        return
    if len(keys) == 1:
        d[keys[0]] = value
        return
    key = keys[0]
    if not isinstance(d.get(key), dict):
        d[key] = {}
    _set_nested_dict_value(d[key], keys[1:], value)


def _set_merged_state_value(state: dict[str, Any], path_str: str, value: Any) -> None:
    """Set a value in merged state by dot-separated path (e.g. Person.age.minimum). In place.

    Path format:
      - ``ClassName.description``                  → sets class description
      - ``ClassName.propName.description``          → sets property description
      - ``ClassName.propName.<field>``              → sets data[field]
      - ``ClassName.propName.<field>.<subkey>...``  → recursively sets data[field][subkey]...
    """
    classes = state.get("classes") or []
    if not classes or not path_str:
        return
    parts = [p.strip() for p in path_str.split(".") if p.strip()]
    if len(parts) < 2:
        return
    class_name, rest = parts[0], parts[1:]
    class_key = (class_name or "").strip().lower()
    for cls in classes:
        if ((cls.get("name") or "").strip().lower() == class_key):
            if len(rest) == 1:
                if rest[0] == "description":
                    cls["description"] = value
                return
            # rest has 2+ parts: prop_name followed by field path
            prop_name = rest[0]
            field_parts = rest[1:]
            prop_key = (prop_name or "").strip().lower()
            for prop in (cls.get("properties") or []):
                if ((prop.get("name") or "").strip().lower() == prop_key):
                    if len(field_parts) == 1 and field_parts[0] == "description":
                        prop["description"] = value
                    else:
                        data = prop.get("data") or {}
                        _set_nested_dict_value(data, field_parts, value)
                        prop["data"] = data
                    return
            return


def _compute_pull_diff(
    old_classes: list[dict[str, Any]],
    new_classes: list[dict[str, Any]],
) -> VersionPullDiff:
    """Compute diff between two version states (class/property lists).

    Matching is by class name and property name (case-insensitive).
    """
    old_by_name: dict[str, dict[str, Any]] = {}
    for c in old_classes:
        key = _class_name_key(c.get("name"))
        if key in old_by_name:
            logger.warning(
                "Duplicate class name detected in old_classes for pull diff: "
                "normalized_name=%r, existing_id=%r, new_id=%r",
                key,
                old_by_name[key].get("id"),
                c.get("id"),
            )
        old_by_name[key] = c
    new_by_name: dict[str, dict[str, Any]] = {}
    for c in new_classes:
        key = _class_name_key(c.get("name"))
        if key in new_by_name:
            logger.warning(
                "Duplicate class name detected in new_classes for pull diff: "
                "normalized_name=%r, existing_id=%r, new_id=%r",
                key,
                new_by_name[key].get("id"),
                c.get("id"),
            )
        new_by_name[key] = c

    added_class_names: list[str] = []
    removed_class_names: list[str] = []
    modified_classes: list[VersionPullModifiedClass] = []

    for name_key, new_c in new_by_name.items():
        class_display_name = (new_c.get("name") or name_key).strip() or name_key
        if name_key not in old_by_name:
            added_class_names.append(class_display_name)
            continue
        old_c = old_by_name[name_key]
        old_props = {_prop_name_key(p): p for p in (old_c.get("properties") or [])}
        new_props = {_prop_name_key(p): p for p in (new_c.get("properties") or [])}
        added_props = [
            (p.get("name") or k).strip() or k
            for k, p in new_props.items()
            if k not in old_props
        ]
        removed_props = [
            (p.get("name") or k).strip() or k
            for k, p in old_props.items()
            if k not in new_props
        ]
        modified_props = [
            (new_props[k].get("name") or k).strip() or k
            for k in old_props
            if k in new_props
            and (old_props[k].get("data") or {}) != (new_props[k].get("data") or {})
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
            class_display_name = (old_c.get("name") or name_key).strip() or name_key
            removed_class_names.append(class_display_name)

    return VersionPullDiff(
        added_class_names=added_class_names,
        removed_class_names=removed_class_names,
        modified_classes=modified_classes,
    )


def _upsert_class(
    version_id: str,
    cls_payload: dict[str, Any],
    _conn: Any = None,
) -> str:
    """Find an existing class by name in the version (case-insensitive) or create one.

    Returns the class UUID.
    """
    name = (cls_payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name is required")

    description = cls_payload.get("description") or ""
    schema_val = cls_payload.get("schema_") or cls_payload.get("schema") or {}
    metadata = cls_payload.get("metadata") or {}

    schema_errors = validate_json_schema_object(schema_val)
    if schema_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Invalid schema for class '{name}'",
                "errors": schema_errors,
            },
        )

    rows = db.execute_query(
        """
        SELECT id FROM objectified.class
        WHERE version_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL
        LIMIT 1
        """,
        (version_id, name),
    )

    if rows:
        class_id = str(rows[0]["id"])
        db.execute_mutation(
            """
            UPDATE objectified.class
            SET description = %s, schema = %s::jsonb, metadata = %s::jsonb,
                updated_at = timezone('utc', clock_timestamp())
            WHERE id = %s
            """,
            (description, json.dumps(schema_val), json.dumps(metadata), class_id),
            returning=False,
            _conn=_conn,
        )
        return class_id

    row = db.execute_mutation(
        """
        INSERT INTO objectified.class
            (version_id, name, description, schema, metadata, enabled)
        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, true)
        RETURNING id
        """,
        (version_id, name, description, json.dumps(schema_val), json.dumps(metadata)),
        _conn=_conn,
    )
    if not row:
        raise HTTPException(status_code=500, detail=f"Failed to create class '{name}'")
    return str(row["id"])


def _upsert_class_properties(
    class_id: str,
    project_id: str,
    properties: list[dict[str, Any]],
    _conn: Any = None,
) -> None:
    """Upsert class properties for a class.

    For each property in the payload:
    1. Find or create the property in objectified.property (project-scoped, by name).
    2. Find or create the class_property join row (class-scoped, by name).
    """
    for prop_payload in properties:
        prop_name = (prop_payload.get("name") or "").strip()
        if not prop_name:
            raise HTTPException(status_code=400, detail="Property name is required")

        property_name = (prop_payload.get("property_name") or prop_name).strip()
        if not property_name:
            raise HTTPException(status_code=400, detail="property_name is required")

        prop_data = prop_payload.get("property_data") or prop_payload.get("data") or {}
        prop_description = prop_payload.get("description") or ""

        schema_errors = validate_json_schema_object(prop_data)
        if schema_errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": f"Invalid schema for property '{prop_name}'",
                    "errors": schema_errors,
                },
            )

        # Find or create the property in objectified.property.
        prop_rows = db.execute_query(
            """
            SELECT id FROM objectified.property
            WHERE project_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL
            LIMIT 1
            """,
            (project_id, property_name),
        )
        if prop_rows:
            property_id = str(prop_rows[0]["id"])
        else:
            prop_row = db.execute_mutation(
                """
                INSERT INTO objectified.property
                    (project_id, name, description, data, enabled)
                VALUES (%s, %s, %s, %s::jsonb, true)
                RETURNING id
                """,
                (project_id, property_name, prop_description, json.dumps(prop_data)),
                _conn=_conn,
            )
            if not prop_row:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create property '{property_name}'",
                )
            property_id = str(prop_row["id"])

        # Find or create class_property join row.
        cp_rows = db.execute_query(
            """
            SELECT id FROM objectified.class_property
            WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL
            LIMIT 1
            """,
            (class_id, prop_name),
        )
        if cp_rows:
            # Update existing class_property data.
            db.execute_mutation(
                """
                UPDATE objectified.class_property
                SET description = %s, data = %s::jsonb,
                    updated_at = timezone('utc', clock_timestamp())
                WHERE id = %s
                """,
                (prop_description, json.dumps(prop_data), str(cp_rows[0]["id"])),
                returning=False,
                _conn=_conn,
            )
        else:
            db.execute_mutation(
                """
                INSERT INTO objectified.class_property
                    (class_id, property_id, parent_id, name, description, data)
                VALUES (%s, %s, NULL, %s, %s, %s::jsonb)
                RETURNING id
                """,
                (class_id, property_id, prop_name, prop_description, json.dumps(prop_data)),
                _conn=_conn,
            )


def _apply_commit_payload(
    version_id: str,
    project_id: str,
    payload: VersionCommitPayload,
) -> None:
    """Apply a commit payload to the database — upsert classes and properties."""
    for cls_entry in payload.classes:
        cls_dict = cls_entry.model_dump(by_alias=True)
        class_id = _upsert_class(version_id, cls_dict)
        props = cls_dict.get("properties") or []
        _upsert_class_properties(class_id, project_id, props)

    # Store canvas_metadata in version metadata if provided.
    if payload.canvas_metadata is not None:
        db.execute_mutation(
            """
            UPDATE objectified.version
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{canvas_metadata}',
                %s::jsonb
            ),
            updated_at = timezone('utc', clock_timestamp())
            WHERE id = %s
            """,
            (json.dumps(payload.canvas_metadata), version_id),
            returning=False,
        )


def _create_snapshot(
    version_id: str,
    project_id: str,
    committed_by: Optional[str],
    label: Optional[str],
    description: Optional[str],
    _conn: Any = None,
) -> dict[str, Any]:
    """Capture and persist a version snapshot (classes + canvas_metadata), returning the snapshot row."""
    snapshot_data = _capture_version_state(version_id)
    version_rows = db.execute_query(
        "SELECT metadata FROM objectified.version WHERE id = %s LIMIT 1",
        (version_id,),
    )
    if version_rows and isinstance(version_rows[0].get("metadata"), dict):
        snapshot_data["canvas_metadata"] = version_rows[0]["metadata"].get("canvas_metadata")
    else:
        snapshot_data["canvas_metadata"] = None

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
            label,
            description,
            json.dumps(snapshot_data, default=str),
        ),
        _conn=_conn,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create version snapshot")
    return dict(row)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/versions/{version_id}/commit",
    response_model=VersionCommitResponse,
    status_code=201,
    summary="Commit version payload",
    description=(
        "Accept a full version payload (classes, properties, class_properties, "
        "canvas_metadata), write to the database, create a snapshot in version history, "
        "and return the new revision ID. This is analogous to a git commit."
    ),
    responses={
        201: {"description": "Commit successful — new revision created"},
        404: {"description": "Version not found"},
    },
)
def commit_version(
    version_id: str,
    payload: VersionCommitPayload,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionCommitResponse:
    """Commit a full version payload and create a snapshot."""
    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])
    user_id = caller.get("user_id") if caller else None

    logger.info("COMMIT version_id=%s project_id=%s user_id=%s", version_id, project_id, user_id)
    _apply_commit_payload(version_id, project_id, payload)

    snapshot_row = _create_snapshot(
        version_id=version_id,
        project_id=project_id,
        committed_by=user_id,
        label=payload.label or "commit",
        description=payload.description or payload.message,
    )

    _record_history(
        version_id=version_id,
        project_id=project_id,
        changed_by=user_id,
        operation="COMMIT",
        old_data=None,
        new_data=snapshot_row.get("snapshot"),
    )

    return VersionCommitResponse(
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=version_id,
        committed_at=snapshot_row["created_at"],
    )


@router.post(
    "/versions/{version_id}/push",
    response_model=VersionCommitResponse,
    status_code=201,
    summary="Push version state to a target version",
    description=(
        "Push the provided version payload into a target version. Both versions "
        "must belong to the same project. The payload is applied to the target "
        "version and a new snapshot is created. Analogous to git push."
    ),
    responses={
        201: {"description": "Push successful — target version updated"},
        400: {"description": "Versions belong to different projects or self-push detected"},
        404: {"description": "Version or target version not found"},
        409: {"description": "Target version has newer changes on server; pull then merge first"},
    },
)
def push_version(
    version_id: str,
    payload: VersionCommitPayload,
    target_version_id: str = Query(
        ..., description="The target version UUID to push changes into."
    ),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionCommitResponse:
    """Push a version payload to a target version."""
    source_version = _assert_version_exists(version_id, include_deleted=False)
    target_version = _assert_version_exists(target_version_id, include_deleted=False)

    if version_id == target_version_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot push a version to itself",
        )

    source_project = str(source_version["project_id"])
    target_project = str(target_version["project_id"])

    if source_project != target_project:
        raise HTTPException(
            status_code=400,
            detail="Source and target versions must belong to the same project",
        )

    # Reject push when target has a newer revision than source (server has new changes).
    rev_rows = db.execute_query(
        """
        SELECT version_id, MAX(revision) AS max_revision
        FROM objectified.version_snapshot
        WHERE version_id IN (%s, %s)
        GROUP BY version_id
        """,
        (version_id, target_version_id),
    )
    rev_by_id = {str(r["version_id"]): r["max_revision"] for r in rev_rows}
    source_rev = rev_by_id.get(version_id)
    target_rev = rev_by_id.get(target_version_id)
    # Reject if target has snapshots and either source has none (target is clearly newer)
    # or target's max revision exceeds source's.
    if target_rev is not None and (source_rev is None or target_rev > source_rev):
        raise HTTPException(
            status_code=409,
            detail="Target version has newer changes on the server; pull then merge first.",
        )

    user_id = caller.get("user_id") if caller else None
    logger.info(
        "PUSH version_id=%s target_version_id=%s project_id=%s user_id=%s",
        version_id, target_version_id, source_project, user_id,
    )

    _apply_commit_payload(target_version_id, target_project, payload)

    snapshot_row = _create_snapshot(
        version_id=target_version_id,
        project_id=target_project,
        committed_by=user_id,
        label=payload.label or "push",
        description=payload.description or payload.message or f"Pushed from {version_id}",
    )

    _record_history(
        version_id=target_version_id,
        project_id=target_project,
        changed_by=user_id,
        operation="PUSH",
        old_data=None,
        new_data=snapshot_row.get("snapshot"),
    )

    return VersionCommitResponse(
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=target_version_id,
        committed_at=snapshot_row["created_at"],
    )


def _apply_snapshot_state(
    version_id: str,
    project_id: str,
    state: dict[str, Any],
    _conn: Any = None,
) -> None:
    """Set version state to match a snapshot (for rollback). Soft-deletes classes not in
    snapshot, upserts classes and properties from snapshot, removes extra class_property
    rows so state matches exactly.
    """
    snapshot_classes = state.get("classes") or []
    snapshot_class_names_lower = {
        (c.get("name") or "").strip().lower() for c in snapshot_classes
    }

    # Soft-delete classes that exist in version but are not in the snapshot.
    current_rows = db.execute_query(
        """
        SELECT id, name FROM objectified.class
        WHERE version_id = %s AND deleted_at IS NULL
        """,
        (version_id,),
    )
    for row in current_rows:
        name_lower = (row.get("name") or "").strip().lower()
        if name_lower not in snapshot_class_names_lower:
            db.execute_mutation(
                """
                UPDATE objectified.class
                SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
                WHERE id = %s AND version_id = %s AND deleted_at IS NULL
                """,
                (str(row["id"]), version_id),
                returning=False,
                _conn=_conn,
            )

    # Upsert each class from snapshot and sync properties to match exactly.
    for cls in snapshot_classes:
        class_id = _upsert_class(version_id, cls, _conn=_conn)
        props = cls.get("properties") or []
        prop_names_lower = sorted({
            (p.get("name") or p.get("property_name") or "").strip().lower()
            for p in props
        })
        if prop_names_lower:
            placeholders = ", ".join(
                ["LOWER(TRIM(%s))"] * len(prop_names_lower)
            )
            db.execute_mutation(
                f"""
                DELETE FROM objectified.class_property
                WHERE class_id = %s
                  AND LOWER(TRIM(name)) NOT IN ({placeholders})
                """,
                (class_id, *prop_names_lower),
                returning=False,
                _conn=_conn,
            )
        else:
            db.execute_mutation(
                """
                DELETE FROM objectified.class_property
                WHERE class_id = %s
                """,
                (class_id,),
                returning=False,
                _conn=_conn,
            )
        _upsert_class_properties(class_id, project_id, props, _conn=_conn)

    if state.get("canvas_metadata") is not None:
        db.execute_mutation(
            """
            UPDATE objectified.version
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{canvas_metadata}',
                %s::jsonb
            ),
            updated_at = timezone('utc', clock_timestamp())
            WHERE id = %s
            """,
            (json.dumps(state["canvas_metadata"]), version_id),
            returning=False,
            _conn=_conn,
        )
    else:
        db.execute_mutation(
            """
            UPDATE objectified.version
            SET metadata = metadata - 'canvas_metadata',
            updated_at = timezone('utc', clock_timestamp())
            WHERE id = %s
            """,
            (version_id,),
            returning=False,
            _conn=_conn,
        )


@router.post(
    "/versions/{version_id}/rollback",
    response_model=VersionCommitResponse,
    status_code=201,
    summary="Rollback version to a revision",
    description=(
        "Set version state to the chosen snapshot revision, then create a new snapshot "
        "so the change is appended to history. Requires user authentication (JWT token)."
    ),
    responses={
        201: {"description": "Rollback successful — new snapshot created"},
        403: {"description": "Rollback requires user authentication (JWT token)"},
        404: {"description": "Version or snapshot revision not found"},
    },
)
def rollback_version(
    version_id: str,
    payload: VersionRollbackRequest,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionCommitResponse:
    """Rollback version state to a snapshot revision and append a new snapshot to history."""
    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])
    user_id = caller.get("user_id") if caller else None
    if not user_id:
        raise HTTPException(
            status_code=403,
            detail="Rollback requires user authentication (JWT token)",
        )

    snapshot_rows = db.execute_query(
        f"""
        SELECT {_SNAPSHOT_COLUMNS}
        FROM objectified.version_snapshot
        WHERE version_id = %s AND revision = %s
        LIMIT 1
        """,
        (version_id, payload.revision),
    )
    if not snapshot_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Version snapshot not found: {version_id} @ revision {payload.revision}",
        )
    state = (snapshot_rows[0].get("snapshot") or {}).copy()
    if not isinstance(state.get("canvas_metadata"), dict) and state.get(
        "canvas_metadata"
    ) is not None:
        state["canvas_metadata"] = None

    with db.transaction() as conn:
        _apply_snapshot_state(version_id, project_id, state, _conn=conn)

        snapshot_row = _create_snapshot(
            version_id=version_id,
            project_id=project_id,
            committed_by=user_id,
            label="rollback",
            description=f"Rollback to revision {payload.revision}",
            _conn=conn,
        )

        _record_history(
            version_id=version_id,
            project_id=project_id,
            changed_by=user_id,
            operation="ROLLBACK",
            old_data=None,
            new_data=snapshot_row.get("snapshot"),
            _conn=conn,
        )

    return VersionCommitResponse(
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=version_id,
        committed_at=snapshot_row["created_at"],
    )


@router.get(
    "/versions/{version_id}/pull",
    response_model=VersionPullResponse,
    summary="Pull version state",
    description=(
        "Pull the full state of a version, including all classes, their "
        "properties, and canvas_metadata. By default returns the latest state; "
        "use optional query param `revision` to get state at a specific snapshot revision. "
        "Use optional `since_revision` to include a diff of changes since that revision."
    ),
    responses={
        200: {"description": "Full version state (and optional diff)"},
        404: {"description": "Version or snapshot revision not found"},
    },
)
def pull_version(
    version_id: str,
    revision: Optional[int] = Query(
        None,
        description="If set, return state at this snapshot revision instead of latest.",
    ),
    since_revision: Optional[int] = Query(
        None,
        description="If set, include a diff of changes since this revision.",
    ),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionPullResponse:
    """Pull the full state of a version (latest or at a given revision); optionally include diff since a revision."""
    version = _assert_version_exists(version_id, include_deleted=False)

    if revision is not None:
        snapshot_rows = db.execute_query(
            f"""
            SELECT {_SNAPSHOT_COLUMNS}
            FROM objectified.version_snapshot
            WHERE version_id = %s AND revision = %s
            LIMIT 1
            """,
            (version_id, revision),
        )
        if not snapshot_rows:
            raise HTTPException(
                status_code=404,
                detail=f"Version snapshot not found: {version_id} @ revision {revision}",
            )
        snapshot_row = dict(snapshot_rows[0])
        state = snapshot_row.get("snapshot") or {}
        classes = state.get("classes", [])
        canvas_metadata = state.get("canvas_metadata")
        effective_revision = revision
    else:
        state = _capture_version_state(version_id)
        classes = state.get("classes", [])
        version_metadata = version.get("metadata") or {}
        canvas_metadata = version_metadata.get("canvas_metadata") if isinstance(version_metadata, dict) else None
        snapshot_rows = db.execute_query(
            """
            SELECT MAX(revision) AS max_revision
            FROM objectified.version_snapshot
            WHERE version_id = %s
            """,
            (version_id,),
        )
        effective_revision = None
        if snapshot_rows and snapshot_rows[0].get("max_revision") is not None:
            effective_revision = snapshot_rows[0]["max_revision"]

    diff_since_revision: Optional[int] = None
    diff_value: Optional[VersionPullDiff] = None
    if since_revision is not None:
        since_rows = db.execute_query(
            """
            SELECT snapshot
            FROM objectified.version_snapshot
            WHERE version_id = %s AND revision = %s
            LIMIT 1
            """,
            (version_id, since_revision),
        )
        if not since_rows:
            raise HTTPException(
                status_code=404,
                detail=f"Version snapshot not found for since_revision: {version_id} @ revision {since_revision}",
            )
        old_snapshot = since_rows[0].get("snapshot") or {}
        old_classes = old_snapshot.get("classes", [])
        diff_value = _compute_pull_diff(old_classes, classes)
        diff_since_revision = since_revision

    return VersionPullResponse(
        version_id=version_id,
        revision=effective_revision,
        classes=classes,
        canvas_metadata=canvas_metadata,
        pulled_at=datetime.now(timezone.utc),
        diff_since_revision=diff_since_revision,
        diff=diff_value,
    )


# ---------------------------------------------------------------------------
# Merge helpers
# ---------------------------------------------------------------------------


def _compute_merge(
    version_id: str,
    payload: VersionMergeRequest,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[Any]]:
    """Shared merge computation for merge_version and merge_preview.

    Validates versions, resolves ours/theirs states, performs two-way or three-way merge.

    Returns:
        (local_project_id, local_classes, merged_classes, raw_conflicts)
    """
    local_version = _assert_version_exists(version_id, include_deleted=False)
    local_project = str(local_version["project_id"])

    # Validate the source version and project membership only when
    # theirs_state is not provided (otherwise source_version_id is unused).
    if payload.theirs_state is None:
        if not payload.source_version_id:
            raise HTTPException(
                status_code=400,
                detail="source_version_id is required when theirs_state is not provided",
            )
        remote_version = _assert_version_exists(payload.source_version_id, include_deleted=False)
        if str(remote_version["project_id"]) != local_project:
            raise HTTPException(
                status_code=400,
                detail="Source and target versions must belong to the same project",
            )

    # Resolve ours state: payload.ours_state or current version state.
    if payload.ours_state is not None:
        local_classes = payload.ours_state.get("classes", [])
    else:
        local_state = _capture_version_state(version_id)
        local_classes = local_state.get("classes", [])

    # Resolve theirs state: payload.theirs_state or source version state.
    if payload.theirs_state is not None:
        remote_classes = payload.theirs_state.get("classes", [])
    else:
        remote_state = _capture_version_state(payload.source_version_id)
        remote_classes = remote_state.get("classes", [])

    base_classes: Optional[list[dict[str, Any]]] = None
    if payload.base_revision is not None:
        base_rows = db.execute_query(
            """
            SELECT snapshot FROM objectified.version_snapshot
            WHERE version_id = %s AND revision = %s LIMIT 1
            """,
            (version_id, payload.base_revision),
        )
        if not base_rows:
            raise HTTPException(
                status_code=404,
                detail=f"Version snapshot not found: {version_id} @ revision {payload.base_revision}",
            )
        base_snapshot = base_rows[0].get("snapshot") or {}
        base_classes = base_snapshot.get("classes", [])

    if base_classes is not None:
        merged_classes, raw_conflicts = merge_classes_three_way(
            base_classes, local_classes, remote_classes, payload.strategy.value
        )
    else:
        merged_classes, raw_conflicts = merge_classes(
            local_classes, remote_classes, payload.strategy.value
        )

    return local_project, local_classes, merged_classes, raw_conflicts


@router.post(
    "/versions/{version_id}/merge",
    response_model=VersionMergeResponse,
    status_code=200,
    summary="Merge another version into this version",
    description=(
        "Merge classes and properties from a source version into the current version. "
        "Two merge strategies are supported:\n\n"
        "- **additive**: Keep local classes and properties, only add remote-only items.\n"
        "- **override**: Remote wins for metadata fields; property constraints are merged "
        "using stricter-wins semantics (e.g. larger minLength, smaller maxLength, enum union).\n\n"
        "Both versions must belong to the same project. Conflicts are reported in the response "
        "but do not block the merge. A new snapshot is created after merging."
    ),
    responses={
        200: {"description": "Merge result with optional conflicts"},
        400: {"description": "Versions belong to different projects"},
        404: {"description": "Version or source version not found"},
    },
)
def merge_version(
    version_id: str,
    payload: VersionMergeRequest,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionMergeResponse:
    """Merge changes from a source version into the current version."""
    user_id = caller.get("user_id") if caller else None
    logger.info(
        "MERGE version_id=%s source_version_id=%s strategy=%s user_id=%s",
        version_id, payload.source_version_id, payload.strategy.value, user_id,
    )

    local_project, local_classes, merged_classes, raw_conflicts = _compute_merge(version_id, payload)
    conflicts = _raw_conflicts_to_merge_conflicts(raw_conflicts)

    # Apply merged state: upsert classes and their properties.
    merged_class_names: list[str] = []
    for merged_cls in merged_classes:
        class_id = _upsert_class(version_id, merged_cls)
        props = merged_cls.get("properties") or []
        _upsert_class_properties(class_id, local_project, props)
        merged_class_names.append(merged_cls.get("name", ""))

    # Create a snapshot of the merged state.
    snapshot_row = _create_snapshot(
        version_id=version_id,
        project_id=local_project,
        committed_by=user_id,
        label="merge",
        description=payload.message or f"Merged from {payload.source_version_id}",
    )

    _record_history(
        version_id=version_id,
        project_id=local_project,
        changed_by=user_id,
        operation="MERGE",
        old_data={"classes": local_classes},
        new_data=snapshot_row.get("snapshot"),
    )

    merged_state: dict[str, Any] = {
        "classes": merged_classes,
        "canvas_metadata": (snapshot_row.get("snapshot") or {}).get("canvas_metadata"),
    }

    return VersionMergeResponse(
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=version_id,
        conflicts=conflicts,
        merged_classes=merged_class_names,
        merged_state=merged_state,
        committed_at=snapshot_row["created_at"],
    )


@router.post(
    "/versions/{version_id}/merge/preview",
    response_model=VersionMergePreviewResponse,
    status_code=200,
    summary="Preview merge result",
    description=(
        "Compute merged state and conflicts from ours and theirs without persisting. "
        "Uses current version state as ours and source_version_id state as theirs unless "
        "ours_state/theirs_state are provided. Optional base_revision for three-way merge."
    ),
    responses={
        200: {"description": "Merged state and list of conflicts"},
        404: {"description": "Version or source version or base snapshot not found"},
    },
)
def merge_preview(
    version_id: str,
    payload: VersionMergeRequest,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionMergePreviewResponse:
    """Return merged state and conflicts without persisting."""
    _local_project, _local_classes, merged_classes, raw_conflicts = _compute_merge(version_id, payload)
    conflicts = _raw_conflicts_to_merge_conflicts(raw_conflicts)
    merged_state = {"classes": merged_classes, "canvas_metadata": None}
    return VersionMergePreviewResponse(merged_state=merged_state, conflicts=conflicts)


@router.post(
    "/versions/{version_id}/merge/resolve",
    response_model=VersionMergeResolveResponse,
    status_code=200,
    summary="Merge with resolution choices",
    description=(
        "Submit resolution choices for conflicts and get merged state. "
        "When apply=true, persist the merged state and create a snapshot."
    ),
    responses={
        200: {"description": "Merged state; revision/snapshot_id when apply=true"},
        404: {"description": "Version or source version not found"},
    },
)
def merge_resolve(
    version_id: str,
    payload: VersionMergeResolveRequest,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionMergeResolveResponse:
    """Merge with explicit conflict resolutions; optionally persist."""
    req = VersionMergeRequest(
        source_version_id=payload.source_version_id,
        strategy=payload.strategy,
        message=payload.message,
        base_revision=payload.base_revision,
        ours_state=payload.ours_state,
        theirs_state=payload.theirs_state,
    )
    preview = merge_preview(version_id, req, caller)
    merged_state = copy.deepcopy(dict(preview.merged_state))
    conflicts_by_path = {c.path: c for c in preview.conflicts}

    for choice in payload.conflict_resolutions:
        path = choice.path
        conflict = conflicts_by_path.get(path)
        if conflict is None:
            continue
        if choice.use == "ours":
            _set_merged_state_value(merged_state, path, conflict.local_value)
        elif choice.use == "theirs":
            _set_merged_state_value(merged_state, path, conflict.remote_value)
        elif choice.use == "custom" and choice.custom_value is not None:
            _set_merged_state_value(merged_state, path, choice.custom_value)

    if not payload.apply:
        return VersionMergeResolveResponse(merged_state=merged_state)

    # Persist: apply merged_state to version and create snapshot.
    local_version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(local_version["project_id"])
    user_id = caller.get("user_id") if caller else None

    for cls in merged_state.get("classes") or []:
        class_id = _upsert_class(version_id, cls)
        _upsert_class_properties(class_id, project_id, cls.get("properties") or [])

    snapshot_row = _create_snapshot(
        version_id=version_id,
        project_id=project_id,
        committed_by=user_id,
        label="merge",
        description=payload.message or "Merge with resolution choices",
    )

    _record_history(
        version_id=version_id,
        project_id=project_id,
        changed_by=user_id,
        operation="MERGE",
        old_data=None,
        new_data=snapshot_row.get("snapshot"),
    )

    return VersionMergeResolveResponse(
        merged_state=merged_state,
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=version_id,
        committed_at=snapshot_row["created_at"],
    )

