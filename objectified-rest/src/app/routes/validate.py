"""REST routes for schema validation utilities."""

import logging
from typing import Any

from fastapi import APIRouter, Body
from pydantic import BaseModel, ConfigDict, Field

from app.schema_validation import validate_json_schema_object

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Validation"])


class SchemaValidationRequest(BaseModel):
    """Request body for schema validation endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema")


class SchemaValidationResponse(BaseModel):
    """Response body for schema validation endpoint."""

    valid: bool
    errors: list[dict[str, str]]


class OpenAPIValidationResponse(BaseModel):
    """Response body for OpenAPI document validation endpoint."""

    valid: bool
    openapi_version: str = ""
    title: str = ""
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


def _validate_openapi_document(doc: dict[str, Any]) -> OpenAPIValidationResponse:
    """Validate an OpenAPI document structure.

    Checks required fields and structure per the OpenAPI 3.x specification.
    Mirrors validation patterns from the commercial openapi-import.ts.
    """
    errors: list[str] = []
    warnings: list[str] = []
    openapi_version = ""
    title = ""

    # 1. 'openapi' field is required and must start with "3".
    raw_version = doc.get("openapi")
    if not raw_version:
        errors.append("Missing required 'openapi' version field.")
    else:
        openapi_version = str(raw_version)
        if not openapi_version.startswith("3"):
            errors.append(
                f"Unsupported OpenAPI version '{openapi_version}'. "
                "Only OpenAPI 3.x documents are supported."
            )

    # 2. 'info' object is required with 'title' and 'version'.
    info = doc.get("info")
    if not info or not isinstance(info, dict):
        errors.append("Missing required 'info' object.")
    else:
        if not info.get("title"):
            errors.append("Missing required 'info.title' field.")
        else:
            title = str(info["title"])
        if not info.get("version"):
            errors.append("Missing required 'info.version' field.")

    # 3. 'components' is optional but warn when missing.
    components = doc.get("components")
    if not components or not isinstance(components, dict):
        warnings.append("No 'components' section found. Document has no reusable schemas.")
    else:
        schemas = components.get("schemas")
        if not schemas or not isinstance(schemas, dict) or len(schemas) == 0:
            warnings.append("No schemas found in 'components.schemas'.")

    # 4. 'paths' is optional but note if absent.
    paths = doc.get("paths")
    if paths is None:
        warnings.append("No 'paths' section found.")
    elif isinstance(paths, dict) and len(paths) == 0:
        warnings.append("'paths' section is empty.")

    valid = len(errors) == 0

    return OpenAPIValidationResponse(
        valid=valid,
        openapi_version=openapi_version,
        title=title,
        warnings=warnings,
        errors=errors,
    )


@router.post(
    "/validate/json-schema",
    response_model=SchemaValidationResponse,
    summary="Validate a JSON Schema Draft 2020-12 object",
    description=(
        "Validate a submitted JSON object against the JSON Schema Draft 2020-12 metaschema. "
        "Returns whether the schema is valid and a list of structured error details if it is not. "
        "OpenAPI 3.2.0 Schema Objects are a superset of JSON Schema 2020-12, so this endpoint "
        "can be used to pre-validate schema payloads before creating or updating classes or properties."
    ),
)
def validate_schema(payload: SchemaValidationRequest) -> SchemaValidationResponse:
    """Validate a JSON Schema Draft 2020-12 schema object and return any errors."""
    errors = validate_json_schema_object(payload.schema_)
    return SchemaValidationResponse(valid=len(errors) == 0, errors=errors)


@router.post(
    "/validate/openapi-document",
    response_model=OpenAPIValidationResponse,
    summary="Validate an OpenAPI 3.x document structure",
    description=(
        "Validate the structure of an OpenAPI 3.x document without importing it. "
        "Checks for required fields (openapi version, info.title, info.version) "
        "and reports warnings for missing optional sections (components, schemas, paths). "
        "Use this to pre-validate a document before calling the import endpoint."
    ),
    responses={
        200: {"description": "Validation result"},
    },
)
def validate_openapi_document(
    doc: dict[str, Any] = Body(..., description="OpenAPI 3.x document as JSON"),
) -> OpenAPIValidationResponse:
    """Validate an OpenAPI 3.x document structure and return errors/warnings."""
    if not isinstance(doc, dict):
        return OpenAPIValidationResponse(
            valid=False,
            errors=["Request body must be a JSON object."],
        )
    return _validate_openapi_document(doc)

