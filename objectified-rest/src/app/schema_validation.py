"""Validation helpers for JSON Schema/OpenAPI schema object payloads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator


@dataclass(frozen=True)
class SchemaValidationErrorDetail:
    """Normalized validation error details for API responses."""

    standard: str
    message: str
    path: str
    schema_path: str


def _iter_schema_errors(schema_object: dict[str, Any]) -> list[SchemaValidationErrorDetail]:
    """Validate a schema object against JSON Schema Draft 2020-12 metaschema."""
    validator = Draft202012Validator(Draft202012Validator.META_SCHEMA)
    errors = sorted(validator.iter_errors(schema_object), key=lambda error: (str(error.path), str(error.schema_path)))

    return [
        SchemaValidationErrorDetail(
            standard="json-schema-2020-12",
            message=error.message,
            path=error.json_path,
            schema_path="/" + "/".join(str(part) for part in error.schema_path),
        )
        for error in errors
    ]


def validate_openapi_schema_object(schema_object: dict[str, Any]) -> list[dict[str, str]]:
    """
    Validate a payload intended to be an OpenAPI 3.2.0 Schema Object.

    OpenAPI 3.2.0 schema objects are JSON Schema 2020-12 compatible, so metaschema
    validation is used as the source of truth. The returned structure is stable for
    API error responses.
    """
    errors = _iter_schema_errors(schema_object)

    # Mirror the same violations under the OpenAPI standard label so clients can
    # show explicit context for both standards requested by the ticket.
    mirrored = [
        SchemaValidationErrorDetail(
            standard="openapi-3.2.0-schema-object",
            message=error.message,
            path=error.path,
            schema_path=error.schema_path,
        )
        for error in errors
    ]

    all_errors = [*errors, *mirrored]
    return [
        {
            "standard": error.standard,
            "message": error.message,
            "path": error.path,
            "schema_path": error.schema_path,
        }
        for error in all_errors
    ]

