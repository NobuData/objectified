"""Schemas for objectified.class table (model named to avoid 'class' keyword)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ClassSchema(BaseModel):
    """Response schema for objectified.class."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    version_id: str
    name: str
    description: str
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema")
    metadata: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class ClassCreate(BaseModel):
    """Create payload for objectified.class."""

    model_config = ConfigDict(populate_by_name=True)

    version_id: Optional[str] = None  # Optional when provided in path
    name: str
    description: str = ""
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema")
    metadata: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ClassCanvasMetadata(BaseModel):
    """Canvas metadata: position, dimensions, style, group (all optional)."""

    position: Optional[dict[str, Any]] = None
    dimensions: Optional[dict[str, Any]] = None
    style: Optional[dict[str, Any]] = None
    group: Optional[str] = None


class ClassUpdate(BaseModel):
    """Update payload for objectified.class (metadata + canvas_metadata)."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    description: Optional[str] = None
    schema_: Optional[dict[str, Any]] = Field(default=None, alias="schema")
    metadata: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    canvas_metadata: Optional[ClassCanvasMetadata] = None


class ClassAssignTagRequest(BaseModel):
    """Request body for assigning a tag to a class (GitHub #103)."""

    tag: str


class ClassTagsResponse(BaseModel):
    """Response for get tags for class (GitHub #103)."""

    tags: list[str] = Field(default_factory=list)


class ClassWithPropertiesAndTags(ClassSchema):
    """
    Class with embedded properties and tags for canvas load.

    Returned by:
    - GET /v1/versions/{version_id}/classes/with-properties-tags (bulk)
    - GET /v1/versions/{version_id}/classes/{class_id}/with-properties-tags (single)

    Each item includes the class fields plus:
    - properties: list of class_property rows (with optional property_name, property_data from join)
    - tags: list from class metadata.tags, or []
    """

    properties: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[Any] = Field(default_factory=list)
