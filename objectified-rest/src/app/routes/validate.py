"""REST routes for schema validation utilities."""

import logging
from typing import Any

from fastapi import APIRouter
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
