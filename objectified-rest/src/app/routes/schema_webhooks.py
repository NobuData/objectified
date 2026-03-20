"""REST routes for schema lifecycle webhooks (GH-135)."""

from __future__ import annotations

import ipaddress
import json
import logging
import socket
from typing import Annotated, Any, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated, require_project_permission
from app.database import db
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.schema_webhook_service import (
    SCHEMA_WEBHOOK_EVENT_TYPES,
    process_pending_schema_webhook_deliveries,
)
from app.schemas.schema_webhook import (
    SchemaWebhookCreate,
    SchemaWebhookDeliverySchema,
    SchemaWebhookProcessRequest,
    SchemaWebhookProcessResponse,
    SchemaWebhookSchema,
    SchemaWebhookUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Schema Webhooks"])


def _is_unsafe_address(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the address should be blocked for SSRF prevention."""
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


def _normalize_webhook_url(url: str) -> str:
    u = url.strip()
    p = urlparse(u)
    if p.scheme not in ("https", "http"):
        raise HTTPException(status_code=400, detail="Webhook url must use http or https")
    if not p.netloc:
        raise HTTPException(status_code=400, detail="Webhook url must include a host")
    if p.username or p.password:
        raise HTTPException(
            status_code=400,
            detail="Webhook url must not contain credentials",
        )
    hostname = p.hostname or ""
    if not hostname:
        raise HTTPException(status_code=400, detail="Webhook url must include a host")

    # Resolve the hostname and reject private/loopback/link-local addresses (SSRF prevention).
    try:
        results = socket.getaddrinfo(hostname, None)
    except OSError:
        raise HTTPException(status_code=400, detail="Webhook url host could not be resolved")

    for _family, _type, _proto, _canonname, sockaddr in results:
        addr_str = sockaddr[0]
        try:
            addr = ipaddress.ip_address(addr_str)
        except ValueError:
            continue
        if _is_unsafe_address(addr):
            raise HTTPException(
                status_code=400,
                detail="Webhook url must not target a private, loopback, or reserved address",
            )

    return u


def _validate_events(events: Optional[List[str]], *, required: bool) -> Optional[List[str]]:
    if events is None:
        if required:
            raise HTTPException(status_code=400, detail="events is required")
        return None
    if not events:
        raise HTTPException(status_code=400, detail="events must not be empty")
    unknown = [e for e in events if e not in SCHEMA_WEBHOOK_EVENT_TYPES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown event type(s): {', '.join(unknown)}. "
            f"Allowed: {', '.join(sorted(SCHEMA_WEBHOOK_EVENT_TYPES))}",
        )
    return events


def _row_to_webhook_schema(row: dict[str, Any]) -> SchemaWebhookSchema:
    ev = row.get("events")
    if isinstance(ev, list):
        events_list = [str(x) for x in ev]
    else:
        events_list = []
    meta = row.get("metadata")
    if meta is None:
        meta = {}
    has_secret = bool(row.get("has_secret"))
    return SchemaWebhookSchema(
        id=str(row["id"]),
        project_id=str(row["project_id"]),
        url=str(row["url"]),
        events=events_list,
        enabled=bool(row.get("enabled", True)),
        has_secret=has_secret,
        description=row.get("description"),
        metadata=meta if isinstance(meta, dict) else {},
        created_at=row["created_at"],
        updated_at=row.get("updated_at"),
        deleted_at=row.get("deleted_at"),
    )


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhooks",
    response_model=List[SchemaWebhookSchema],
    summary="List schema webhooks for a project",
    description="Return active webhook endpoints configured for schema events on this project.",
)
def list_schema_webhooks(
    tenant_id: str,
    project_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[SchemaWebhookSchema]:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    rows = db.execute_query(
        """
        SELECT id, project_id, url, events, enabled, description, metadata,
               created_at, updated_at, deleted_at,
               (COALESCE(secret, '') <> '') AS has_secret
        FROM objectified.schema_webhook
        WHERE project_id = %s
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (project_id,),
    )
    return [_row_to_webhook_schema(dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhooks",
    response_model=SchemaWebhookSchema,
    status_code=201,
    summary="Create a schema webhook",
    description=(
        "Register a URL to receive POST requests when schema events occur "
        "(commit, publish, branch). Optional ``secret`` enables HMAC-SHA256 signing "
        "via the X-Objectified-Signature-256 header."
    ),
)
def create_schema_webhook(
    tenant_id: str,
    project_id: str,
    payload: SchemaWebhookCreate,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> SchemaWebhookSchema:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    url = _normalize_webhook_url(payload.url)
    events = _validate_events(payload.events, required=False)
    if events is None:
        events = sorted(SCHEMA_WEBHOOK_EVENT_TYPES)
    sec = payload.secret.strip() if payload.secret else None
    if sec == "":
        sec = None
    row = db.execute_mutation(
        """
        INSERT INTO objectified.schema_webhook
            (project_id, url, secret, events, enabled, description, metadata)
        VALUES (%s, %s, %s, %s::text[], %s, %s, %s::jsonb)
        RETURNING id, project_id, url, events, enabled, description, metadata,
                  created_at, updated_at, deleted_at,
                  (COALESCE(secret, '') <> '') AS has_secret
        """,
        (
            project_id,
            url,
            sec,
            events,
            payload.enabled,
            payload.description,
            json.dumps(payload.metadata or {}),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create schema webhook")
    return _row_to_webhook_schema(dict(row))


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhooks/{webhook_id}",
    response_model=SchemaWebhookSchema,
    summary="Get a schema webhook",
)
def get_schema_webhook(
    tenant_id: str,
    project_id: str,
    webhook_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> SchemaWebhookSchema:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    rows = db.execute_query(
        """
        SELECT id, project_id, url, events, enabled, description, metadata,
               created_at, updated_at, deleted_at,
               (COALESCE(secret, '') <> '') AS has_secret
        FROM objectified.schema_webhook
        WHERE id = %s
          AND project_id = %s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (webhook_id, project_id),
    )
    if not rows:
        raise _not_found("SchemaWebhook", webhook_id)
    return _row_to_webhook_schema(dict(rows[0]))


@router.patch(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhooks/{webhook_id}",
    response_model=SchemaWebhookSchema,
    summary="Update a schema webhook",
)
def patch_schema_webhook(
    tenant_id: str,
    project_id: str,
    webhook_id: str,
    payload: SchemaWebhookUpdate,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> SchemaWebhookSchema:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    existing = db.execute_query(
        """
        SELECT id FROM objectified.schema_webhook
        WHERE id = %s AND project_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (webhook_id, project_id),
    )
    if not existing:
        raise _not_found("SchemaWebhook", webhook_id)

    sets: list[str] = []
    params: list[Any] = []
    if payload.url is not None:
        sets.append("url = %s")
        params.append(_normalize_webhook_url(payload.url))
    if payload.events is not None:
        _validate_events(payload.events, required=True)
        sets.append("events = %s::text[]")
        params.append(payload.events)
    if payload.enabled is not None:
        sets.append("enabled = %s")
        params.append(payload.enabled)
    if payload.description is not None:
        sets.append("description = %s")
        params.append(payload.description)
    if payload.metadata is not None:
        sets.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))
    if payload.secret is not None:
        if payload.secret.strip() == "":
            sets.append("secret = NULL")
        else:
            sets.append("secret = %s")
            params.append(payload.secret.strip())

    if not sets:
        rows = db.execute_query(
            """
            SELECT id, project_id, url, events, enabled, description, metadata,
                   created_at, updated_at, deleted_at,
                   (COALESCE(secret, '') <> '') AS has_secret
            FROM objectified.schema_webhook
            WHERE id = %s AND project_id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (webhook_id, project_id),
        )
        if not rows:
            raise _not_found("SchemaWebhook", webhook_id)
        return _row_to_webhook_schema(dict(rows[0]))

    params.extend([webhook_id, project_id])
    row = db.execute_mutation(
        f"""
        UPDATE objectified.schema_webhook
        SET {", ".join(sets)}
        WHERE id = %s
          AND project_id = %s
          AND deleted_at IS NULL
        RETURNING id, project_id, url, events, enabled, description, metadata,
                  created_at, updated_at, deleted_at,
                  (COALESCE(secret, '') <> '') AS has_secret
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("SchemaWebhook", webhook_id)
    return _row_to_webhook_schema(dict(row))


@router.delete(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhooks/{webhook_id}",
    status_code=204,
    summary="Delete a schema webhook",
)
def delete_schema_webhook(
    tenant_id: str,
    project_id: str,
    webhook_id: str,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> None:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    row = db.execute_mutation(
        """
        UPDATE objectified.schema_webhook
        SET deleted_at = timezone('utc', clock_timestamp()),
            enabled = false
        WHERE id = %s
          AND project_id = %s
          AND deleted_at IS NULL
        RETURNING id
        """,
        (webhook_id, project_id),
    )
    if not row:
        raise _not_found("SchemaWebhook", webhook_id)


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhook-deliveries",
    response_model=List[SchemaWebhookDeliverySchema],
    summary="List recent schema webhook deliveries",
    description="Delivery queue and history for webhooks on this project (newest first).",
)
def list_schema_webhook_deliveries(
    tenant_id: str,
    project_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:read"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[SchemaWebhookDeliverySchema]:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    rows = db.execute_query(
        """
        SELECT d.id, d.webhook_id, d.event_type, d.payload, d.status,
               d.attempts, d.max_attempts, d.next_attempt_at, d.last_error,
               d.http_status, d.delivered_at, d.created_at, d.updated_at
        FROM objectified.schema_webhook_delivery d
        INNER JOIN objectified.schema_webhook w ON w.id = d.webhook_id
        WHERE w.project_id = %s
        ORDER BY d.created_at DESC
        LIMIT %s OFFSET %s
        """,
        (project_id, limit, offset),
    )
    out: list[SchemaWebhookDeliverySchema] = []
    for r in rows:
        rd = dict(r)
        pl = rd.get("payload")
        if not isinstance(pl, dict):
            pl = {}
        out.append(
            SchemaWebhookDeliverySchema(
                id=str(rd["id"]),
                webhook_id=str(rd["webhook_id"]),
                event_type=str(rd["event_type"]),
                payload=pl,
                status=str(rd["status"]),
                attempts=int(rd["attempts"] or 0),
                max_attempts=int(rd["max_attempts"] or 8),
                next_attempt_at=rd.get("next_attempt_at"),
                last_error=rd.get("last_error"),
                http_status=rd.get("http_status"),
                delivered_at=rd.get("delivered_at"),
                created_at=rd["created_at"],
                updated_at=rd.get("updated_at"),
            )
        )
    return out


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/schema-webhook-deliveries/process",
    response_model=SchemaWebhookProcessResponse,
    summary="Process pending schema webhook deliveries",
    description=(
        "Attempt HTTP delivery for pending rows (with retries and backoff). "
        "Intended for periodic invocation by automation or a worker."
    ),
)
def process_schema_webhook_deliveries_endpoint(
    tenant_id: str,
    project_id: str,
    body: SchemaWebhookProcessRequest,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("project:write"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> SchemaWebhookProcessResponse:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    stats = process_pending_schema_webhook_deliveries(project_id=project_id, limit=body.limit)
    return SchemaWebhookProcessResponse(
        attempted=stats["attempted"],
        delivered=stats["delivered"],
        failed=stats["failed"],
    )
