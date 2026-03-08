"""Shared internal helpers used by multiple v1 route modules."""

import logging
from typing import Optional

from fastapi import HTTPException

from app.database import db

logger = logging.getLogger(__name__)


def _not_found(entity: str, entity_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{entity} not found: {entity_id}")


def _assert_tenant_exists(tenant_id: str) -> None:
    """Raise 404 if tenant does not exist or is deleted."""
    rows = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s AND deleted_at IS NULL",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)


def _assert_account_exists(account_id: str) -> None:
    """Raise 404 if account does not exist or is deleted."""
    rows = db.execute_query(
        "SELECT id FROM objectified.account WHERE id = %s AND deleted_at IS NULL",
        (account_id,),
    )
    if not rows:
        raise _not_found("User", account_id)


def _validate_payload_tenant_id(payload_tenant_id: Optional[str], path_tenant_id: str) -> None:
    """Raise 400 if an optional body ``tenant_id`` conflicts with the URL path value."""
    if payload_tenant_id is not None and payload_tenant_id != path_tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Payload tenant_id does not match path tenant_id",
        )


def _resolve_account_id(account_id: Optional[str], email: Optional[str]) -> str:
    """Resolve and return the account UUID from either ``account_id`` or ``email``.

    ``account_id`` takes precedence when both are supplied.  Raises 404 if the
    account cannot be found.
    """
    if account_id:
        _assert_account_exists(account_id)
        return account_id

    rows = db.execute_query(
        """
        SELECT id FROM objectified.account
        WHERE LOWER(email) = LOWER(%s) AND deleted_at IS NULL
        LIMIT 1
        """,
        (email,),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No active account found with email: {email}",
        )
    return str(rows[0]["id"])

