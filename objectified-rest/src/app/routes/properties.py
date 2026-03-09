"""REST routes for /v1/tenants/{tenant_id}/projects/{project_id}/properties — Property CRUD."""

import json
import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.schema_validation import validate_json_schema_object
from app.schemas.property import PropertyCreate, PropertySchema, PropertyUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Properties"])

_PROPERTY_COLUMNS = (
    "id, project_id, name, description, data, enabled, "
    "created_at, updated_at, deleted_at"
)


def _assert_property_exists(property_id: str, project_id: str) -> dict[str, Any]:
    """Raise 404 if the property does not exist or belongs to a different project."""
    rows = db.execute_query(
        f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
        "WHERE id = %s AND project_id = %s AND deleted_at IS NULL",
        (property_id, project_id),
    )
    if not rows:
        raise _not_found("Property", property_id)
    return dict(rows[0])


# ---------------------------------------------------------------------------
# Properties CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/properties",
    response_model=List[PropertySchema],
    summary="List properties for a project",
    description=(
        "Return all properties scoped to the given project. "
        "Soft-deleted properties are excluded by default; pass ``include_deleted=true`` to include them."
    ),
)
def list_properties(
    tenant_id: str,
    project_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted properties"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[PropertySchema]:
    """List properties for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    if include_deleted:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE project_id = %s ORDER BY created_at ASC",
            (project_id,),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE project_id = %s AND deleted_at IS NULL ORDER BY created_at ASC",
            (project_id,),
        )
    return [PropertySchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/properties/deleted",
    response_model=List[PropertySchema],
    summary="List deleted properties for a project",
    description="Return only soft-deleted properties for recovery or historical workflows.",
)
def list_deleted_properties(
    tenant_id: str,
    project_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[PropertySchema]:
    """List only soft-deleted properties for a project."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    rows = db.execute_query(
        f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
        "WHERE project_id = %s AND deleted_at IS NOT NULL "
        "ORDER BY deleted_at DESC, created_at ASC",
        (project_id,),
    )
    return [PropertySchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/properties/{property_id}",
    response_model=PropertySchema,
    summary="Get property by ID",
    description="Retrieve a single property by its UUID within a project.",
)
def get_property(
    tenant_id: str,
    project_id: str,
    property_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted property"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> PropertySchema:
    """Get a property by ID."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    if include_deleted:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE id = %s AND project_id = %s",
            (property_id, project_id),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE id = %s AND project_id = %s AND deleted_at IS NULL",
            (property_id, project_id),
        )
    if not rows:
        raise _not_found("Property", property_id)
    return PropertySchema(**dict(rows[0]))


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/properties/by-name/{property_name}",
    response_model=PropertySchema,
    summary="Get property by name",
    description="Retrieve a single property by its name within a project.",
)
def get_property_by_name(
    tenant_id: str,
    project_id: str,
    property_name: str,
    include_deleted: bool = Query(False, description="Include soft-deleted property"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> PropertySchema:
    """Get a property by name."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    if include_deleted:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE LOWER(name) = LOWER(%s) AND project_id = %s",
            (property_name, project_id),
        )
    else:
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE LOWER(name) = LOWER(%s) AND project_id = %s AND deleted_at IS NULL",
            (property_name, project_id),
        )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Property not found with name: {property_name}"
        )
    return PropertySchema(**dict(rows[0]))


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/properties",
    response_model=PropertySchema,
    status_code=201,
    summary="Create property",
    description=(
        "Create a new property scoped to the given project. "
        "Property names are case-insensitive and must be unique within the project."
    ),
)
def create_property(
    tenant_id: str,
    project_id: str,
    payload: PropertyCreate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> PropertySchema:
    """Create a new property."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Property name is required")

    schema_errors = validate_json_schema_object(payload.data)
    if schema_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid property data payload",
                "errors": schema_errors,
            },
        )

    # Validate payload.project_id — must match the path parameter if provided
    if payload.project_id is not None and payload.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Payload project_id does not match path project_id",
        )

    # Check for case-insensitive name uniqueness within the project (active properties only)
    existing = db.execute_query(
        "SELECT id FROM objectified.property "
        "WHERE project_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL",
        (project_id, payload.name.strip()),
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Property name already in use within this project: {payload.name.strip()}"
        )

    try:
        row = db.execute_mutation(
            f"""
            INSERT INTO objectified.property
                (project_id, name, description, data, enabled)
            VALUES (%s, %s, %s, %s::jsonb, %s)
            RETURNING {_PROPERTY_COLUMNS}
            """,
            (
                project_id,
                payload.name.strip(),
                payload.description,
                json.dumps(payload.data),
                payload.enabled,
            ),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A property with that name already exists in this project",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to create property") from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create property")

    return PropertySchema(**dict(row))


@router.put(
    "/tenants/{tenant_id}/projects/{project_id}/properties/{property_id}",
    response_model=PropertySchema,
    summary="Update property",
    description="Update an existing property. Only provided fields are modified.",
)
def update_property(
    tenant_id: str,
    project_id: str,
    property_id: str,
    payload: PropertyUpdate,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> PropertySchema:
    """Update a property by ID."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    _assert_property_exists(property_id, project_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Property name cannot be empty")

        # Check for case-insensitive name uniqueness (excluding the current property)
        existing = db.execute_query(
            "SELECT id FROM objectified.property "
            "WHERE project_id = %s AND LOWER(name) = LOWER(%s) AND id != %s AND deleted_at IS NULL",
            (project_id, payload.name.strip(), property_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Property name already in use within this project: {payload.name.strip()}"
            )

        updates.append("name = %s")
        params.append(payload.name.strip())

    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)

    if payload.data is not None:
        schema_errors = validate_json_schema_object(payload.data)
        if schema_errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid property data payload",
                    "errors": schema_errors,
                },
            )
        updates.append("data = %s::jsonb")
        params.append(json.dumps(payload.data))

    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if not updates:
        # Nothing to update — re-fetch and return the existing row unchanged
        rows = db.execute_query(
            f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
            "WHERE id = %s AND project_id = %s AND deleted_at IS NULL",
            (property_id, project_id),
        )
        return PropertySchema(**dict(rows[0]))

    params.extend([property_id, project_id])

    try:
        row = db.execute_mutation(
            f"UPDATE objectified.property SET {', '.join(updates)} "
            f"WHERE id = %s AND project_id = %s AND deleted_at IS NULL "
            f"RETURNING {_PROPERTY_COLUMNS}",
            tuple(params),
        )
    except Exception as exc:
        if "23505" in str(exc) or "unique constraint" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A property with that name already exists in this project",
            ) from exc
        raise HTTPException(status_code=500, detail="Failed to update property") from exc

    if not row:
        raise _not_found("Property", property_id)

    return PropertySchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/projects/{project_id}/properties/{property_id}",
    status_code=204,
    summary="Delete (soft-delete) property",
    description="Soft-delete a property by setting its ``deleted_at`` timestamp.",
)
def delete_property(
    tenant_id: str,
    project_id: str,
    property_id: str,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    """Soft-delete a property."""
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    _assert_property_exists(property_id, project_id)

    row = db.execute_mutation(
        f"""
        UPDATE objectified.property
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND project_id = %s AND deleted_at IS NULL
        RETURNING {_PROPERTY_COLUMNS}
        """,
        (property_id, project_id),
    )
    if not row:
        raise _not_found("Property", property_id)

