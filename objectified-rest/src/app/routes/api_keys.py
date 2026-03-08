"""REST routes for /v1/tenants/{tenant_id}/api-keys — API key create/revoke."""

import hashlib
import json
import logging
import secrets
from typing import Annotated, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _assert_tenant_exists, _not_found
from app.schemas.auth import ApiKeyCreate, ApiKeyCreateResponse, ApiKeySchema

logger = logging.getLogger(__name__)

router = APIRouter(tags=["API Keys"])

# Prefix length displayed to users (for identification without revealing the secret)
_KEY_PREFIX_LEN = 8


def _generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.

    Returns:
        Tuple of (raw_key, key_prefix, key_hash) where:
        - raw_key:    The full API key — shown once, never stored.
        - key_prefix: First _KEY_PREFIX_LEN characters for display.
        - key_hash:   SHA-256 hex digest stored in the database.
    """
    raw = "ok_" + secrets.token_urlsafe(32)  # ~43 URL-safe characters after prefix
    prefix = raw[:_KEY_PREFIX_LEN]
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return raw, prefix, digest


@router.get(
    "/tenants/{tenant_id}/api-keys",
    response_model=List[ApiKeySchema],
    summary="List API keys for a tenant",
    description=(
        "List all active (non-revoked) API keys for the given tenant. "
        "The raw secret is never returned — only metadata and the key prefix."
    ),
)
def list_api_keys(
    tenant_id: str,
    include_revoked: bool = Query(False, description="Include revoked (soft-deleted) keys"),
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> List[ApiKeySchema]:
    """List API keys for a tenant."""
    _assert_tenant_exists(tenant_id)
    if include_revoked:
        rows = db.execute_query(
            """
            SELECT id, tenant_id, account_id, name, key_prefix,
                   expires_at, last_used, enabled, metadata,
                   created_at, updated_at, deleted_at
            FROM objectified.api_key
            WHERE tenant_id = %s
            ORDER BY created_at ASC
            """,
            (tenant_id,),
        )
    else:
        rows = db.execute_query(
            """
            SELECT id, tenant_id, account_id, name, key_prefix,
                   expires_at, last_used, enabled, metadata,
                   created_at, updated_at, deleted_at
            FROM objectified.api_key
            WHERE tenant_id = %s AND deleted_at IS NULL
            ORDER BY created_at ASC
            """,
            (tenant_id,),
        )
    return [ApiKeySchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=201,
    summary="Create API key for a tenant",
    description=(
        "Create a new API key scoped to the given tenant. "
        "The full secret is returned **once** in the ``raw_key`` field — store it immediately. "
        "Only the prefix and hash are stored server-side; the raw secret cannot be retrieved again."
    ),
)
def create_api_key(
    tenant_id: str,
    payload: ApiKeyCreate,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> ApiKeyCreateResponse:
    """Create a new API key for a tenant."""
    _assert_tenant_exists(tenant_id)

    account_id = caller.get("user_id") if caller else None
    if not account_id:
        raise HTTPException(status_code=401, detail="Cannot determine account from credentials")

    # Verify the calling account belongs to this tenant
    membership = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, account_id),
    )
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this tenant",
        )

    raw_key, prefix, key_hash = _generate_api_key()

    row = db.execute_mutation(
        """
        INSERT INTO objectified.api_key
            (tenant_id, account_id, name, key_hash, key_prefix, expires_at, enabled, metadata)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, tenant_id, account_id, name, key_prefix,
                  expires_at, last_used, enabled, metadata,
                  created_at, updated_at, deleted_at
        """,
        (
            tenant_id,
            account_id,
            payload.name,
            key_hash,
            prefix,
            payload.expires_at,
            True,
            json.dumps(payload.metadata),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create API key")

    logger.info("create_api_key: created key %s for tenant %s", row["id"], tenant_id)
    return ApiKeyCreateResponse(**dict(row), raw_key=raw_key)


@router.delete(
    "/tenants/{tenant_id}/api-keys/{key_id}",
    status_code=204,
    summary="Revoke (soft-delete) an API key",
    description=(
        "Revoke an API key by soft-deleting it. "
        "The key will be rejected on all subsequent requests. "
        "The record is retained for audit purposes."
    ),
)
def revoke_api_key(
    tenant_id: str,
    key_id: str,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> None:
    """Revoke (soft-delete) an API key."""
    _assert_tenant_exists(tenant_id)

    rows = db.execute_query(
        """
        SELECT id, account_id
        FROM objectified.api_key
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        """,
        (key_id, tenant_id),
    )
    if not rows:
        raise _not_found("API key", key_id)

    # Only the owning account or a tenant admin may revoke a key
    account_id = caller.get("user_id") if caller else None
    is_admin = caller.get("is_admin", False) if caller else False
    key_owner = str(rows[0]["account_id"])
    if not is_admin and account_id != key_owner:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to revoke this API key",
        )

    db.execute_mutation(
        """
        UPDATE objectified.api_key
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        """,
        (key_id, tenant_id),
        returning=False,
    )
    logger.info("revoke_api_key: revoked key %s from tenant %s", key_id, tenant_id)

