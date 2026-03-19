"""REST routes for class properties."""
import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated, require_version_permission
from app.database import db
from app.routes.helpers import _not_found
from app.routes.versions import _assert_version_exists
from app.schemas.class_property import ClassPropertyCreate, ClassPropertySchema, ClassPropertyUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Class Properties"])

_CLASS_PROPERTY_COLUMNS = (
    "id, class_id, property_id, parent_id, name, description, data, created_at, updated_at"
)

# Same columns prefixed with table alias for use in JOIN queries.
_CP_SELECT = (
    "cp.id, cp.class_id, cp.property_id, cp.parent_id, cp.name, "
    "cp.description, cp.data, cp.created_at, cp.updated_at"
)


def _assert_class_exists(class_id: str, version_id: str) -> dict[str, Any]:
    """Raise 404 if the class does not exist or belongs to a different version."""
    rows = db.execute_query(
        "SELECT id, version_id FROM objectified.class "
        "WHERE id = %s AND version_id = %s AND deleted_at IS NULL",
        (class_id, version_id),
    )
    if not rows:
        raise _not_found("Class", class_id)
    return dict(rows[0])


def _assert_class_property_exists(class_property_id: str, class_id: str) -> dict[str, Any]:
    """Raise 404 if the class property does not exist or belongs to a different class."""
    rows = db.execute_query(
        f"SELECT {_CLASS_PROPERTY_COLUMNS} FROM objectified.class_property "
        "WHERE id = %s AND class_id = %s",
        (class_property_id, class_id),
    )
    if not rows:
        raise _not_found("ClassProperty", class_property_id)
    return dict(rows[0])


def _assert_property_exists(property_id: str) -> dict[str, Any]:
    """Raise 404 if the library property does not exist or is deleted."""
    rows = db.execute_query(
        "SELECT id FROM objectified.property "
        "WHERE id = %s AND deleted_at IS NULL",
        (property_id,),
    )
    if not rows:
        raise _not_found("Property", property_id)
    return dict(rows[0])


@router.get(
    "/versions/{version_id}/classes/{class_id}/properties",
    response_model=List[ClassPropertySchema],
    summary="List properties for a class",
    description=(
        "Return all properties assigned to a class. "
        "Pass ``parent_id`` query param to filter by parent (for nested properties). "
        "Omit ``parent_id`` to return all (both top-level and nested). "
        "Properties whose underlying library property has been deleted are excluded."
    ),
)
def list_class_properties(
    version_id: str,
    class_id: str,
    parent_id: Optional[str] = Query(None, description="Filter by parent property ID"),
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[ClassPropertySchema]:
    """List properties assigned to a class."""
    _assert_version_exists(version_id, include_deleted=False)
    _assert_class_exists(class_id, version_id)
    if parent_id is not None:
        rows = db.execute_query(
            f"SELECT {_CP_SELECT} FROM objectified.class_property cp "
            "JOIN objectified.property p ON p.id = cp.property_id "
            "WHERE cp.class_id = %s AND cp.parent_id = %s AND p.deleted_at IS NULL "
            "ORDER BY cp.name ASC",
            (class_id, parent_id),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_CP_SELECT} FROM objectified.class_property cp "
            "JOIN objectified.property p ON p.id = cp.property_id "
            "WHERE cp.class_id = %s AND p.deleted_at IS NULL "
            "ORDER BY cp.name ASC",
            (class_id,),
        )
    return [ClassPropertySchema(**dict(r)) for r in rows]


@router.post(
    "/versions/{version_id}/classes/{class_id}/properties",
    response_model=ClassPropertySchema,
    status_code=201,
    summary="Add property to class",
    description=(
        "Add a library property to a class, optionally overriding its name, description, "
        "and/or data. Supply ``parent_id`` to nest the property under another class property."
    ),
)
def add_property_to_class(
    version_id: str,
    class_id: str,
    payload: ClassPropertyCreate,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassPropertySchema:
    """Add a property to a class (creates a class_property join row)."""
    _assert_version_exists(version_id, include_deleted=False)
    _assert_class_exists(class_id, version_id)
    _assert_property_exists(payload.property_id)
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Property name is required")
    if payload.parent_id is not None:
        _assert_class_property_exists(payload.parent_id, class_id)
    if payload.parent_id is not None:
        existing = db.execute_query(
            "SELECT id FROM objectified.class_property "
            "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s",
            (class_id, payload.name.strip(), payload.parent_id),
        )
    else:
        existing = db.execute_query(
            "SELECT id FROM objectified.class_property "
            "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL",
            (class_id, payload.name.strip()),
        )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A property with name '{payload.name.strip()}' already exists at this level in the class",
        )
    try:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.class_property
                (class_id, property_id, parent_id, name, description, data)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            RETURNING {_CLASS_PROPERTY_COLUMNS}
            """,
            (
                class_id,
                payload.property_id,
                payload.parent_id,
                payload.name.strip(),
                payload.description,
                json.dumps(payload.data),
            ),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"A property with name '{payload.name.strip()}' already exists in this class",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to add property to class") from exc
    if not row:
        raise HTTPException(status_code=500, detail="Failed to add property to class")
    return ClassPropertySchema(**dict(row))


@router.put(
    "/versions/{version_id}/classes/{class_id}/properties/{class_property_id}",
    response_model=ClassPropertySchema,
    summary="Update class property join row",
    description=(
        "Update the overrides stored on the class_property join row: "
        "name, description, data (JSON Schema), and/or parent_id for re-nesting. "
        "Only provided fields are modified."
    ),
)
def update_class_property(
    version_id: str,
    class_id: str,
    class_property_id: str,
    payload: ClassPropertyUpdate,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ClassPropertySchema:
    """Update a class property join row."""
    _assert_version_exists(version_id, include_deleted=False)
    _assert_class_exists(class_id, version_id)
    old_row = _assert_class_property_exists(class_property_id, class_id)
    updates: list[str] = []
    params: list[Any] = []
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Property name cannot be empty")
        target_parent_id = payload.parent_id if payload.parent_id is not None else old_row.get("parent_id")
        if target_parent_id is not None:
            name_conflict = db.execute_query(
                "SELECT id FROM objectified.class_property "
                "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s AND id != %s",
                (class_id, payload.name.strip(), target_parent_id, class_property_id),
            )
        else:
            name_conflict = db.execute_query(
                "SELECT id FROM objectified.class_property "
                "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL AND id != %s",
                (class_id, payload.name.strip(), class_property_id),
            )
        if name_conflict:
            raise HTTPException(
                status_code=409,
                detail=f"A property with name '{payload.name.strip()}' already exists at this level in the class",
            )
        updates.append("name = %s")
        params.append(payload.name.strip())
    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)
    if payload.data is not None:
        updates.append("data = %s::jsonb")
        params.append(json.dumps(payload.data))
    if payload.parent_id is not None:
        if payload.parent_id == class_property_id:
            raise HTTPException(status_code=400, detail="A property cannot be its own parent")
        _assert_class_property_exists(payload.parent_id, class_id)
        # When only re-nesting (name unchanged), verify no sibling name conflict under the new parent.
        if payload.name is None:
            effective_name = (old_row.get("name") or "").strip()
            if effective_name:
                name_conflict = db.execute_query(
                    "SELECT id FROM objectified.class_property "
                    "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s AND id != %s",
                    (class_id, effective_name, payload.parent_id, class_property_id),
                )
                if name_conflict:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"A property with name '{effective_name}' "
                            "already exists at this level in the class"
                        ),
                    )
        updates.append("parent_id = %s")
        params.append(payload.parent_id)
    if not updates:
        rows = db.execute_query(
            f"SELECT {_CLASS_PROPERTY_COLUMNS} FROM objectified.class_property "
            "WHERE id = %s AND class_id = %s",
            (class_property_id, class_id),
        )
        return ClassPropertySchema(**dict(rows[0]))
    updates.append("updated_at = timezone('utc', clock_timestamp())")
    params.extend([class_property_id, class_id])
    try:
        row = db.execute_mutation(
            f"UPDATE objectified.class_property SET {', '.join(updates)} "
            f"WHERE id = %s AND class_id = %s "
            f"RETURNING {_CLASS_PROPERTY_COLUMNS}",
            tuple(params),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A property with that name already exists at this level in the class",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to update class property") from exc
    if not row:
        raise _not_found("ClassProperty", class_property_id)
    return ClassPropertySchema(**dict(row))


@router.delete(
    "/versions/{version_id}/classes/{class_id}/properties/{class_property_id}",
    status_code=204,
    summary="Remove property from class",
    description=(
        "Remove a property from a class by deleting the class_property join row. "
        "Child properties whose parent_id references the deleted row "
        "will have their parent_id set to NULL (promoted to top-level) "
        "via the ON DELETE SET NULL foreign key constraint."
    ),
)
def remove_property_from_class(
    version_id: str,
    class_id: str,
    class_property_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Remove a property from a class (hard delete of the join row)."""
    _assert_version_exists(version_id, include_deleted=False)
    _assert_class_exists(class_id, version_id)
    _assert_class_property_exists(class_property_id, class_id)
    # Reparent children to NULL before deletion to avoid FK violations
    db.execute_mutation(
        "UPDATE objectified.class_property SET parent_id = NULL "
        "WHERE parent_id = %s AND class_id = %s "
        "RETURNING id",
        (class_property_id, class_id),
    )
    row = db.execute_mutation(
        f"""
        DELETE FROM objectified.class_property
        WHERE id = %s AND class_id = %s
        RETURNING {_CLASS_PROPERTY_COLUMNS}
        """,
        (class_property_id, class_id),
    )
    if not row:
        raise _not_found("ClassProperty", class_property_id)

