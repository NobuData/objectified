"""REST routes for schema import (OpenAPI 3.x and JSON Schema 2020-12).

Endpoints:
  POST /v1/versions/{version_id}/import/openapi
  POST /v1/versions/{version_id}/import/jsonschema

Each endpoint accepts a raw JSON document, parses it into Objectified
classes and properties, and persists them to the database.  Existing
classes are updated (description + schema); existing properties (by name
within the project) are reused.  Conflict handling beyond this basic
upsert is deferred to merge workflows.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from app.auth import require_authenticated
from app.database import db
from app.importers.jsonschema_importer import parse_jsonschema_doc
from app.importers.models import ImportedClass, ImportedProperty
from app.importers.openapi_importer import parse_openapi_doc
from app.routes.class_properties import _CLASS_PROPERTY_COLUMNS
from app.routes.classes import _CLASS_COLUMNS
from app.routes.properties import _PROPERTY_COLUMNS
from app.routes.validate import _validate_openapi_document
from app.routes.versions import _assert_version_exists
from app.schemas.import_model import ImportResult

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Import"])


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _find_or_create_class(
    version_id: str,
    imported_cls: ImportedClass,
    result: ImportResult,
) -> str:
    """Find an existing class by name in the version or create a new one.

    Returns the class UUID.
    """
    rows = db.execute_query(
        f"SELECT {_CLASS_COLUMNS} FROM objectified.class "
        "WHERE version_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL",
        (version_id, imported_cls.name),
    )
    if rows:
        class_id = str(dict(rows[0])["id"])
        # Update description and schema to reflect the imported document.
        db.execute_mutation(
            "UPDATE objectified.class SET description = %s, schema = %s::jsonb "
            "WHERE id = %s",
            (
                imported_cls.description or "",
                json.dumps(imported_cls.schema),
                class_id,
            ),
        )
        result.classes_updated += 1
        result.detail.append(f"Class '{imported_cls.name}': updated (id={class_id})")
        return class_id

    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.class
            (version_id, name, description, schema, metadata, enabled)
        VALUES (%s, %s, %s, %s::jsonb, '{{}}'::jsonb, true)
        RETURNING {_CLASS_COLUMNS}
        """,
        (
            version_id,
            imported_cls.name,
            imported_cls.description or "",
            json.dumps(imported_cls.schema),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail=f"Failed to create class '{imported_cls.name}'")
    class_id = str(dict(row)["id"])
    result.classes_created += 1
    result.detail.append(f"Class '{imported_cls.name}': created (id={class_id})")
    return class_id


def _find_or_create_property(
    project_id: str,
    imported_prop: ImportedProperty,
    result: ImportResult,
) -> str:
    """Find an existing property by name in the project or create a new one.

    Returns the property UUID.
    """
    rows = db.execute_query(
        f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
        "WHERE project_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL",
        (project_id, imported_prop.name),
    )
    if rows:
        prop_id = str(dict(rows[0])["id"])
        result.properties_reused += 1
        return prop_id

    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.property
            (project_id, name, description, data, enabled)
        VALUES (%s, %s, %s, %s::jsonb, true)
        RETURNING {_PROPERTY_COLUMNS}
        """,
        (
            project_id,
            imported_prop.name,
            imported_prop.description or "",
            json.dumps(imported_prop.data),
        ),
    )
    if not row:
        raise HTTPException(
            status_code=500, detail=f"Failed to create property '{imported_prop.name}'"
        )
    prop_id = str(dict(row)["id"])
    result.properties_created += 1
    return prop_id


def _create_class_property(
    class_id: str,
    property_id: str,
    imported_prop: ImportedProperty,
    parent_class_property_id: Optional[str],
    result: ImportResult,
) -> str:
    """Create a class_property join row if one does not already exist.

    Returns the class_property UUID (existing or newly created).
    """
    if parent_class_property_id is not None:
        existing = db.execute_query(
            "SELECT id FROM objectified.class_property "
            "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id = %s",
            (class_id, imported_prop.name, parent_class_property_id),
        )
    else:
        existing = db.execute_query(
            "SELECT id FROM objectified.class_property "
            "WHERE class_id = %s AND LOWER(name) = LOWER(%s) AND parent_id IS NULL",
            (class_id, imported_prop.name),
        )

    if existing:
        cp_id = str(dict(existing[0])["id"])
        result.class_properties_skipped += 1
        return cp_id

    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.class_property
            (class_id, property_id, parent_id, name, description, data)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        RETURNING {_CLASS_PROPERTY_COLUMNS}
        """,
        (
            class_id,
            property_id,
            parent_class_property_id,
            imported_prop.name,
            imported_prop.description or "",
            json.dumps(imported_prop.data),
        ),
    )
    if not row:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create class property '{imported_prop.name}'",
        )
    cp_id = str(dict(row)["id"])
    result.class_properties_created += 1
    return cp_id


def _execute_import(
    version_id: str,
    imported_classes: list[ImportedClass],
) -> ImportResult:
    """Persist a list of :class:`ImportedClass` objects to the database.

    :param version_id: The version UUID to import into.
    :param imported_classes: Parsed classes from the import document.
    :returns: :class:`ImportResult` summary.
    """
    result = ImportResult()

    # Resolve project_id from the version row (needed to scope properties).
    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])

    for imported_cls in imported_classes:
        # 1. Find or create the class.
        class_id = _find_or_create_class(version_id, imported_cls, result)

        # 2. Build a path → class_property_id mapping for parent resolution.
        #    Using the full dot-separated path as the key prevents collisions
        #    when the same property name appears in multiple nested branches
        #    (e.g. shipping.street vs. billing.street).
        #    We process top-level properties first, then nested ones so that
        #    parent IDs are available when children are processed.
        cp_id_by_path: dict[str, str] = {}

        top_level = [p for p in imported_cls.properties if p.parent_path is None]
        nested = [p for p in imported_cls.properties if p.parent_path is not None]

        for prop in top_level:
            prop_id = _find_or_create_property(project_id, prop, result)
            cp_id = _create_class_property(class_id, prop_id, prop, None, result)
            cp_id_by_path[prop.name] = cp_id

        # Process nested properties; if the parent was not already found above
        # (e.g. deeply nested), fall back to None (top-level) gracefully.
        for prop in nested:
            prop_id = _find_or_create_property(project_id, prop, result)
            parent_cp_id = cp_id_by_path.get(prop.parent_path) if prop.parent_path else None
            cp_id = _create_class_property(class_id, prop_id, prop, parent_cp_id, result)
            # Key by full path to avoid collisions with same-named siblings.
            prop_path = f"{prop.parent_path}.{prop.name}"
            cp_id_by_path[prop_path] = cp_id

    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/versions/{version_id}/import/openapi",
    response_model=ImportResult,
    status_code=200,
    summary="Import OpenAPI 3.x document",
    description=(
        "Import an OpenAPI 3.x document into the given version. "
        "All schemas found in ``components/schemas`` are created as classes. "
        "Properties are extracted from each schema and linked via class_property rows. "
        "Existing classes (matched by name, case-insensitive) are updated; "
        "existing properties (matched by name within the project) are reused. "
        "Conflict handling beyond this basic upsert is deferred to merge workflows."
    ),
    responses={
        200: {"description": "Import summary"},
        400: {"description": "Invalid or unrecognisable OpenAPI document"},
        404: {"description": "Version not found"},
    },
)
def import_openapi(
    version_id: str,
    doc: dict[str, Any] = Body(..., description="OpenAPI 3.x document as JSON"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ImportResult:
    """Import an OpenAPI 3.x document into the given version."""
    if not isinstance(doc, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    # Reuse the shared validation logic from the /validate/openapi-document endpoint
    # so that both endpoints stay consistent as new checks are added.
    validation = _validate_openapi_document(doc)
    if not validation.valid:
        raise HTTPException(
            status_code=400,
            detail="; ".join(validation.errors),
        )

    imported_classes = parse_openapi_doc(doc)
    logger.info(
        "import_openapi: version=%s parsed %d classes",
        version_id,
        len(imported_classes),
    )

    result = _execute_import(version_id, imported_classes)

    logger.info(
        "import_openapi: version=%s classes_created=%d classes_updated=%d "
        "properties_created=%d properties_reused=%d cp_created=%d",
        version_id,
        result.classes_created,
        result.classes_updated,
        result.properties_created,
        result.properties_reused,
        result.class_properties_created,
    )
    return result


@router.post(
    "/versions/{version_id}/import/jsonschema",
    response_model=ImportResult,
    status_code=200,
    summary="Import JSON Schema 2020-12 document",
    description=(
        "Import a JSON Schema 2020-12 document into the given version. "
        "Documents with ``$defs`` create one class per definition; "
        "a document without ``$defs`` is treated as a single class "
        "using the ``title`` field (or 'Schema' if absent) as the class name. "
        "Existing classes are updated; existing properties are reused. "
        "Conflict handling beyond this basic upsert is deferred to merge workflows."
    ),
    responses={
        200: {"description": "Import summary"},
        400: {"description": "Invalid or unrecognisable JSON Schema document"},
        404: {"description": "Version not found"},
    },
)
def import_jsonschema(
    version_id: str,
    doc: dict[str, Any] = Body(..., description="JSON Schema 2020-12 document as JSON"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ImportResult:
    """Import a JSON Schema 2020-12 document into the given version."""
    if not isinstance(doc, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    schema_version = str(doc.get("$schema") or "")
    if schema_version and "2020-12" not in schema_version and "draft" not in schema_version:
        logger.warning(
            "import_jsonschema: unrecognised $schema value '%s', proceeding anyway",
            schema_version,
        )

    imported_classes = parse_jsonschema_doc(doc)
    logger.info(
        "import_jsonschema: version=%s parsed %d classes",
        version_id,
        len(imported_classes),
    )

    result = _execute_import(version_id, imported_classes)

    logger.info(
        "import_jsonschema: version=%s classes_created=%d classes_updated=%d "
        "properties_created=%d properties_reused=%d cp_created=%d",
        version_id,
        result.classes_created,
        result.classes_updated,
        result.properties_created,
        result.properties_reused,
        result.class_properties_created,
    )
    return result

