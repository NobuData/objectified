"""Pydantic schemas for authentication: login and API key management."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


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
    expires_at: Optional[datetime] = Field(default=None, description="Optional expiry datetime (UTC). Omit for non-expiring keys.")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")

    model_config = {
        "json_schema_extra": {
            "example": {"name": "CI/CD pipeline key", "expires_at": None, "metadata": {}}
        }
    }


class ApiKeySchema(BaseModel):
    """Representation of a stored API key (never includes the raw secret)."""

    id: str = Field(..., description="API key UUID")
    tenant_id: str = Field(..., description="Owning tenant UUID")
    account_id: str = Field(..., description="Creating account UUID")
    name: str = Field(..., description="Human-readable label")
    key_prefix: str = Field(..., description="First 8 characters of the raw key (for display)")
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

