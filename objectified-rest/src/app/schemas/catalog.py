"""Pydantic schemas for the schema catalog discovery API (GH-136).

These schemas expose a curated, read-only view of tenants, projects,
published versions, and their classes for external discovery by API
gateways, Backstage catalog sync, and IDPs.
"""

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CatalogTenantSummary(BaseModel):
    """Lightweight tenant info for catalog responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str = ""


class CatalogProjectSummary(BaseModel):
    """Lightweight project info for catalog responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class CatalogClassSummary(BaseModel):
    """Lightweight class info for catalog responses."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    description: str = ""
    schema_: Optional[dict[str, Any]] = Field(None, alias="schema")


class CatalogVersionSummary(BaseModel):
    """Published version info with optional nested classes."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str = ""
    published: bool = True
    published_at: Optional[datetime] = None
    visibility: Optional[str] = None
    code_generation_tag: Optional[str] = None
    publish_target: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    classes: List[CatalogClassSummary] = Field(default_factory=list)


class CatalogProjectEntry(BaseModel):
    """A project with its published versions for catalog display."""

    model_config = ConfigDict(from_attributes=True)

    project: CatalogProjectSummary
    versions: List[CatalogVersionSummary] = Field(default_factory=list)


class CatalogTenantEntry(BaseModel):
    """A tenant with its projects and published versions for the full catalog."""

    model_config = ConfigDict(from_attributes=True)

    tenant: CatalogTenantSummary
    projects: List[CatalogProjectEntry] = Field(default_factory=list)

