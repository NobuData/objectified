"""Export validation constraints in a stable JSON shape for codegen and docs.

Mirrors the resolved class/property schema from ``build_class_schema`` but strips
to validation-oriented fields (required, type, format, pattern, bounds, enum, …).
Reference: GitHub #122.
"""

from __future__ import annotations

import logging
from typing import Any

from app.generators.openapi_generator import build_class_schema

logger = logging.getLogger(__name__)

_EXPORT_KIND = "objectified.validation-rules"
_EXPORT_SCHEMA_VERSION = "1.0.0"

_SCALAR_VALIDATION_KEYS = frozenset(
    {
        "type",
        "format",
        "pattern",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
        "minItems",
        "maxItems",
        "uniqueItems",
        "minContains",
        "maxContains",
        "enum",
        "const",
        "default",
        "nullable",
        "minProperties",
        "maxProperties",
        "contentEncoding",
        "contentMediaType",
    }
)

_ARRAY_SUFFIX_KEYS = frozenset(
    {"minItems", "maxItems", "uniqueItems", "minContains", "maxContains"}
)

_CONDITIONAL_KEYS = frozenset({"not", "if", "then", "else", "dependentRequired"})


def _extract_field_rules(schema: Any) -> dict[str, Any]:
    """Reduce a JSON Schema fragment to validation-oriented fields."""
    if not isinstance(schema, dict):
        return {}
    if "$ref" in schema:
        return {"$ref": schema["$ref"]}

    out: dict[str, Any] = {}
    for key in _SCALAR_VALIDATION_KEYS:
        if key in schema and schema[key] is not None:
            out[key] = schema[key]

    items = schema.get("items")
    if isinstance(items, dict):
        extracted = _extract_field_rules(items)
        if extracted:
            out["items"] = extracted

    nested = schema.get("properties")
    if isinstance(nested, dict) and nested:
        req_list = schema.get("required")
        req_set = set(req_list) if isinstance(req_list, list) else set()
        out["properties"] = {}
        for pname, ps in nested.items():
            child = _extract_field_rules(ps if isinstance(ps, dict) else {})
            child["required"] = pname in req_set
            out["properties"][pname] = child
        if req_list:
            out["requiredProperties"] = list(req_list)

    for key in _ARRAY_SUFFIX_KEYS:
        if key in schema and key not in out:
            out[key] = schema[key]

    for key in _CONDITIONAL_KEYS:
        if key in schema:
            out[key] = schema[key]

    return out


def _class_validation_entry(class_row: dict[str, Any]) -> dict[str, Any]:
    full = build_class_schema(class_row)
    name = class_row.get("name") or ""
    req_names = full.get("required") or []
    req_set = set(req_names) if isinstance(req_names, list) else set()
    props_raw = full.get("properties") or {}
    properties_out: dict[str, Any] = {}
    if isinstance(props_raw, dict):
        for pname, pschema in props_raw.items():
            rules = _extract_field_rules(pschema if isinstance(pschema, dict) else {})
            rules["required"] = pname in req_set
            properties_out[pname] = rules

    entry: dict[str, Any] = {
        "name": name,
        "properties": properties_out,
    }
    desc = full.get("description") or class_row.get("description")
    if desc:
        entry["description"] = desc
    if req_names:
        entry["required"] = list(req_names)
    cid = class_row.get("id")
    if cid:
        entry["id"] = str(cid)
    return entry


def generate_validation_rules_export(
    classes: list[dict[str, Any]],
    *,
    version_id: str,
    version_name: str = "",
    title: str | None = None,
) -> dict[str, Any]:
    """Build the validation-rules JSON document for all classes in a version."""
    doc: dict[str, Any] = {
        "exportKind": _EXPORT_KIND,
        "schemaVersion": _EXPORT_SCHEMA_VERSION,
        "versionId": version_id,
        "versionName": version_name or None,
        "title": title or version_name or "Validation rules",
        "classes": [_class_validation_entry(c) for c in classes],
    }
    doc = {k: v for k, v in doc.items() if v is not None}
    logger.info(
        "validation_rules_export: version %s classes=%d",
        version_id,
        len(classes),
    )
    return doc
