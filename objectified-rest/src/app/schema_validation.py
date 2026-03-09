"""Validation helpers for JSON Schema Draft 2020-12 schema object payloads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator

# Module-level metaschema validator to avoid recreating it on each validation call.
META_SCHEMA_VALIDATOR = Draft202012Validator(Draft202012Validator.META_SCHEMA)


@dataclass(frozen=True)
class SchemaValidationErrorDetail:
    """Normalized validation error details for API responses."""

    standard: str
    message: str
    path: str
    schema_path: str


def _iter_schema_errors(schema_object: dict[str, Any]) -> list[SchemaValidationErrorDetail]:
    """Validate a schema object against JSON Schema Draft 2020-12 metaschema."""
    errors = sorted(
        META_SCHEMA_VALIDATOR.iter_errors(schema_object),
        key=lambda error: (
            error.json_path,
            "/" + "/".join(str(part) for part in error.schema_path),
        ),
    )

    return [
        SchemaValidationErrorDetail(
            standard="json-schema-2020-12",
            message=error.message,
            path=error.json_path,
            schema_path="/" + "/".join(str(part) for part in error.schema_path),
        )
        for error in errors
    ]


def validate_json_schema_object(schema_object: dict[str, Any]) -> list[dict[str, str]]:
    """
    Validate a payload against the JSON Schema Draft 2020-12 metaschema.

    Returns a list of structured error dicts (standard, message, path, schema_path)
    suitable for use in API error responses. OpenAPI 3.2.0 Schema Objects are a
    superset of JSON Schema 2020-12, so metaschema validation catches structural
    errors in both contexts.
    """
    errors = _iter_schema_errors(schema_object)
    return [
        {
            "standard": error.standard,
            "message": error.message,
            "path": error.path,
            "schema_path": error.schema_path,
        }
        for error in errors
    ]

