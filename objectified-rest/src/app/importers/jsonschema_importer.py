"""JSON Schema 2020-12 document importer.

Parses a JSON Schema 2020-12 document and extracts classes and properties
for import into Objectified.

Supports two document forms:
- Multi-schema: ``$defs`` at the top level — each $def entry becomes a class.
- Single-schema: no ``$defs`` — the entire document is treated as one class
  using ``title`` (or a caller-supplied name) as the class name.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.importers.models import ImportedClass, ImportedProperty
from app.importers.openapi_importer import _extract_properties, _parse_single_schema

logger = logging.getLogger(__name__)

# Keys present at the top level of a JSON Schema 2020-12 document that are
# meta/document-level and should not be treated as schema properties.
_DOC_LEVEL_KEYS = {"$schema", "$id", "title", "description", "$defs", "definitions"}

# Keys that define schema-level overrides to strip from classes.
_CLASS_SCHEMA_STRIP_KEYS = {"properties", "required", "title", "$schema", "$id", "$defs", "definitions"}


def _jsonschema_schema_to_openapi_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Lightly normalise a JSON Schema 2020-12 schema to OpenAPI-compatible form.

    JSON Schema uses ``$ref: #/$defs/Name``; OpenAPI uses
    ``$ref: #/components/schemas/Name``.  We keep the $ref as-is because
    the importer stores property data verbatim.  The main normalisation is
    converting ``definitions`` to ``properties`` style access, which the
    shared ``_extract_properties`` already handles.
    """
    return dict(schema)


def parse_jsonschema_doc(doc: dict[str, Any], *, fallback_name: str = "Schema") -> list[ImportedClass]:
    """Parse a JSON Schema 2020-12 document and return :class:`ImportedClass` objects.

    - If the document has a ``$defs`` (or ``definitions``) key, each entry
      becomes a separate class.
    - Otherwise the whole document is treated as a single class.

    :param doc: Raw JSON Schema 2020-12 document as a dict.
    :param fallback_name: Class name used when a single-schema doc has no ``title``.
    :returns: List of :class:`ImportedClass` objects.
    """
    if not isinstance(doc, dict):
        return []

    # Explicitly check for key presence so that an empty $defs ({}) is treated as
    # the multi-schema form with zero definitions (not the single-schema fallback).
    # We cannot use `doc.get("$defs") or doc.get("definitions")` because an empty
    # dict is falsy and would incorrectly fall through to single-schema mode.
    if "$defs" in doc:
        defs: Optional[dict[str, Any]] = doc["$defs"]
    elif "definitions" in doc:
        defs = doc["definitions"]
    else:
        defs = None
    has_defs = defs is not None

    if has_defs and isinstance(defs, dict):
        # Multi-schema form.
        classes: list[ImportedClass] = []
        for def_name, def_schema in defs.items():
            if not isinstance(def_schema, dict):
                continue
            schema_obj = _jsonschema_schema_to_openapi_schema(def_schema)
            imported_class = _parse_single_schema(def_name, schema_obj)
            classes.append(imported_class)
            logger.debug(
                "parse_jsonschema_doc: parsed class '%s' with %d properties",
                def_name,
                len(imported_class.properties),
            )
        logger.info("parse_jsonschema_doc: parsed %d classes from $defs", len(classes))
        return classes

    # Single-schema form: strip document-level keys and treat the rest as the schema.
    class_name = doc.get("title") or fallback_name
    schema_obj = _jsonschema_schema_to_openapi_schema(doc)
    imported_class = _parse_single_schema(class_name, schema_obj)
    logger.info(
        "parse_jsonschema_doc: parsed single class '%s' with %d properties",
        class_name,
        len(imported_class.properties),
    )
    return [imported_class]



