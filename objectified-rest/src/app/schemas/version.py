"""Schemas for objectified.version table."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class VersionVisibility(str, Enum):
    """Enum for objectified.version_visibility."""

    PRIVATE = "private"
    PUBLIC = "public"


class VersionSchema(BaseModel):
    """Response schema for objectified.version."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    creator_id: str
    name: str
    description: str
    change_log: Optional[str] = None
    enabled: bool = True
    published: bool = False
    visibility: Optional[VersionVisibility] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    published_at: Optional[datetime] = None


class VersionCreate(BaseModel):
    """Create payload for objectified.version."""

    project_id: str
    creator_id: str
    name: str
    description: str = ""
    change_log: Optional[str] = None
    enabled: bool = True
    published: bool = False
    visibility: Optional[VersionVisibility] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VersionUpdate(BaseModel):
    """Update payload for objectified.version."""

    name: Optional[str] = None
    description: Optional[str] = None
    change_log: Optional[str] = None
    enabled: Optional[bool] = None
    published: Optional[bool] = None
    visibility: Optional[VersionVisibility] = None
    metadata: Optional[dict[str, Any]] = None
    published_at: Optional[datetime] = None
