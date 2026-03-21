"""Schemas for objectified.tenant_account table."""

from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TenantMemberRoleSchema(BaseModel):
    """Workspace RBAC role assigned at tenant scope (no resource filter)."""

    model_config = ConfigDict(from_attributes=True)

    role_id: str
    key: str
    name: str


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


class TenantMemberListEntrySchema(TenantAccountSchema):
    """Tenant member row with optional workspace roles (tenant-scoped assignments)."""

    roles: List[TenantMemberRoleSchema] = Field(default_factory=list)


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
    member_role_id: Optional[str] = Field(
        default=None,
        description=(
            "Optional tenant role UUID to assign after adding a member "
            "(viewer baseline applies when omitted)."
        ),
    )

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
    member_role_id: Optional[str] = Field(
        default=None,
        description=(
            "When set (including explicit null in JSON), replaces tenant-scoped role "
            "assignments: null clears explicit roles (viewer baseline only)."
        ),
    )


class TenantBulkInviteResultEntry(BaseModel):
    """Per-email outcome for bulk tenant invite."""

    email: str
    status: Literal[
        "added",
        "promoted",
        "already_member",
        "not_found",
        "invalid_email",
        "pending_invitation",
        "already_invited",
    ]
    account_id: Optional[str] = None


class TenantMembersBulkInvite(BaseModel):
    """Request body for POST .../members/bulk-invite."""

    emails: List[str] = Field(..., min_length=1, max_length=100)
    access_level: TenantAccessLevel = TenantAccessLevel.MEMBER
    member_role_id: Optional[str] = Field(
        default=None,
        description="Optional workspace role UUID to assign for new or existing members.",
    )
    invite_unknown_emails: bool = Field(
        default=False,
        description=(
            "When true and access_level is member, emails with no account create a "
            "pending invitation instead of not_found."
        ),
    )


class TenantMembersBulkInviteResponse(BaseModel):
    """Response for POST .../members/bulk-invite."""

    results: List[TenantBulkInviteResultEntry]


class TenantMembersBulkRemove(BaseModel):
    """Request body for POST .../members/bulk-remove."""

    account_ids: List[str] = Field(..., min_length=1, max_length=200)


class TenantMemberInvitationStatus(str, Enum):
    """Invitation lifecycle for objectified.tenant_member_invitation.status."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    CANCELLED = "cancelled"


class TenantMemberInvitationSchema(BaseModel):
    """Pending or historical email invitation to join a tenant as a member."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    email: str
    role_id: Optional[str] = None
    role_key: Optional[str] = None
    role_name: Optional[str] = None
    status: TenantMemberInvitationStatus
    invited_by_account_id: Optional[str] = None
    last_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TenantMemberInvitationCreate(BaseModel):
    """Create a pending invitation or immediately add an existing account."""

    email: str
    member_role_id: Optional[str] = Field(
        default=None,
        description="Tenant role UUID; omitted means viewer baseline only after join.",
    )


class TenantMemberInviteOutcome(BaseModel):
    """Result of POST .../members/invite-email (member added vs pending invitation)."""

    kind: Literal["member", "pending_invitation"]
    member: Optional[TenantMemberListEntrySchema] = None
    invitation: Optional[TenantMemberInvitationSchema] = None
