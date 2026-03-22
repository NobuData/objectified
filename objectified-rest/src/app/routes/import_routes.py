"""REST routes for schema import (OpenAPI 3.x and JSON Schema 2020-12).

Endpoints:
  POST /v1/versions/{version_id}/import/openapi
  POST /v1/versions/{version_id}/import/jsonschema
  POST /v1/versions/{version_id}/import/fetch-url

Each import endpoint accepts a raw JSON document, parses it into Objectified
classes and properties, and persists them to the database unless ``dry_run``
is true. Existing classes are updated (description + schema); existing
properties (by name within the project) are reused. Conflict handling
beyond this basic upsert is deferred to merge workflows.

``fetch-url`` retrieves JSON or YAML over HTTPS (optional auth headers) for
use with the import endpoints.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Optional
from urllib.parse import urljoin

import httpx
import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.auth import require_authenticated, require_version_permission
from app.database import db
from app.importers.jsonschema_importer import parse_jsonschema_doc
from app.importers.models import ImportedClass, ImportedProperty
from app.importers.openapi_importer import parse_openapi_doc
from app.routes.class_properties import _CLASS_PROPERTY_COLUMNS
from app.routes.classes import _CLASS_COLUMNS
from app.routes.properties import _PROPERTY_COLUMNS
from app.routes.validate import _validate_openapi_document
from app.routes.versions import _assert_version_exists
from app.schemas.import_model import FetchImportUrlRequest, FetchImportUrlResponse, ImportResult
from app.url_safety import SSRFBlockedError, assert_https_url_safe_for_fetch, make_ssrf_validated_transport

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Import"])

_FETCH_MAX_BYTES = 5 * 1024 * 1024
_BLOCKED_FETCH_HEADER_NAMES = frozenset(
    {
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
        "keep-alive",
        "proxy-connection",
    }
)


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


def _merge_fetch_headers(headers: dict[str, str] | None) -> dict[str, str]:
    merged: dict[str, str] = {
        "User-Agent": "Objectified/1.0 (schema-import)",
        "Accept": "application/json, application/yaml, text/yaml, */*",
    }
    if not headers:
        return merged
    for key, value in headers.items():
        if key.lower() in _BLOCKED_FETCH_HEADER_NAMES:
            continue
        merged[key] = value
    return merged


def _parse_fetched_body(raw: bytes, content_type: str | None) -> dict[str, Any]:
    """Parse JSON or YAML bytes into a dict for import."""
    text = raw.decode("utf-8-sig")
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = yaml.safe_load(text)
    else:
        parsed = yaml.safe_load(text)
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=400,
            detail="Fetched document must be a JSON object at the root",
        )
    return parsed


def _preview_find_or_create_class(
    version_id: str,
    imported_cls: ImportedClass,
    result: ImportResult,
) -> str:
    """Resolve class as in import, but only count creates/updates (no writes)."""
    rows = db.execute_query(
        f"SELECT {_CLASS_COLUMNS} FROM objectified.class "
        "WHERE version_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL",
        (version_id, imported_cls.name),
    )
    if rows:
        class_id = str(dict(rows[0])["id"])
        result.classes_updated += 1
        result.detail.append(f"Class '{imported_cls.name}': would update (id={class_id})")
        return class_id

    result.classes_created += 1
    result.detail.append(f"Class '{imported_cls.name}': would create")
    return f"__preview_new__:{imported_cls.name}"


def _preview_find_or_create_property(
    project_id: str,
    imported_prop: ImportedProperty,
    result: ImportResult,
) -> str:
    rows = db.execute_query(
        f"SELECT {_PROPERTY_COLUMNS} FROM objectified.property "
        "WHERE project_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL",
        (project_id, imported_prop.name),
    )
    if rows:
        prop_id = str(dict(rows[0])["id"])
        result.properties_reused += 1
        return prop_id

    result.properties_created += 1
    return f"__preview_new_prop__:{imported_prop.name}"


def _preview_create_class_property(
    class_id: str,
    property_id: str,
    imported_prop: ImportedProperty,
    parent_class_property_id: Optional[str],
    result: ImportResult,
) -> str:
    # A synthetic class_id means the class does not yet exist in the DB.
    # Skip the existence query – every class_property link is a would-create.
    if class_id.startswith("__preview_new__:"):
        result.class_properties_created += 1
        return (
            f"__preview_cp__:{class_id}:{imported_prop.name}:{parent_class_property_id or 'root'}"
        )

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

    result.class_properties_created += 1
    return (
        f"__preview_cp__:{class_id}:{imported_prop.name}:{parent_class_property_id or 'root'}"
    )


def _preview_import(
    version_id: str,
    imported_classes: list[ImportedClass],
) -> ImportResult:
    """Project counts and detail lines without persisting (dry-run)."""
    result = ImportResult(dry_run=True)

    version = _assert_version_exists(version_id, include_deleted=False)
    project_id = str(version["project_id"])

    for imported_cls in imported_classes:
        class_id = _preview_find_or_create_class(version_id, imported_cls, result)

        cp_id_by_path: dict[str, str] = {}
        top_level = [p for p in imported_cls.properties if p.parent_path is None]
        nested = [p for p in imported_cls.properties if p.parent_path is not None]

        for prop in top_level:
            prop_id = _preview_find_or_create_property(project_id, prop, result)
            cp_id = _preview_create_class_property(class_id, prop_id, prop, None, result)
            cp_id_by_path[prop.name] = cp_id

        for prop in nested:
            prop_id = _preview_find_or_create_property(project_id, prop, result)
            parent_cp_id = cp_id_by_path.get(prop.parent_path) if prop.parent_path else None
            cp_id = _preview_create_class_property(class_id, prop_id, prop, parent_cp_id, result)
            prop_path = f"{prop.parent_path}.{prop.name}"
            cp_id_by_path[prop_path] = cp_id

    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/versions/{version_id}/import/fetch-url",
    response_model=FetchImportUrlResponse,
    status_code=200,
    summary="Fetch OpenAPI or JSON Schema document from HTTPS URL",
    description=(
        "Fetches a document over HTTPS for subsequent import. "
        "Supports JSON and YAML bodies. Optional ``headers`` can supply authentication "
        "(for example ``Authorization``). URLs must be public HTTPS endpoints; "
        "private and loopback addresses are rejected (SSRF mitigation)."
    ),
    responses={
        200: {"description": "Parsed document"},
        400: {"description": "Invalid URL, unsafe host, or unparseable body"},
        502: {"description": "Upstream HTTP error or timeout when fetching the URL"},
    },
)
def fetch_import_url(
    version_id: str,
    body: FetchImportUrlRequest,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> FetchImportUrlResponse:
    """HTTPS GET with size cap; parse JSON or YAML to a dict."""
    _ = caller
    _assert_version_exists(version_id, include_deleted=False)

    safe_url = assert_https_url_safe_for_fetch(body.url)
    headers = _merge_fetch_headers(body.headers)

    collected = bytearray()
    content_type: str | None = None
    _max_redirects = 5
    try:
        with httpx.Client(
            timeout=30.0,
            follow_redirects=False,
            transport=make_ssrf_validated_transport(),
        ) as client:
            current_url = safe_url
            redirects_remaining = _max_redirects
            while True:
                with client.stream("GET", current_url, headers=headers) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise HTTPException(
                                status_code=502,
                                detail="Redirect response missing Location header",
                            )

                        if redirects_remaining <= 0:
                            raise HTTPException(
                                status_code=400,
                                detail="Too many redirects while fetching URL",
                            )
                        redirects_remaining -= 1

                        next_url = urljoin(current_url, location)
                        current_url = assert_https_url_safe_for_fetch(next_url)
                        continue

                    response.raise_for_status()
                    content_type = response.headers.get("content-type")
                    for chunk in response.iter_bytes():
                        collected.extend(chunk)
                        if len(collected) > _FETCH_MAX_BYTES:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Response exceeds maximum size of {_FETCH_MAX_BYTES} bytes",
                            )
                    break
    except SSRFBlockedError as exc:
        logger.warning("fetch_import_url: SSRF blocked for %s: %s", safe_url, exc.detail)
        raise HTTPException(status_code=400, detail=exc.detail) from exc
    except httpx.HTTPStatusError as exc:
        logger.warning("fetch_import_url: HTTP error %s for %s", exc.response.status_code, safe_url)
        raise HTTPException(
            status_code=502,
            detail=f"URL returned HTTP {exc.response.status_code}",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("fetch_import_url: request error for %s: %s", safe_url, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch URL") from exc

    raw = bytes(collected)
    document = _parse_fetched_body(raw, content_type)
    return FetchImportUrlResponse(document=document, content_type=content_type)


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
    dry_run: Annotated[
        bool,
        Query(
            description="If true, compute projected changes without persisting to the database.",
        ),
    ] = False,
    doc: dict[str, Any] = Body(..., description="OpenAPI 3.x document as JSON"),
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ImportResult:
    """Import an OpenAPI 3.x document into the given version."""
    _ = caller
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
        "import_openapi: version=%s dry_run=%s parsed %d classes",
        version_id,
        dry_run,
        len(imported_classes),
    )

    if dry_run:
        result = _preview_import(version_id, imported_classes)
    else:
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
    dry_run: Annotated[
        bool,
        Query(
            description="If true, compute projected changes without persisting to the database.",
        ),
    ] = False,
    doc: dict[str, Any] = Body(..., description="JSON Schema 2020-12 document as JSON"),
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> ImportResult:
    """Import a JSON Schema 2020-12 document into the given version."""
    _ = caller
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
        "import_jsonschema: version=%s dry_run=%s parsed %d classes",
        version_id,
        dry_run,
        len(imported_classes),
    )

    if dry_run:
        result = _preview_import(version_id, imported_classes)
    else:
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

