"""Pydantic schemas for the import endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ImportResult(BaseModel):
    """Response schema summarising the result of an import operation."""

    classes_created: int = 0
    classes_updated: int = 0
    properties_created: int = 0
    properties_reused: int = 0
    class_properties_created: int = 0
    class_properties_skipped: int = 0
    detail: list[str] = Field(default_factory=list)
    dry_run: bool = Field(
        default=False,
        description="True when the operation was a preview and no data was persisted.",
    )


class FetchImportUrlRequest(BaseModel):
    """Request body for fetching a JSON or YAML document over HTTPS for import."""

    url: str = Field(..., min_length=1, max_length=2048, description="HTTPS URL to fetch.")
    headers: dict[str, str] | None = Field(
        default=None,
        description="Optional extra headers (e.g. Authorization: Bearer …).",
    )


class FetchImportUrlResponse(BaseModel):
    """Parsed document from a successful fetch."""

    document: dict[str, Any]
    content_type: str | None = None

