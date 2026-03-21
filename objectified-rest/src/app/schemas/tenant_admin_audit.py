"""Schemas for tenant administrator audit and primary-admin transfer (GitHub #194)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TenantAdminAuditEventSchema(BaseModel):
    """One append-only audit row for tenant administrator changes."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    event_type: str
    actor_account_id: Optional[str] = None
    target_account_id: Optional[str] = None
    previous_primary_account_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TenantPrimaryAdminTransfer(BaseModel):
    """Transfer primary (designated) tenant administrator to another administrator."""

    new_primary_account_id: str = Field(
        ...,
        description="Account UUID that must already be an active administrator of the tenant.",
    )
    confirm_tenant_slug: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Must exactly match the tenant slug (case-sensitive) to confirm the transfer.",
    )
