"""Schemas for objectified.tenant table."""

import re
from datetime import datetime
from typing import Any, Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HEX_COLOR = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# Matches the DB CHECK constraint: tenant_slug_format
# ^[a-z0-9]+(?:-[a-z0-9]+)*$
_SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
_SLUG_DESCRIPTION = (
    "URL-safe tenant identifier: lowercase alphanumeric segments separated "
    "by single hyphens (e.g. 'my-tenant', 'acme', 'acme-corp-2'). "
    "Must not start or end with a hyphen."
)


class TenantSchema(BaseModel):
    """Response schema for objectified.tenant."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    slug: str
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    rate_limit_requests_per_minute: Optional[int] = Field(
        default=None,
        description="RPM override for authenticated access on this tenant's routes; null uses global default.",
    )
    max_projects: Optional[int] = Field(
        default=None,
        description="Optional cap on active projects; null means unlimited.",
    )
    max_versions_per_project: Optional[int] = Field(
        default=None,
        description="Optional cap on active versions per project; null means unlimited.",
    )
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class TenantCreate(BaseModel):
    """Create payload for objectified.tenant."""

    name: str
    description: str = ""
    slug: str = Field(
        ...,
        pattern=_SLUG_PATTERN,
        description=_SLUG_DESCRIPTION,
    )
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class TenantActivitySummarySchema(BaseModel):
    """Aggregated counts for dashboard tenant overview (GitHub #192)."""

    active_project_count: int = Field(ge=0, description="Non-deleted projects for this tenant.")
    active_member_count: int = Field(ge=0, description="Active tenant_account memberships.")
    schema_version_count: int = Field(
        ge=0,
        description="Non-deleted schema versions across all projects in the tenant.",
    )
    dashboard_page_visits_last_7_days: Optional[int] = Field(
        default=None,
        description="Optional count from dashboard_page_visit when the table is available.",
    )


class TenantAppearanceUpdate(BaseModel):
    """Partial update for tenant branding and default UI theme (merged into metadata)."""

    logo_url: Optional[str] = Field(
        default=None,
        description="HTTPS (or HTTP) logo URL; stored as metadata.branding.logoUrl. Omit to leave unchanged.",
    )
    favicon_url: Optional[str] = Field(
        default=None,
        description="HTTPS (or HTTP) favicon URL; stored as metadata.branding.faviconUrl.",
    )
    primary_color: Optional[str] = Field(
        default=None,
        description="Hex color (#RGB / #RRGGBB / #RRGGBBAA); stored as metadata.branding.primaryColor.",
    )
    default_theme: Optional[Literal["light", "dark", "system"]] = Field(
        default=None,
        description="Default dashboard theme for this tenant; stored as metadata.defaultTheme.",
    )

    @field_validator("logo_url", "favicon_url", mode="before")
    @classmethod
    def _optional_http_url(cls, v: Any) -> Any:
        if v is None:
            return None
        if not isinstance(v, str):
            raise TypeError("URL fields must be strings")
        s = v.strip()
        if not s:
            return None
        parsed = urlparse(s)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Must be an absolute http(s) URL")
        return s

    @field_validator("primary_color", mode="before")
    @classmethod
    def _optional_hex(cls, v: Any) -> Any:
        if v is None:
            return None
        if not isinstance(v, str):
            raise TypeError("primary_color must be a string")
        s = v.strip()
        if not s:
            return None
        if not _HEX_COLOR.match(s):
            raise ValueError("primary_color must be a hex color such as #3366cc or #rgb")
        return s


class TenantUpdate(BaseModel):
    """Update payload for objectified.tenant."""

    name: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = Field(
        default=None,
        pattern=_SLUG_PATTERN,
        description=_SLUG_DESCRIPTION,
    )
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None
    rate_limit_requests_per_minute: Optional[int] = Field(
        default=None,
        ge=1,
        le=1_000_000,
        description="Tenant RPM override; omit to leave unchanged.",
    )
    max_projects: Optional[int] = Field(
        default=None,
        ge=0,
        description="Cap on active projects; omit to leave unchanged; use null in API to clear.",
    )
    max_versions_per_project: Optional[int] = Field(
        default=None,
        ge=0,
        description="Cap on active versions per project; omit to leave unchanged; use null to clear.",
    )


