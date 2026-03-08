"""Schemas for objectified.account table."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class AccountSchema(BaseModel):
    """Response schema for objectified.account."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    verified: bool = False
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class AccountCreate(BaseModel):
    """Create payload for objectified.account (password required).

    ``verified`` and ``enabled`` are intentionally omitted: new sign-ups are
    always created with ``verified=False`` and ``enabled=True`` on the server
    side to prevent callers from self-verifying or disabling their account.
    """

    name: str
    email: str
    password: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AccountUpdate(BaseModel):
    """Update payload for objectified.account (all optional)."""

    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    verified: Optional[bool] = None
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


class ProfileUpdate(BaseModel):
    """Update payload for current user profile (name and metadata only)."""

    name: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
