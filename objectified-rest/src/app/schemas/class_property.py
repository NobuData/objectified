"""Schemas for objectified.class_property table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ClassPropertySchema(BaseModel):
    """Response schema for objectified.class_property."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    class_id: str
    property_id: str
    parent_id: Optional[str] = None
    name: str
    description: str
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ClassPropertyCreate(BaseModel):
    """Create payload for objectified.class_property."""

    property_id: str
    parent_id: Optional[str] = None
    name: str
    description: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


class ClassPropertyUpdate(BaseModel):
    """Update payload for objectified.class_property."""

    name: Optional[str] = None
    description: Optional[str] = None
    data: Optional[dict[str, Any]] = None
    parent_id: Optional[str] = None
