"""Schemas for schema environment promotion workflow (GH-137)."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.version import VersionSchema


class SchemaEnvironment(str, Enum):
    """Deployment environments for schema promotion."""

    DEV = "dev"
    STAGING = "staging"
    PROD = "prod"


class SchemaPromotionRequest(BaseModel):
    """Request body for POST /versions/{version_id}/promote."""

    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary promotion metadata stored with the live version and promotion record.",
    )
    message: Optional[str] = Field(
        default=None,
        description="Optional human-readable message; stored into metadata under the `message` key.",
    )


class SchemaLiveVersionSchema(BaseModel):
    """Response schema for objectified.schema_live_version."""

    project_id: str
    environment: SchemaEnvironment
    version_id: Optional[str] = None
    promoted_by: Optional[str] = None
    promoted_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SchemaPromotionSchema(BaseModel):
    """Response schema for objectified.schema_promotion."""

    id: str
    project_id: str
    environment: SchemaEnvironment
    from_version_id: Optional[str] = None
    to_version_id: Optional[str] = None
    promoted_by: Optional[str] = None
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class SchemaPromoteResponse(BaseModel):
    """Response model for POST /versions/{version_id}/promote."""

    promotion: SchemaPromotionSchema
    live_version: SchemaLiveVersionSchema


class SchemaLiveVersionDetail(BaseModel):
    """Live version detail including the resolved promoted Version payload."""

    model_config = ConfigDict(from_attributes=True)

    live_version: SchemaLiveVersionSchema
    version: Optional[VersionSchema] = None

