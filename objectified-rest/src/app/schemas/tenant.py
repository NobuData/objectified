"""Schemas for objectified.tenant table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

# Matches the DB CHECK constraint: tenant_slug_format
# ^[a-z0-9]+(?:-[a-z0-9]+)*$
_SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
_SLUG_DESCRIPTION = (
    "URL-safe tenant identifier: lowercase alphanumeric segments separated "
    "by single hyphens (e.g. 'my-tenant', 'acme', 'acme-corp-2'). "
    "Must not start or end with a hyphen."
)


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
    slug: str = Field(
        ...,
        pattern=_SLUG_PATTERN,
        description=_SLUG_DESCRIPTION,
    )
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class TenantUpdate(BaseModel):
    """Update payload for objectified.tenant."""

    name: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = Field(
        default=None,
        pattern=_SLUG_PATTERN,
        description=_SLUG_DESCRIPTION,
    )
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


