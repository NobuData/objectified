"""Schemas for objectified.tenant_account table."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, model_validator


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
    """Create payload for objectified.tenant_account.

    Either ``account_id`` (UUID) or ``email`` must be provided to identify the
    account to add.  If both are supplied, ``account_id`` takes precedence.
    ``tenant_id`` is optional in the body — it is validated against the path
    parameter in the route handler.
    """

    tenant_id: Optional[str] = None
    account_id: Optional[str] = None
    email: Optional[str] = None
    access_level: TenantAccessLevel = TenantAccessLevel.MEMBER
    enabled: bool = True

    @model_validator(mode="after")
    def _require_account_id_or_email(self) -> "TenantAccountCreate":
        if not self.account_id and not self.email:
            raise ValueError("Either 'account_id' or 'email' must be provided")
        return self


class TenantAdministratorCreate(BaseModel):
    """Request body for POST /v1/tenants/{id}/administrators.

    Dedicated schema that intentionally omits ``access_level`` — the endpoint
    always assigns ``administrator`` and the field is not meaningful here.

    Either ``account_id`` (UUID) or ``email`` must be provided to identify the
    account.  If both are supplied, ``account_id`` takes precedence.
    ``tenant_id`` is optional in the body — it is validated against the path
    parameter in the route handler.
    """

    model_config = ConfigDict(extra="forbid")

    tenant_id: Optional[str] = None
    account_id: Optional[str] = None
    email: Optional[str] = None
    enabled: bool = True

    @model_validator(mode="after")
    def _require_account_id_or_email(self) -> "TenantAdministratorCreate":
        if not self.account_id and not self.email:
            raise ValueError("Either 'account_id' or 'email' must be provided")
        return self


class TenantAccountUpdate(BaseModel):
    """Update payload for objectified.tenant_account."""

    access_level: Optional[TenantAccessLevel] = None
    enabled: Optional[bool] = None
