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
    source_version_id: Optional[str] = None
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

    project_id: Optional[str] = None
    creator_id: Optional[str] = None
    source_version_id: Optional[str] = None
    name: str
    description: str = ""
    change_log: Optional[str] = None
    enabled: bool = True
    published: bool = False
    visibility: Optional[VersionVisibility] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VersionMetadataUpdate(BaseModel):
    """Metadata update payload for objectified.version."""

    description: Optional[str] = None
    change_log: Optional[str] = None


class VersionHistorySchema(BaseModel):
    """Response schema for objectified.version_history."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    project_id: str
    changed_by: Optional[str] = None
    revision: int
    operation: str
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    changed_at: datetime


class VersionPublishRequest(BaseModel):
    """Payload for publishing a version."""

    visibility: Optional[VersionVisibility] = VersionVisibility.PRIVATE


class VersionSnapshotCreate(BaseModel):
    """Create payload for committing a version snapshot."""

    label: Optional[str] = None
    description: Optional[str] = None


class VersionSnapshotSchema(BaseModel):
    """Response schema for objectified.version_snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    project_id: str
    committed_by: Optional[str] = None
    revision: int
    label: Optional[str] = None
    description: Optional[str] = None
    snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


# Backward-compatible alias for older imports.
VersionUpdate = VersionMetadataUpdate
