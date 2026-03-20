"""Pydantic schemas for authentication: login and API key management."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ApiKeyScopeRole(str, Enum):
    """Access role for an API key (affects HTTP methods and RBAC bypass)."""

    full = "full"
    read_only = "read_only"


class LoginRequest(BaseModel):
    """Request body for POST /v1/auth/login."""

    email: str = Field(..., description="Account email address")
    password: str = Field(..., description="Account password (plain text, hashed server-side)")

    model_config = {"json_schema_extra": {"example": {"email": "alice@example.com", "password": "secret"}}}


class LoginResponse(BaseModel):
    """Response body for POST /v1/auth/login."""

    access_token: str = Field(..., description="Signed JWT access token")
    token_type: str = Field(default="bearer", description="Token type — always 'bearer'")
    user_id: str = Field(..., description="Account UUID of the authenticated user")
    email: str = Field(..., description="Email address of the authenticated user")
    name: str = Field(..., description="Display name of the authenticated user")
    expires_in: int = Field(..., description="Token lifetime in seconds")


class ApiKeyCreate(BaseModel):
    """Request body for POST /v1/tenants/{tenant_id}/api-keys."""

    name: str = Field(..., min_length=1, max_length=255, description="Human-readable label for this key")
    expires_at: Optional[datetime] = Field(
        default=None,
        description="Optional expiry datetime (UTC). Omit for non-expiring keys.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")
    scope_role: ApiKeyScopeRole = Field(
        default=ApiKeyScopeRole.full,
        description=(
            "``full``: read/write (subject to RBAC unless the key is tenant-wide full). "
            "``read_only``: only GET, HEAD, and OPTIONS."
        ),
    )
    project_id: Optional[str] = Field(
        default=None,
        description=(
            "Optional project UUID. When set, the key may only access that project "
            "within the tenant; tenant-wide API paths return 403."
        ),
    )
    rate_limit_requests_per_minute: Optional[int] = Field(
        default=None,
        ge=1,
        le=1_000_000,
        description="Optional RPM override for this key; omit to inherit tenant and global defaults.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "CI/CD pipeline key",
                "expires_at": None,
                "metadata": {},
                "scope_role": "full",
                "project_id": None,
            }
        }
    }


class ApiKeySchema(BaseModel):
    """Representation of a stored API key (never includes the raw secret)."""

    id: str = Field(..., description="API key UUID")
    tenant_id: str = Field(..., description="Owning tenant UUID")
    account_id: str = Field(..., description="Creating account UUID")
    name: str = Field(..., description="Human-readable label")
    key_prefix: str = Field(..., description="First 8 characters of the raw key (for display)")
    scope_role: ApiKeyScopeRole = Field(
        default=ApiKeyScopeRole.full,
        description="Key role: full access or read-only (safe HTTP methods only).",
    )
    project_id: Optional[str] = Field(
        default=None,
        description="When set, the key is restricted to this project within the tenant.",
    )
    rate_limit_requests_per_minute: Optional[int] = Field(
        default=None,
        description="RPM override for this key when rate limiting is enabled; null inherits tenant/global.",
    )
    expires_at: Optional[datetime] = Field(default=None, description="Expiry datetime, or null for non-expiring")
    last_used: Optional[datetime] = Field(default=None, description="Timestamp of last successful use")
    enabled: bool = Field(..., description="Whether the key is active")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")
    created_at: datetime = Field(..., description="Creation timestamp (UTC)")
    updated_at: Optional[datetime] = Field(default=None, description="Last update timestamp (UTC)")
    deleted_at: Optional[datetime] = Field(default=None, description="Soft-delete timestamp (UTC)")

    model_config = {"from_attributes": True}


class ApiKeyCreateResponse(ApiKeySchema):
    """Response for API key creation — includes the raw secret once."""

    raw_key: str = Field(
        ...,
        description="Full API key value — shown ONCE at creation. Store it securely; it cannot be retrieved again.",
    )

