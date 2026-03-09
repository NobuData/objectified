"""OpenAPI 3.2.0 specification generator.

Converts Objectified class definitions (with their class properties)
into a complete OpenAPI 3.2.0 document. The generator is a Python port
of the logic found in objectified-commercial's openapi.ts / jsonschema.ts.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers – mirror the TypeScript buildPropertySchema / buildClassSchema
# ---------------------------------------------------------------------------


def _build_property_schema(prop: dict[str, Any], all_properties: list[dict[str, Any]]) -> Any:
    """Recursively build a JSON Schema fragment for a single class property.

    Mirrors ``buildPropertySchema`` from openapi.ts.
    """
    raw_data = prop.get("data") or {}
    if isinstance(raw_data, str):
        prop_data: dict[str, Any] = json.loads(raw_data)
    else:
        prop_data = dict(raw_data)

    # Capture the property-level required flag before any mutations.
    self_required = prop_data.get("required")

    # Prefer the description column over whatever is stored in data JSON.
    if prop.get("description"):
        prop_data["description"] = prop["description"]
    elif prop_data.get("description") is None:
        if prop_data.get("title"):
            prop_data["description"] = prop_data["title"]
        else:
            prop_data.pop("description", None)

    prop_id = str(prop.get("id", ""))

    # ---- Object type with nested children --------------------------------
    if prop_data.get("type") == "object" and not prop_data.get("$ref"):
        children = [p for p in all_properties if str(p.get("parent_id") or "") == prop_id]
        if children:
            nested_properties: dict[str, Any] = {}
            nested_required: list[str] = []
            for child in children:
                child_schema = _build_property_schema(child, all_properties)
                if child_schema.get("required") is True:
                    nested_required.append(child.get("name", ""))
                    del child_schema["required"]
                elif child_schema.get("required") is False and not isinstance(child_schema.get("required"), list):
                    child_schema.pop("required", None)
                nested_properties[child.get("name", "")] = child_schema
            prop_data["properties"] = nested_properties
            if nested_required:
                prop_data["required"] = nested_required
            elif isinstance(prop_data.get("required"), list):
                prop_data.pop("required", None)

    # ---- Array type with inline object items ------------------------------
    if prop_data.get("type") == "array":
        children = [p for p in all_properties if str(p.get("parent_id") or "") == prop_id]
        if children and not prop_data.get("items"):
            prop_data["items"] = {"type": "object"}
        items = prop_data.get("items")
        if items and not items.get("$ref") and (items.get("type") == "object" or children):
            nested_properties = {}
            nested_required = []
            for child in children:
                child_schema = _build_property_schema(child, all_properties)
                if child_schema.get("required") is True:
                    nested_required.append(child.get("name", ""))
                    del child_schema["required"]
                elif child_schema.get("required") is False and not isinstance(child_schema.get("required"), list):
                    child_schema.pop("required", None)
                nested_properties[child.get("name", "")] = child_schema
            prop_data["items"] = {**(items or {}), "type": "object", "properties": nested_properties}
            if nested_required:
                prop_data["items"]["required"] = nested_required
            elif "required" in prop_data.get("items", {}):
                prop_data["items"].pop("required", None)

    # Restore the property's own required flag for the caller to process.
    if self_required is True:
        prop_data["required"] = True
    elif self_required is False and not isinstance(prop_data.get("required"), list):
        prop_data["required"] = False

    return prop_data


def build_class_schema(class_data: dict[str, Any]) -> dict[str, Any]:
    """Build a JSON Schema / OpenAPI schema object from a class definition.

    Mirrors ``buildClassSchema`` from openapi.ts.

    :param class_data: A dict with keys ``name``, ``description``, ``schema``
        (or ``schema_``), and ``properties`` (list of class_property rows).
    :returns: A JSON Schema object ready to embed into OpenAPI components/schemas.
    """
    raw_schema = class_data.get("schema_") or class_data.get("schema") or {}
    if isinstance(raw_schema, str):
        schema: dict[str, Any] = json.loads(raw_schema)
    else:
        schema = dict(raw_schema)

    # Strip the properties/required fields – we derive them from class_property rows.
    schema.pop("properties", None)
    schema.pop("required", None)

    properties: dict[str, Any] = {}
    required: list[str] = []

    class_properties: list[dict[str, Any]] = class_data.get("properties") or []
    if class_properties:
        top_level = [p for p in class_properties if not p.get("parent_id")]
        for prop in top_level:
            prop_schema = _build_property_schema(prop, class_properties)
            if prop_schema.get("required") is True:
                required.append(prop.get("name", ""))
                del prop_schema["required"]
            elif prop_schema.get("required") is False:
                prop_schema.pop("required", None)
            properties[prop.get("name", "")] = prop_schema

    has_composition = any(k in schema for k in ("allOf", "anyOf", "oneOf"))

    if has_composition:
        class_schema: dict[str, Any] = {
            "description": class_data.get("description") or None,
            **schema,
        }
        if properties:
            class_schema["properties"] = properties
            if required:
                class_schema["required"] = required
    else:
        class_schema = {
            "type": "object",
            "description": class_data.get("description") or None,
            **schema,
            "properties": properties,
        }
        if required:
            class_schema["required"] = required

    # Remove empty properties dict.
    if not class_schema.get("properties"):
        class_schema.pop("properties", None)

    # Remove None values.
    class_schema = {k: v for k, v in class_schema.items() if v is not None}

    return class_schema


# ---------------------------------------------------------------------------
# Public generators
# ---------------------------------------------------------------------------


def generate_openapi_spec(
    classes: list[dict[str, Any]],
    *,
    project_name: str = "API Schema",
    version: str = "1.0.0",
    description: str | None = None,
    openapi_version: str = "3.2.0",
) -> dict[str, Any]:
    """Generate a complete OpenAPI document from a list of class definitions.

    :param classes: List of class data dicts, each with ``name``, ``description``,
        ``schema`` / ``schema_``, and ``properties`` (class_property rows).
    :param project_name: API title (info.title).
    :param version: API version string (info.version).
    :param description: API description (info.description).
    :param openapi_version: OpenAPI version string, defaults to ``3.2.0``.
    :returns: A dict representing the full OpenAPI document.
    """
    schemas: dict[str, Any] = {}
    for cls in classes:
        schemas[cls["name"]] = build_class_schema(cls)

    info: dict[str, Any] = {
        "title": project_name,
        "version": version,
        "description": description or f"Generated OpenAPI {openapi_version} specification from Objectified",
    }

    doc: dict[str, Any] = {
        "openapi": openapi_version,
        "info": info,
        "components": {
            "schemas": schemas,
        },
        "paths": {},
    }

    logger.debug(
        "generate_openapi_spec: generated %d schemas for openapi %s",
        len(schemas),
        openapi_version,
    )

    return doc

