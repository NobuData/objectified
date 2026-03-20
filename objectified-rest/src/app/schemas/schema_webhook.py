"""Pydantic models for schema lifecycle webhooks (GH-135)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class SchemaWebhookCreate(BaseModel):
    """Create a project-scoped schema webhook."""

    url: str = Field(..., min_length=1, description="HTTPS (or HTTP) URL to POST event payloads to.")
    secret: Optional[str] = Field(
        None,
        description=(
            "Optional shared secret; when set, POSTs include header "
            "X-Objectified-Signature-256 (sha256 HMAC of the raw body)."
        ),
    )
    events: Optional[List[str]] = Field(
        None,
        description="Event types to receive. Defaults to all known schema events.",
    )
    enabled: bool = True
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SchemaWebhookUpdate(BaseModel):
    """Patchable fields for a schema webhook."""

    url: Optional[str] = Field(None, min_length=1)
    secret: Optional[str] = Field(
        None,
        description="Set a new secret, or pass an empty string to clear signing.",
    )
    events: Optional[List[str]] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class SchemaWebhookSchema(BaseModel):
    """Webhook configuration returned by the API (never includes raw secret)."""

    id: str
    project_id: str
    url: str
    events: List[str]
    enabled: bool
    has_secret: bool
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class SchemaWebhookDeliverySchema(BaseModel):
    """Queued or completed webhook delivery."""

    id: str
    webhook_id: str
    event_type: str
    payload: dict[str, Any]
    status: str
    attempts: int
    max_attempts: int
    next_attempt_at: Optional[datetime] = None
    last_error: Optional[str] = None
    http_status: Optional[int] = None
    delivered_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class SchemaWebhookProcessRequest(BaseModel):
    """Request body for processing pending deliveries."""

    limit: int = Field(25, ge=1, le=200, description="Maximum deliveries to attempt in this call.")


class SchemaWebhookProcessResponse(BaseModel):
    """Summary after processing pending deliveries."""

    attempted: int
    delivered: int
    failed: int
