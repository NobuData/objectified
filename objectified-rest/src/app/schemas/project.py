"""Schemas for objectified.project table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectSchema(BaseModel):
    """Response schema for objectified.project."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    creator_id: str
    name: str
    description: str
    slug: str
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class ProjectCreate(BaseModel):
    """Create payload for objectified.project."""

    tenant_id: str
    creator_id: str
    name: str
    description: str = ""
    slug: str
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    """Update payload for objectified.project."""

    name: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = None
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None
