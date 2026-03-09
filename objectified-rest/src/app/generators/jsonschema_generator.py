"""JSON Schema 2020-12 generator.

Converts Objectified class definitions into JSON Schema 2020-12 documents.
Supports both multi-schema (all classes in one document under $defs) and
single-schema (one class per document) outputs.

Mirrors the logic from objectified-commercial's jsonschema.ts.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.generators.openapi_generator import build_class_schema

logger = logging.getLogger(__name__)

# Base URL used for the JSON Schema $id field.  Defaults to https://example.com/
# if the OBJECTIFIED_BASE_URL environment variable is not set.
_JSONSCHEMA_BASE_URL = os.environ.get("OBJECTIFIED_BASE_URL", "https://example.com").rstrip("/")

# ---------------------------------------------------------------------------
# $ref conversion helpers
# ---------------------------------------------------------------------------


def convert_refs_to_jsonschema(obj: Any) -> Any:
    """Recursively rewrite OpenAPI-style ``$ref`` paths to JSON Schema ``$defs`` paths.

    OpenAPI uses  ``#/components/schemas/ClassName``
    JSON Schema uses ``#/$defs/ClassName``

    Mirrors ``convertRefsToJsonSchema`` from jsonschema.ts.
    """
    if obj is None:
        return obj
    if isinstance(obj, list):
        return [convert_refs_to_jsonschema(item) for item in obj]
    if isinstance(obj, dict):
        result: dict[str, Any] = {}
        for key, value in obj.items():
            if key == "$ref" and isinstance(value, str):
                ref = value
                if ref.startswith("#/components/schemas/"):
                    ref = ref.replace("#/components/schemas/", "#/$defs/")
                elif ref.startswith("#/definitions/"):
                    ref = ref.replace("#/definitions/", "#/$defs/")
                result[key] = ref
            else:
                result[key] = convert_refs_to_jsonschema(value)
        return result
    return obj


# ---------------------------------------------------------------------------
# Public generators
# ---------------------------------------------------------------------------


def generate_jsonschema_multi(
    classes: list[dict[str, Any]],
    *,
    project_name: str = "JSON Schema",
    version: str = "1.0.0",
    description: str | None = None,
) -> dict[str, Any]:
    """Generate a multi-schema JSON Schema 2020-12 document.

    All classes are embedded as ``$defs`` entries in a single document.

    :param classes: List of class data dicts (same structure as for OpenAPI generator).
    :param project_name: Schema title.
    :param version: Schema version string used in the description.
    :param description: Optional override description.
    :returns: JSON Schema 2020-12 document as a dict.
    """
    defs: dict[str, Any] = {}
    for cls in classes:
        class_schema = build_class_schema(cls)
        defs[cls["name"]] = convert_refs_to_jsonschema(class_schema)

    slug = project_name.lower().replace(" ", "-")
    doc: dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"{_JSONSCHEMA_BASE_URL}/{slug}.json",
        "title": project_name,
        "description": description or f"Generated JSON Schema from Objectified - Version {version}",
        "type": "object",
        "$defs": defs,
    }

    logger.debug("generate_jsonschema_multi: generated %d $defs", len(defs))
    return doc


def generate_jsonschema_single(
    cls: dict[str, Any],
    *,
    project_name: str | None = None,
    version: str = "1.0.0",
    description: str | None = None,
) -> dict[str, Any]:
    """Generate a single-class JSON Schema 2020-12 document.

    :param cls: A single class data dict.
    :param project_name: Override for the schema title. Defaults to the class name.
    :param version: Schema version used in the description / $id.
    :param description: Optional override description.
    :returns: JSON Schema 2020-12 document as a dict.
    """
    class_name = cls.get("name", "Schema")
    title = project_name or class_name
    slug = title.lower().replace(" ", "-")

    class_schema = build_class_schema(cls)
    class_schema = convert_refs_to_jsonschema(class_schema)

    doc: dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"{_JSONSCHEMA_BASE_URL}/{slug}.json",
        "title": title,
        "description": description or cls.get("description") or f"Generated JSON Schema from Objectified - Version {version}",
        **class_schema,
    }

    logger.debug("generate_jsonschema_single: generated schema for class %s", class_name)
    return doc

