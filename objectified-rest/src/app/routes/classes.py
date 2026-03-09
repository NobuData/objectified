"""REST routes for version-scoped classes (objectified.class)."""

import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _not_found
from app.routes.versions import _assert_version_exists
from app.schemas.class_model import ClassCreate, ClassSchema, ClassUpdate, ClassWithPropertiesAndTags

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Classes"])

_CLASS_COLUMNS = (
    "id, version_id, name, description, schema, metadata, enabled, "
    "created_at, updated_at, deleted_at"
)


def _row_to_class(row: dict[str, Any]) -> dict[str, Any]:
    """Normalise a class row for Pydantic (schema -> schema_ for Python keyword)."""
    out = dict(row)
    if "schema" in out and "schema_" not in out:
        out["schema_"] = out.pop("schema", {})
    return out


@router.get(
    "/versions/{version_id}/classes",
    response_model=List[ClassSchema],
    summary="List classes by version",
    description=(
        "Return all classes for a version. Version-scoped. "
        "Pass include_deleted=true to include soft-deleted classes."
    ),
)
def list_classes_by_version(
    version_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted classes"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ClassSchema]:
    """List classes for a version, optionally including soft-deleted."""
    _assert_version_exists(version_id, include_deleted=include_deleted)

    deleted_clause = "" if include_deleted else "AND c.deleted_at IS NULL"
    rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class c
        WHERE c.version_id = %s
          {deleted_clause}
        ORDER BY c.name ASC
        """,
        (version_id,),
    )
    return [ClassSchema(**_row_to_class(dict(r))) for r in rows]


@router.get(
    "/versions/{version_id}/classes/with-properties-tags",
    response_model=List[ClassWithPropertiesAndTags],
    summary="List classes with properties and tags for version",
    description=(
        "Bulk endpoint for canvas load: return all classes for a version with their "
        "properties and tags (from metadata) in one response. "
        "Pass include_deleted=true to include soft-deleted classes."
    ),
)
def list_classes_with_properties_and_tags(
    version_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted classes"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ClassWithPropertiesAndTags]:
    """List classes for a version with properties (and tags from metadata)."""
    _assert_version_exists(version_id, include_deleted=include_deleted)

    deleted_clause = "" if include_deleted else "AND c.deleted_at IS NULL"
    class_rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class c
        WHERE c.version_id = %s
          {deleted_clause}
        ORDER BY c.name ASC
        """,
        (version_id,),
    )
    if not class_rows:
        return []

    class_by_id: dict[str, dict[str, Any]] = {}
    result: list[dict[str, Any]] = []
    for row in class_rows:
        cls_model = ClassSchema(**_row_to_class(dict(row)))
        cls_dict = cls_model.model_dump(mode="json", by_alias=True)
        cls_dict["properties"] = []
        cls_dict["tags"] = (cls_dict.get("metadata") or {}).get("tags", [])
        if isinstance(cls_dict.get("tags"), str):
            cls_dict["tags"] = [cls_dict["tags"]] if cls_dict["tags"] else []
        result.append(cls_dict)
        class_by_id[str(cls_dict["id"])] = cls_dict

    class_ids = list(class_by_id.keys())
    placeholders = ", ".join(["%s"] * len(class_ids))
    prop_rows = db.execute_query(
        f"""
        SELECT cp.id, cp.class_id, cp.property_id, cp.name, cp.description, cp.data,
               p.name AS property_name, p.data AS property_data
        FROM objectified.class_property cp
        JOIN objectified.property p ON p.id = cp.property_id AND p.deleted_at IS NULL
        WHERE cp.class_id IN ({placeholders})
        ORDER BY cp.name ASC
        """,
        tuple(class_ids),
    )
    for prop in prop_rows:
        prop_dict = dict(prop)
        cid = str(prop_dict.get("class_id"))
        if cid in class_by_id:
            class_by_id[cid]["properties"].append(prop_dict)

    return result


@router.get(
    "/versions/{version_id}/classes/{class_id}/with-properties-tags",
    response_model=ClassWithPropertiesAndTags,
    summary="Get class with properties and tags",
    description=(
        "Return a single class with its properties and tags (from metadata). "
        "Useful for loading a single class detail view."
    ),
)
def get_class_with_properties_and_tags(
    version_id: str,
    class_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted class"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassWithPropertiesAndTags:
    """Get a single class with its properties and tags."""
    _assert_version_exists(version_id, include_deleted=include_deleted)

    deleted_clause = "" if include_deleted else "AND c.deleted_at IS NULL"
    class_rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class c
        WHERE c.id = %s AND c.version_id = %s
          {deleted_clause}
        LIMIT 1
        """,
        (class_id, version_id),
    )
    if not class_rows:
        raise _not_found("Class", class_id)

    cls_model = ClassSchema(**_row_to_class(dict(class_rows[0])))
    cls_dict = cls_model.model_dump(mode="json", by_alias=True)
    cls_dict["properties"] = []
    cls_dict["tags"] = (cls_dict.get("metadata") or {}).get("tags", [])
    if isinstance(cls_dict.get("tags"), str):
        cls_dict["tags"] = [cls_dict["tags"]] if cls_dict["tags"] else []

    prop_rows = db.execute_query(
        """
        SELECT cp.id, cp.class_id, cp.property_id, cp.name, cp.description, cp.data,
               p.name AS property_name, p.data AS property_data
        FROM objectified.class_property cp
        JOIN objectified.property p ON p.id = cp.property_id AND p.deleted_at IS NULL
        WHERE cp.class_id = %s
        ORDER BY cp.name ASC
        """,
        (class_id,),
    )
    for prop in prop_rows:
        cls_dict["properties"].append(dict(prop))

    return cls_dict


@router.get(
    "/versions/{version_id}/classes/{class_id}",
    response_model=ClassSchema,
    summary="Get class by ID",
    description="Retrieve a class by ID within a version.",
)
def get_class(
    version_id: str,
    class_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted class"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassSchema:
    """Get a class by ID scoped to a version."""
    _assert_version_exists(version_id, include_deleted=include_deleted)

    deleted_clause = "" if include_deleted else "AND c.deleted_at IS NULL"
    rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class c
        WHERE c.id = %s AND c.version_id = %s
          {deleted_clause}
        LIMIT 1
        """,
        (class_id, version_id),
    )
    if not rows:
        raise _not_found("Class", class_id)
    return ClassSchema(**_row_to_class(dict(rows[0])))


@router.post(
    "/versions/{version_id}/classes",
    response_model=ClassSchema,
    status_code=201,
    summary="Create class",
    description="Create a new class in the given version.",
)
def create_class(
    version_id: str,
    payload: ClassCreate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassSchema:
    """Create a class in a version."""
    _assert_version_exists(version_id, include_deleted=False)

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Class name is required")

    effective_version_id = payload.version_id if payload.version_id else version_id
    if effective_version_id != version_id:
        raise HTTPException(
            status_code=400,
            detail="Payload version_id does not match path version_id",
        )

    try:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.class
                (version_id, name, description, schema, metadata, enabled)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s)
            RETURNING {_CLASS_COLUMNS}
            """,
            (
                version_id,
                payload.name.strip(),
                payload.description or "",
                json.dumps(payload.schema_),
                json.dumps(payload.metadata),
                payload.enabled,
            ),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"A class with name '{payload.name.strip()}' already exists in this version",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to create class") from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create class")
    return ClassSchema(**_row_to_class(dict(row)))


@router.put(
    "/versions/{version_id}/classes/{class_id}",
    response_model=ClassSchema,
    summary="Update class",
    description=(
        "Update class metadata and/or canvas_metadata (position, dimensions, style, group). "
        "Only provided fields are modified."
    ),
)
def update_class(
    version_id: str,
    class_id: str,
    payload: ClassUpdate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassSchema:
    """Update a class by ID."""
    _assert_version_exists(version_id, include_deleted=False)
    old_rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class
        WHERE id = %s AND version_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (class_id, version_id),
    )
    if not old_rows:
        raise _not_found("Class", class_id)
    old_row = dict(old_rows[0])

    updates: list[str] = []
    params: list[Any] = []

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Class name cannot be empty")
        updates.append("name = %s")
        params.append(payload.name.strip())
    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)
    if payload.schema_ is not None:
        updates.append("schema = %s::jsonb")
        params.append(json.dumps(payload.schema_))
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if payload.metadata is not None or payload.canvas_metadata is not None:
        merged = dict(old_row.get("metadata") or {})
        if payload.metadata is not None:
            merged.update(payload.metadata)
        if payload.canvas_metadata is not None:
            canvas = payload.canvas_metadata.model_dump(exclude_none=True)
            if canvas:
                merged["canvas_metadata"] = canvas
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(merged))

    if not updates:
        return ClassSchema(**_row_to_class(old_row))

    params.extend([class_id, version_id])
    try:
        row = db.execute_mutation(
            f"""
            UPDATE objectified.class
            SET {', '.join(updates)}
            WHERE id = %s AND version_id = %s AND deleted_at IS NULL
            RETURNING {_CLASS_COLUMNS}
            """,
            tuple(params),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A class with that name already exists in this version",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to update class") from exc

    if not row:
        raise _not_found("Class", class_id)
    return ClassSchema(**_row_to_class(dict(row)))


@router.delete(
    "/versions/{version_id}/classes/{class_id}",
    status_code=204,
    summary="Delete (soft-delete) class",
    description="Soft-delete a class by setting deleted_at.",
)
def delete_class(
    version_id: str,
    class_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Soft-delete a class."""
    _assert_version_exists(version_id, include_deleted=False)
    rows = db.execute_query(
        f"""
        SELECT id FROM objectified.class
        WHERE id = %s AND version_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (class_id, version_id),
    )
    if not rows:
        raise _not_found("Class", class_id)

    row = db.execute_mutation(
        f"""
        UPDATE objectified.class
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND version_id = %s AND deleted_at IS NULL
        RETURNING {_CLASS_COLUMNS}
        """,
        (class_id, version_id),
    )
    if not row:
        raise _not_found("Class", class_id)
