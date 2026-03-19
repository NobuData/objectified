"""Schemas for tenant SSO integrations (OIDC / SAML)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SsoProviderType(str, Enum):
    """Supported SSO provider types."""

    oidc = "oidc"
    saml = "saml"


class SsoProviderSchema(BaseModel):
    """Response schema for objectified.sso_provider."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    provider_type: SsoProviderType
    name: str
    enabled: bool = True
    oidc_discovery: Optional[dict[str, Any]] = None
    saml_metadata_xml: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class SsoProviderCreate(BaseModel):
    """Create payload for objectified.sso_provider."""

    tenant_id: Optional[str] = None
    provider_type: SsoProviderType
    name: str = Field(..., min_length=1, max_length=255)
    enabled: bool = True
    oidc_discovery: Optional[dict[str, Any]] = None
    saml_metadata_xml: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SsoProviderUpdate(BaseModel):
    """Update payload for objectified.sso_provider."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    enabled: Optional[bool] = None
    oidc_discovery: Optional[dict[str, Any]] = None
    saml_metadata_xml: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
