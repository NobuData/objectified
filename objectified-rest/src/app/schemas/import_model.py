"""Pydantic schemas for the import endpoints."""

from __future__ import annotations

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

