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
    """Create payload for objectified.project.

    ``tenant_id`` and ``creator_id`` are optional.  When omitted they are
    taken from the URL path and the authenticated caller respectively.
    If supplied they must match those authoritative sources exactly —
    any mismatch returns HTTP 400.
    """

    tenant_id: Optional[str] = None
    creator_id: Optional[str] = None
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


class ProjectHistorySchema(BaseModel):
    """Response schema for objectified.project_history."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    tenant_id: str
    changed_by: Optional[str] = None
    operation: str
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    changed_at: datetime
