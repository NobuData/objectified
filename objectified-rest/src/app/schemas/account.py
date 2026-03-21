"""Schemas for objectified.account table."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserListStatus(str, Enum):
    """Filter for GET /v1/users (admin list)."""

    ACTIVE = "active"
    DISABLED = "disabled"
    DEACTIVATED = "deactivated"


class UserListSort(str, Enum):
    """Sort order for GET /v1/users."""

    CREATED_AT_ASC = "created_at_asc"
    CREATED_AT_DESC = "created_at_desc"
    LAST_LOGIN_AT_ASC = "last_login_at_asc"
    LAST_LOGIN_AT_DESC = "last_login_at_desc"


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
    last_login_at: Optional[datetime] = None
    deactivation_reason: Optional[str] = None
    deactivated_by: Optional[str] = None


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


class UserDeactivateBody(BaseModel):
    """Optional JSON body for DELETE /v1/users/{user_id} (deactivate)."""

    reason: Optional[str] = Field(None, max_length=2000)


class AccountLifecycleEventSchema(BaseModel):
    """One row from objectified.account_lifecycle_event."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    event_type: str
    reason: Optional[str] = None
    actor_id: Optional[str] = None
    created_at: datetime
