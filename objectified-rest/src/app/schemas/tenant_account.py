"""Schemas for objectified.tenant_account table."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TenantAccessLevel(str, Enum):
    """Enum for objectified.tenant_access_level."""

    MEMBER = "member"
    ADMINISTRATOR = "administrator"


class TenantAccountSchema(BaseModel):
    """Response schema for objectified.tenant_account."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    account_id: str
    access_level: TenantAccessLevel = TenantAccessLevel.MEMBER
    enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class TenantAccountCreate(BaseModel):
    """Create payload for objectified.tenant_account."""

    tenant_id: str
    account_id: str
    access_level: TenantAccessLevel = TenantAccessLevel.MEMBER
    enabled: bool = True


class TenantAccountUpdate(BaseModel):
    """Update payload for objectified.tenant_account."""

    access_level: Optional[TenantAccessLevel] = None
    enabled: Optional[bool] = None
