"""Schemas for objectified.tenant table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TenantSchema(BaseModel):
    """Response schema for objectified.tenant."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    slug: str
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class TenantCreate(BaseModel):
    """Create payload for objectified.tenant."""

    name: str
    description: str = ""
    slug: str
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class TenantUpdate(BaseModel):
    """Update payload for objectified.tenant."""

    name: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = None
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None
