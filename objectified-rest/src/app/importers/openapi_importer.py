"""OpenAPI 3.x document importer.

Parses an OpenAPI 3.x document and extracts classes and properties
from ``components/schemas`` for import into Objectified.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.importers.models import ImportedClass, ImportedProperty

logger = logging.getLogger(__name__)

# Properties to strip from the top-level schema before storing as class.schema.
_CLASS_SCHEMA_STRIP_KEYS = {"properties", "required", "title"}


def _extract_properties(
    schema: dict[str, Any],
    *,
    parent_name: Optional[str] = None,
    depth: int = 0,
    max_depth: int = 8,
) -> list[ImportedProperty]:
    """Recursively extract properties from a schema dict.

    :param schema: A JSON Schema / OpenAPI schema object.
    :param parent_name: Name of the enclosing property (for nesting).
    :param depth: Current recursion depth (guard against deep nesting).
    :param max_depth: Maximum recursion depth.
    :returns: Flat list of :class:`ImportedProperty` objects.
    """
    if depth > max_depth:
        logger.warning("_extract_properties: max depth %d reached, stopping recursion", max_depth)
        return []

    raw_properties: dict[str, Any] = schema.get("properties") or {}
    required_names: set[str] = set(schema.get("required") or [])

    result: list[ImportedProperty] = []
    for prop_name, prop_schema in raw_properties.items():
        if not isinstance(prop_schema, dict):
            continue

        # Build the data dict for the property: start from the raw schema,
        # mark required flag, strip nested properties (those become children).
        data: dict[str, Any] = {k: v for k, v in prop_schema.items() if k not in ("properties",)}
        if prop_name in required_names:
            data["required"] = True

        description = prop_schema.get("description") or prop_schema.get("title") or ""

        imported = ImportedProperty(
            name=prop_name,
            description=description,
            data=data,
            parent_name=parent_name,
        )
        result.append(imported)

        # Recurse for object/array types with nested properties.
        nested_schema: Optional[dict[str, Any]] = None
        if prop_schema.get("type") == "object" and prop_schema.get("properties"):
            nested_schema = prop_schema
        elif (
            prop_schema.get("type") == "array"
            and isinstance(prop_schema.get("items"), dict)
            and prop_schema["items"].get("properties")
        ):
            nested_schema = prop_schema["items"]

        if nested_schema:
            children = _extract_properties(
                nested_schema,
                parent_name=prop_name,
                depth=depth + 1,
                max_depth=max_depth,
            )
            result.extend(children)

    return result


def _parse_single_schema(
    name: str,
    schema: dict[str, Any],
) -> ImportedClass:
    """Convert a single named OpenAPI schema object into an :class:`ImportedClass`."""
    description = schema.get("description") or schema.get("title") or ""

    # Build the base class schema: strip fields we derive from class_property rows.
    class_schema = {k: v for k, v in schema.items() if k not in _CLASS_SCHEMA_STRIP_KEYS}

    properties = _extract_properties(schema)

    return ImportedClass(
        name=name,
        description=description,
        schema=class_schema,
        properties=properties,
    )


def parse_openapi_doc(doc: dict[str, Any]) -> list[ImportedClass]:
    """Parse an OpenAPI 3.x document and return a list of :class:`ImportedClass` objects.

    Schemas are read from ``components/schemas``.  Documents that have no
    schemas section are silently treated as having zero classes.

    :param doc: Raw OpenAPI document as a dict.
    :returns: List of :class:`ImportedClass` objects, one per schema entry.
    """
    if not isinstance(doc, dict):
        return []

    components = doc.get("components") or {}
    schemas: dict[str, Any] = components.get("schemas") or {}

    classes: list[ImportedClass] = []
    for schema_name, schema_obj in schemas.items():
        if not isinstance(schema_obj, dict):
            continue
        imported_class = _parse_single_schema(schema_name, schema_obj)
        classes.append(imported_class)
        logger.debug(
            "parse_openapi_doc: parsed class '%s' with %d properties",
            schema_name,
            len(imported_class.properties),
        )

    logger.info("parse_openapi_doc: parsed %d classes from OpenAPI document", len(classes))
    return classes

