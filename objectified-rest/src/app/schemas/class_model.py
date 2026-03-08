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
