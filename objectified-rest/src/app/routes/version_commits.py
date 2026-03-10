"""REST routes for version commit operations (commit, push, pull, merge).

Endpoints:
  POST /v1/versions/{version_id}/commit
  POST /v1/versions/{version_id}/push
  GET  /v1/versions/{version_id}/pull
  POST /v1/versions/{version_id}/merge
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _not_found
from app.routes.merge_utils import merge_classes
from app.routes.versions import (
    _assert_version_exists,
    _capture_version_state,
    _record_history,
    _SNAPSHOT_COLUMNS,
    _VERSION_COLUMNS,
)

from app.schemas.version import (
    MergeConflict,
    VersionCommitPayload,
    VersionCommitResponse,
    VersionMergeRequest,
    VersionMergeResponse,
    VersionPullResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Version Commits"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _upsert_class(
    version_id: str,
    cls_payload: dict[str, Any],
) -> str:
    """Find an existing class by name in the version (case-insensitive) or create one.

    Returns the class UUID.
    """
    name = cls_payload.get("name", "")
    description = cls_payload.get("description") or ""
    schema_val = cls_payload.get("schema_") or cls_payload.get("schema") or {}
    metadata = cls_payload.get("metadata") or {}

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
    )
    if not row:
        raise HTTPException(status_code=500, detail=f"Failed to create class '{name}'")
    return str(row["id"])


def _upsert_class_properties(
    class_id: str,
    project_id: str,
    properties: list[dict[str, Any]],
) -> None:
    """Upsert class properties for a class.

    For each property in the payload:
    1. Find or create the property in objectified.property (project-scoped, by name).
    2. Find or create the class_property join row (class-scoped, by name).
    """
    for prop_payload in properties:
        prop_name = prop_payload.get("name", "")
        property_name = prop_payload.get("property_name") or prop_name
        prop_data = prop_payload.get("property_data") or prop_payload.get("data") or {}
        prop_description = prop_payload.get("description") or ""

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
) -> dict[str, Any]:
    """Capture and persist a version snapshot, returning the snapshot row."""
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

    source_project = str(source_version["project_id"])
    target_project = str(target_version["project_id"])

    if source_project != target_project:
        raise HTTPException(
            status_code=400,
            detail="Source and target versions must belong to the same project",
        )

    user_id = caller.get("user_id") if caller else None

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


@router.get(
    "/versions/{version_id}/pull",
    response_model=VersionPullResponse,
    summary="Pull version state",
    description=(
        "Pull the current full state of a version, including all classes, their "
        "properties, and canvas_metadata. Analogous to git pull. Returns the latest "
        "snapshot revision number if one exists."
    ),
    responses={
        200: {"description": "Full version state"},
        404: {"description": "Version not found"},
    },
)
def pull_version(
    version_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> VersionPullResponse:
    """Pull the full current state of a version."""
    version = _assert_version_exists(version_id, include_deleted=False)

    state = _capture_version_state(version_id)

    # Fetch latest snapshot revision if any.
    snapshot_rows = db.execute_query(
        """
        SELECT MAX(revision) AS max_revision
        FROM objectified.version_snapshot
        WHERE version_id = %s
        """,
        (version_id,),
    )
    latest_revision = None
    if snapshot_rows and snapshot_rows[0].get("max_revision") is not None:
        latest_revision = snapshot_rows[0]["max_revision"]

    # Extract canvas_metadata from version metadata.
    version_metadata = version.get("metadata") or {}
    canvas_metadata = version_metadata.get("canvas_metadata") if isinstance(version_metadata, dict) else None

    return VersionPullResponse(
        version_id=version_id,
        revision=latest_revision,
        classes=state.get("classes", []),
        canvas_metadata=canvas_metadata,
        pulled_at=datetime.now(timezone.utc),
    )


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
    local_version = _assert_version_exists(version_id, include_deleted=False)
    remote_version = _assert_version_exists(payload.source_version_id, include_deleted=False)

    local_project = str(local_version["project_id"])
    remote_project = str(remote_version["project_id"])

    if local_project != remote_project:
        raise HTTPException(
            status_code=400,
            detail="Source and target versions must belong to the same project",
        )

    user_id = caller.get("user_id") if caller else None

    # Capture both states.
    local_state = _capture_version_state(version_id)
    remote_state = _capture_version_state(payload.source_version_id)

    local_classes = local_state.get("classes", [])
    remote_classes = remote_state.get("classes", [])

    merged_classes, raw_conflicts = merge_classes(
        local_classes, remote_classes, payload.strategy.value
    )

    # Convert raw conflict dicts to MergeConflict models.
    conflicts: list[MergeConflict] = []
    for rc in raw_conflicts:
        field_parts = rc.get("field", "").split(".", 1)
        conflicts.append(
            MergeConflict(
                class_name=field_parts[0] if field_parts else "",
                property_name=field_parts[1] if len(field_parts) > 1 else None,
                field=rc.get("field", ""),
                local_value=rc.get("local_value"),
                remote_value=rc.get("remote_value"),
                resolution=rc.get("resolution", ""),
            )
        )

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

    return VersionMergeResponse(
        revision=snapshot_row["revision"],
        snapshot_id=str(snapshot_row["id"]),
        version_id=version_id,
        conflicts=conflicts,
        merged_classes=merged_class_names,
        committed_at=snapshot_row["created_at"],
    )

