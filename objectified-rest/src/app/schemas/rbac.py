"""Pydantic schemas for RBAC (roles and permissions)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


RbacResourceType = Literal["project", "version"]


class PermissionSchema(BaseModel):
    id: str
    key: str
    description: str = ""
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoleSchema(BaseModel):
    id: str
    tenant_id: str
    key: str
    name: str
    description: str = ""
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoleCreate(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class RoleUpdate(BaseModel):
    key: Optional[str] = Field(default=None, min_length=2, max_length=80)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


class RolePermissionsUpdate(BaseModel):
    permission_keys: list[str] = Field(default_factory=list, description="Full replacement list of permission keys.")


class AccountRoleAssignmentCreate(BaseModel):
    account_id: str
    role_id: str
    resource_type: Optional[RbacResourceType] = None
    resource_id: Optional[str] = None
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class EffectivePermissionsResponse(BaseModel):
    tenant_id: str
    account_id: str
    is_tenant_admin: bool
    role_ids: list[str] = Field(default_factory=list)
    permission_keys: list[str] = Field(default_factory=list)

