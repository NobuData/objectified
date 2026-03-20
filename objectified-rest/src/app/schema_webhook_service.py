"""Enqueue and deliver HTTP webhooks for schema lifecycle events (GH-135)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.database import db

logger = logging.getLogger(__name__)

SCHEMA_WEBHOOK_EVENT_TYPES = frozenset(
    {
        "schema.committed",
        "schema.published",
        "schema.promoted",
        "schema.branch_created",
    }
)


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def sign_webhook_body(body: bytes, secret: str) -> str:
    """Return GitHub-style sha256= digest for the raw request body."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def retry_delay_seconds(after_attempt: int) -> int:
    """Exponential backoff after a failed attempt (after_attempt >= 1)."""
    if after_attempt < 1:
        return 0
    return min(3600, 10 * (2 ** min(after_attempt - 1, 12)))


def enqueue_schema_webhook_deliveries(project_id: str, event_type: str, payload: dict[str, Any]) -> int:
    """
    Insert a pending delivery row for each enabled webhook on the project that subscribes to event_type.

    Returns the number of deliveries enqueued.
    """
    if event_type not in SCHEMA_WEBHOOK_EVENT_TYPES:
        logger.warning("Unknown schema webhook event %s — ignored", event_type)
        return 0

    body = json.dumps(payload, default=str)
    rows = db.execute_mutation(
        """
        INSERT INTO objectified.schema_webhook_delivery
            (webhook_id, event_type, payload, status)
        SELECT
            id AS webhook_id,
            %s AS event_type,
            %s::jsonb AS payload,
            'pending' AS status
        FROM objectified.schema_webhook
        WHERE project_id = %s
          AND deleted_at IS NULL
          AND enabled = true
          AND %s = ANY(events)
        RETURNING id
        """,
        (event_type, body, project_id, event_type),
    )
    if not rows:
        return 0
    if isinstance(rows, list):
        return len(rows)
    return 1


def _post_delivery(
    *,
    delivery_id: str,
    url: str,
    secret: Optional[str],
    event_type: str,
    payload: dict[str, Any],
) -> tuple[bool, Optional[int], Optional[str]]:
    """Perform one HTTP POST. Returns (ok, http_status, error_message)."""
    try:
        import httpx
    except ImportError:
        logger.error("httpx is required for webhook delivery")
        return False, None, "httpx package not installed"

    body_str = json.dumps(payload, default=str, separators=(",", ":"))
    body_bytes = body_str.encode("utf-8")
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "User-Agent": "Objectified-Schema-Webhook/1.0",
        "X-Objectified-Event": event_type,
        "X-Objectified-Delivery": delivery_id,
    }
    sec = (secret or "").strip()
    if sec:
        headers["X-Objectified-Signature-256"] = sign_webhook_body(body_bytes, sec)

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, content=body_bytes, headers=headers)
        if 200 <= resp.status_code < 300:
            return True, resp.status_code, None
        return False, resp.status_code, f"HTTP {resp.status_code}"
    except Exception as e:
        logger.warning("Webhook POST failed delivery_id=%s url=%s err=%s", delivery_id, url, e)
        return False, None, str(e)


def process_pending_schema_webhook_deliveries(*, project_id: str, limit: int) -> dict[str, int]:
    """
    Attempt delivery for up to ``limit`` pending rows for webhooks in ``project_id``.

    Returns counts: attempted, delivered, failed (fail = one attempt finished without deliver).
    """
    rows = db.execute_mutation(
        """
        WITH pending AS (
            SELECT d.id AS delivery_id,
                   d.event_type,
                   d.payload,
                   d.attempts,
                   d.max_attempts,
                   w.url,
                   w.secret,
                   w.project_id
            FROM objectified.schema_webhook_delivery d
            INNER JOIN objectified.schema_webhook w ON w.id = d.webhook_id
            WHERE w.project_id = %s
              AND w.deleted_at IS NULL
              AND w.enabled = true
              AND LOWER(d.status) = 'pending'
              AND d.attempts < d.max_attempts
              AND (
                  d.next_attempt_at IS NULL
                  OR d.next_attempt_at <= timezone('utc', clock_timestamp())
              )
            ORDER BY d.created_at ASC
            FOR UPDATE OF d SKIP LOCKED
            LIMIT %s
        ),
        claimed AS (
            UPDATE objectified.schema_webhook_delivery d
            SET status = 'processing'
            FROM pending
            WHERE d.id = pending.delivery_id
            RETURNING
                pending.delivery_id,
                pending.event_type,
                pending.payload,
                pending.attempts,
                pending.max_attempts,
                pending.url,
                pending.secret,
                pending.project_id
        )
        SELECT
            delivery_id,
            event_type,
            payload,
            attempts,
            max_attempts,
            url,
            secret,
            project_id
        FROM claimed
        """,
        (project_id, limit),
    )
    if not rows:
        rows = []
    elif not isinstance(rows, list):
        rows = [rows]

    attempted = 0
    delivered = 0
    failed = 0
    now = _utc_naive_now()

    for row in rows:
        attempted += 1
        delivery_id = str(row["delivery_id"])
        attempts = int(row["attempts"] or 0)
        max_attempts = int(row["max_attempts"] or 8)
        new_attempt = attempts + 1
        url = str(row["url"])
        secret = row.get("secret")
        if isinstance(secret, str):
            sec_val: Optional[str] = secret
        else:
            sec_val = None

        ok, http_status, err = _post_delivery(
            delivery_id=delivery_id,
            url=url,
            secret=sec_val,
            event_type=str(row["event_type"]),
            payload=row["payload"] if isinstance(row["payload"], dict) else {},
        )

        if ok:
            db.execute_mutation(
                """
                UPDATE objectified.schema_webhook_delivery
                SET status = 'delivered',
                    attempts = %s,
                    http_status = %s,
                    delivered_at = timezone('utc', clock_timestamp()),
                    last_error = NULL,
                    next_attempt_at = NULL
                WHERE id = %s
                """,
                (new_attempt, http_status, delivery_id),
                returning=False,
            )
            delivered += 1
            continue

        if new_attempt >= max_attempts:
            db.execute_mutation(
                """
                UPDATE objectified.schema_webhook_delivery
                SET status = 'dead',
                    attempts = %s,
                    http_status = %s,
                    last_error = %s,
                    next_attempt_at = NULL
                WHERE id = %s
                """,
                (new_attempt, http_status, err[:2000] if err else None, delivery_id),
                returning=False,
            )
        else:
            delay = retry_delay_seconds(new_attempt)
            nxt = now + timedelta(seconds=delay)
            db.execute_mutation(
                """
                UPDATE objectified.schema_webhook_delivery
                SET attempts = %s,
                    http_status = %s,
                    last_error = %s,
                    next_attempt_at = %s
                WHERE id = %s
                """,
                (new_attempt, http_status, err[:2000] if err else None, nxt, delivery_id),
                returning=False,
            )
        failed += 1

    return {"attempted": attempted, "delivered": delivered, "failed": failed}


def build_schema_webhook_payload(
    *,
    tenant_id: str,
    event_type: str,
    project_row: dict[str, Any],
    version_row: dict[str, Any],
    actor_user_id: Optional[str],
    snapshot_row: Optional[dict[str, Any]] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Assemble JSON payload posted to subscriber URLs."""
    occurred = datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
    project = {
        "id": str(project_row["id"]),
        "name": project_row.get("name"),
        "slug": project_row.get("slug"),
    }
    ver: dict[str, Any] = {
        "id": str(version_row["id"]),
        "name": version_row.get("name"),
        "description": version_row.get("description"),
        "published": version_row.get("published"),
        "visibility": version_row.get("visibility"),
        "published_at": version_row.get("published_at"),
        "code_generation_tag": version_row.get("code_generation_tag"),
        "source_version_id": str(version_row["source_version_id"])
        if version_row.get("source_version_id")
        else None,
    }
    if snapshot_row:
        ver["revision"] = snapshot_row.get("revision")
        ver["snapshot_id"] = str(snapshot_row["id"]) if snapshot_row.get("id") else None
        ver["snapshot_label"] = snapshot_row.get("label")
        ver["snapshot_created_at"] = snapshot_row.get("created_at")

    payload: dict[str, Any] = {
        "event": event_type,
        "occurred_at": occurred,
        "tenant_id": str(tenant_id),
        "project": project,
        "version": ver,
        "actor": {"user_id": str(actor_user_id)} if actor_user_id else {},
    }
    if extra:
        payload["context"] = extra
    return payload


def load_project_row(project_id: str) -> Optional[dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT id, tenant_id, name, slug
        FROM objectified.project
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (project_id,),
    )
    return dict(rows[0]) if rows else None


def load_version_row(version_id: str) -> Optional[dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT id, project_id, name, description, published, visibility, published_at,
               code_generation_tag, source_version_id
        FROM objectified.version
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (version_id,),
    )
    return dict(rows[0]) if rows else None


def try_emit_schema_webhook(
    *,
    project_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Enqueue deliveries; log and swallow errors so callers are never broken by webhooks."""
    try:
        n = enqueue_schema_webhook_deliveries(project_id, event_type, payload)
        if n:
            logger.info(
                "Schema webhooks enqueued project_id=%s event=%s deliveries=%s",
                project_id,
                event_type,
                n,
            )
    except Exception:
        logger.exception(
            "Failed to enqueue schema webhooks project_id=%s event=%s",
            project_id,
            event_type,
        )
