"""REST routes for schema export (OpenAPI 3.2.0 and JSON Schema 2020-12)."""

import json
import logging
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.auth import require_authenticated
from app.database import db
from app.generators.jsonschema_generator import generate_jsonschema_multi, generate_jsonschema_single
from app.generators.openapi_generator import generate_openapi_spec
from app.routes.classes import _CLASS_COLUMNS
from app.routes.helpers import _not_found
from app.routes.versions import _assert_version_exists

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Export"])


def _parse_json_param(value: Optional[str], name: str) -> Any:
    """Parse a JSON-encoded query parameter value.

    Returns ``None`` when *value* is ``None`` (parameter not supplied).
    Raises :class:`~fastapi.HTTPException` 400 if the string is not valid JSON.
    """
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):

        raise HTTPException(
            status_code=400,
            detail=f"Invalid JSON in '{name}' query parameter.",
        )


def _load_classes_with_properties(version_id: str) -> list[dict[str, Any]]:
    """Load all active classes and their class properties for a version."""
    class_rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class
        WHERE version_id = %s
          AND deleted_at IS NULL
        ORDER BY name ASC
        """,
        (version_id,),
    )
    if not class_rows:
        return []

    classes: list[dict[str, Any]] = []
    class_by_id: dict[str, dict[str, Any]] = {}
    for row in class_rows:
        cls = dict(row)
        if "schema" in cls and "schema_" not in cls:
            cls["schema_"] = cls["schema"]
        cls["properties"] = []
        classes.append(cls)
        class_by_id[str(cls["id"])] = cls

    class_ids = list(class_by_id.keys())
    placeholders = ", ".join(["%s"] * len(class_ids))

    prop_rows = db.execute_query(
        f"""
        SELECT cp.id, cp.class_id, cp.property_id, cp.parent_id, cp.name,
               cp.description, cp.data, p.name AS property_name, p.data AS property_data
        FROM objectified.class_property cp
        JOIN objectified.property p ON p.id = cp.property_id AND p.deleted_at IS NULL
        WHERE cp.class_id IN ({placeholders})
        ORDER BY cp.name ASC
        """,
        tuple(class_ids),
    )

    for prop in prop_rows:
        prop_dict = dict(prop)
        cid = str(prop_dict.get("class_id") or "")
        if cid in class_by_id:
            class_by_id[cid]["properties"].append(prop_dict)

    return classes


def _load_single_class_with_properties(
    version_id: str, class_id: str
) -> dict[str, Any]:
    """Load a single class and its properties. Raises 404 if not found."""
    class_rows = db.execute_query(
        f"""
        SELECT {_CLASS_COLUMNS}
        FROM objectified.class
        WHERE id = %s
          AND version_id = %s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (class_id, version_id),
    )
    if not class_rows:
        raise _not_found("Class", class_id)

    cls = dict(class_rows[0])
    if "schema" in cls and "schema_" not in cls:
        cls["schema_"] = cls["schema"]

    prop_rows = db.execute_query(
        """
        SELECT cp.id, cp.class_id, cp.property_id, cp.parent_id, cp.name,
               cp.description, cp.data, p.name AS property_name, p.data AS property_data
        FROM objectified.class_property cp
        JOIN objectified.property p ON p.id = cp.property_id AND p.deleted_at IS NULL
        WHERE cp.class_id = %s
        ORDER BY cp.name ASC
        """,
        (class_id,),
    )
    cls["properties"] = [dict(p) for p in prop_rows]
    return cls


@router.get(
    "/versions/{version_id}/export/openapi",
    summary="Export version as OpenAPI 3.2.0",
    description=(
        "Generate and export an OpenAPI 3.2.0 specification document for the given version. "
        "All active classes in the version are exported as components/schemas entries. "
        "The response is a JSON document conforming to the OpenAPI 3.2.0 specification."
    ),
    response_class=JSONResponse,
    responses={
        200: {
            "description": "OpenAPI 3.2.0 specification document",
            "content": {"application/json": {}},
        },
        400: {"description": "Invalid JSON in query parameter"},
        404: {"description": "Version not found"},
    },
)
def export_openapi(
    version_id: str,
    project_name: Optional[str] = Query(
        None, description="Override the API title (info.title)."
    ),
    api_version: Optional[str] = Query(
        None, alias="version", description="Override the API version string (info.version)."
    ),
    description: Optional[str] = Query(
        None, description="Override the API description (info.description)."
    ),
    servers_json: Optional[str] = Query(
        None,
        alias="servers",
        description=(
            "JSON-encoded array of server objects, e.g. "
            '[{"url":"https://api.example.com","description":"Production"}].'
        ),
    ),
    tags_json: Optional[str] = Query(
        None,
        alias="tags",
        description=(
            "JSON-encoded array of tag objects, e.g. "
            '[{"name":"Users","description":"User operations"}].'
        ),
    ),
    security_json: Optional[str] = Query(
        None,
        alias="security",
        description=(
            "JSON-encoded array of security requirement objects, e.g. "
            '[{"Bearer":[]}].'
        ),
    ),
    external_docs_json: Optional[str] = Query(
        None,
        alias="external_docs",
        description=(
            "JSON-encoded external documentation object, e.g. "
            '{"url":"https://docs.example.com","description":"API documentation"}.'
        ),
    ),
    metadata_json: Optional[str] = Query(
        None,
        alias="metadata",
        description=(
            "JSON-encoded metadata object with optional keys: summary, terms_of_service, "
            "contact ({name, url, email}), license ({name, identifier, url})."
        ),
    ),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> JSONResponse:
    """Export a version as an OpenAPI 3.2.0 specification document."""
    version = _assert_version_exists(version_id, include_deleted=False)
    classes = _load_classes_with_properties(version_id)

    # Parse optional JSON query parameters.
    servers = _parse_json_param(servers_json, "servers")
    tags = _parse_json_param(tags_json, "tags")
    security = _parse_json_param(security_json, "security")
    external_docs = _parse_json_param(external_docs_json, "external_docs")
    metadata = _parse_json_param(metadata_json, "metadata")

    doc = generate_openapi_spec(
        classes,
        project_name=project_name or version.get("name") or "API Schema",
        version=api_version or "1.0.0",
        description=description,
        openapi_version="3.2.0",
        servers=servers,
        tags=tags,
        security=security,
        external_docs=external_docs,
        metadata=metadata,
    )

    logger.info(
        "export_openapi: exported version %s with %d classes",
        version_id,
        len(classes),
    )

    return JSONResponse(
        content=doc,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="openapi-{version_id}.json"',
        },
    )


@router.get(
    "/versions/{version_id}/export/jsonschema",
    summary="Export version as JSON Schema 2020-12",
    description=(
        "Generate and export a JSON Schema 2020-12 document for the given version. "
        "By default all active classes are exported as $defs entries in a single "
        "multi-schema document. "
        "Pass class_id to export only a single class as a standalone JSON Schema document."
    ),
    response_class=JSONResponse,
    responses={
        200: {
            "description": "JSON Schema 2020-12 document",
            "content": {"application/json": {}},
        },
        404: {"description": "Version or class not found"},
    },
)
def export_jsonschema(
    version_id: str,
    class_id: Optional[str] = Query(
        None,
        description=(
            "Optional class UUID. When provided, export only this class as a standalone "
            "JSON Schema document instead of the full multi-schema document."
        ),
    ),
    project_name: Optional[str] = Query(
        None, description="Override the schema title."
    ),
    schema_version: Optional[str] = Query(
        None, alias="version", description="Override the version string used in the generated document."
    ),
    description: Optional[str] = Query(
        None, description="Override the description in the generated document."
    ),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> JSONResponse:
    """Export a version as a JSON Schema 2020-12 document (multi or single class)."""
    version = _assert_version_exists(version_id, include_deleted=False)

    effective_version = schema_version or "1.0.0"
    effective_project_name = project_name or version.get("name") or "JSON Schema"

    if class_id:
        cls = _load_single_class_with_properties(version_id, class_id)
        doc = generate_jsonschema_single(
            cls,
            project_name=effective_project_name,
            version=effective_version,
            description=description,
        )
        filename = f"jsonschema-{class_id}.json"
    else:
        classes = _load_classes_with_properties(version_id)
        doc = generate_jsonschema_multi(
            classes,
            project_name=effective_project_name,
            version=effective_version,
            description=description,
        )
        filename = f"jsonschema-{version_id}.json"

    logger.info(
        "export_jsonschema: exported version %s class_id=%s",
        version_id,
        class_id or "<all>",
    )

    return JSONResponse(
        content=doc,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

