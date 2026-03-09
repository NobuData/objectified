"""Schemas for objectified.property table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class PropertySchema(BaseModel):
    """Response schema for objectified.property."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    description: str
    data: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class PropertyCreate(BaseModel):
    """Create payload for objectified.property."""

    project_id: Optional[str] = None
    name: str
    description: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class PropertyUpdate(BaseModel):
    """Update payload for objectified.property."""

    name: Optional[str] = None
    description: Optional[str] = None
    data: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
