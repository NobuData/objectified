"""Admin response schemas for a user's tenant memberships and RBAC roles."""

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.tenant_account import TenantAccessLevel


class UserMembershipRoleSchema(BaseModel):
    """One RBAC role assigned to the user within a tenant."""

    model_config = ConfigDict(from_attributes=True)

    role_id: str
    key: str
    name: str


class UserTenantMembershipAdminSchema(BaseModel):
    """Tenant membership for an account, including access level and assigned roles."""

    model_config = ConfigDict(from_attributes=True)

    tenant_id: str
    tenant_name: str
    access_level: TenantAccessLevel
    membership_enabled: bool = Field(
        ...,
        description="Whether the tenant_account row is enabled (distinct from account.enabled).",
    )
    roles: List[UserMembershipRoleSchema] = Field(default_factory=list)
