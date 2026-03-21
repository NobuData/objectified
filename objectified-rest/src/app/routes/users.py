"""REST routes for /v1/users."""

import json
import logging
from typing import Annotated, Any, List, Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.auth import require_admin, require_authenticated
from app.database import db
from app.routes.helpers import _get_active_account_by_id, _not_found
from app.schemas import (
    AccountCreate,
    AccountLifecycleEventSchema,
    AccountSchema,
    AccountUpdate,
    ProfileUpdate,
    UserDeactivateBody,
    UserListSort,
    UserListStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Users"])

_ACCOUNT_SELECT = (
    "id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at, "
    "last_login_at, deactivation_reason, deactivated_by"
)


def _sanitize_ilike(text: str) -> str:
    """Escape ``%``, ``_``, and ``\\`` for use in ILIKE ... ESCAPE '\\'."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

# ---------------------------------------------------------------------------
# Password hashing — Argon2id via argon2-cffi
# ---------------------------------------------------------------------------

_ph = PasswordHasher()


def _hash_password(password: str) -> str:
    """Hash *password* with Argon2id (argon2-cffi).

    Returns a self-describing encoded string that embeds the algorithm variant
    (argon2id), version, cost parameters, random salt, and digest — suitable
    for long-term storage and resistant to GPU/ASIC brute-force attacks.

    Example output:
        $argon2id$v=19$m=65536,t=3,p=4$<salt_b64>$<hash_b64>
    """
    return _ph.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    """Verify *plain* against a stored Argon2 hash.

    Returns ``True`` if the password matches, ``False`` otherwise.
    Never raises on a mismatch — only propagates unexpected errors.
    """
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _require_jwt_caller(
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
) -> dict[str, Any]:
    """Require JWT authentication (used for /me; API key has no user_id)."""
    if caller.get("auth_method") != "jwt" or not caller.get("user_id"):
        raise HTTPException(
            status_code=403,
            detail="Profile endpoints require JWT authentication.",
        )
    return caller


@router.get(
    "/me",
    response_model=AccountSchema,
    summary="Get current user profile",
    description=(
        "Return the authenticated user's account (requires JWT). "
        "Use ``Authorization: Bearer <token>`` with a token from ``/v1/auth/login``."
    ),
)
def get_me(
    caller: Annotated[dict[str, Any], Depends(_require_jwt_caller)],
) -> AccountSchema:
    """Get the current user's profile by JWT."""
    user_id = caller["user_id"]
    account = _get_active_account_by_id(
        user_id,
        columns=_ACCOUNT_SELECT,
    )
    if not account:
        raise _not_found("User", user_id)
    return AccountSchema(**account)


@router.patch(
    "/me",
    response_model=AccountSchema,
    summary="Update current user profile",
    description=(
        "Update the authenticated user's name and/or metadata (requires JWT). "
        "Only ``name`` and ``metadata`` can be updated; use admin endpoints for other fields."
    ),
)
def update_me(
    caller: Annotated[dict[str, Any], Depends(_require_jwt_caller)],
    payload: ProfileUpdate,
) -> AccountSchema:
    """Update the current user's profile (name and metadata only)."""
    user_id = caller["user_id"]
    if not _get_active_account_by_id(user_id):
        raise _not_found("User", user_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(user_id)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.account
        SET {", ".join(updates)}, updated_at = timezone('utc', clock_timestamp())
        WHERE id = %s AND deleted_at IS NULL
        RETURNING {_ACCOUNT_SELECT}
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("User", user_id)
    return AccountSchema(**dict(row))


@router.get(
    "/users",
    response_model=List[AccountSchema],
    summary="List users (admin)",
    description=(
        "List all accounts. **Admin only** — requires a valid JWT with "
        "``is_admin=true``, an account that is an administrator in at least "
        "one tenant, or a valid internal API key. "
        "Soft-deleted accounts are excluded by default; pass "
        "``include_deleted=true`` to include them. "
        "Use ``status`` to filter by active/disabled/deactivated; when set, it "
        "defines which rows are returned regardless of ``include_deleted``. "
        "``search`` matches name or email (case-insensitive substring). "
        "``sort`` orders by created time or last login."
    ),
)
def list_users(
    include_deleted: bool = Query(False, description="Include soft-deleted accounts"),
    status: Optional[UserListStatus] = Query(
        None,
        description="Filter: active, disabled, or deactivated (overrides include_deleted for deleted_at)",
    ),
    search: Optional[str] = Query(
        None,
        max_length=500,
        description="Case-insensitive substring match on name or email",
    ),
    sort: UserListSort = Query(
        UserListSort.CREATED_AT_ASC,
        description="Sort by created_at or last_login_at",
    ),
    _admin: Annotated[dict[str, Any], Depends(require_admin)] = None,
) -> List[AccountSchema]:
    """List all user accounts (admin)."""
    conditions: list[str] = []
    params: list[Any] = []

    if status is not None:
        if status == UserListStatus.ACTIVE:
            conditions.append("deleted_at IS NULL AND enabled = true")
        elif status == UserListStatus.DISABLED:
            conditions.append("deleted_at IS NULL AND enabled = false")
        elif status == UserListStatus.DEACTIVATED:
            conditions.append("deleted_at IS NOT NULL")
    elif not include_deleted:
        conditions.append("deleted_at IS NULL")

    if search and search.strip():
        raw = search.strip()[:500]
        esc = _sanitize_ilike(raw)
        pat = f"%{esc}%"
        conditions.append(
            "(name ILIKE %s ESCAPE '\\' OR email ILIKE %s ESCAPE '\\')"
        )
        params.extend([pat, pat])

    where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    order_map = {
        UserListSort.CREATED_AT_ASC: "created_at ASC NULLS LAST",
        UserListSort.CREATED_AT_DESC: "created_at DESC NULLS LAST",
        UserListSort.LAST_LOGIN_AT_ASC: "last_login_at ASC NULLS LAST, created_at ASC",
        UserListSort.LAST_LOGIN_AT_DESC: "last_login_at DESC NULLS LAST, created_at DESC",
    }
    order_sql = order_map[sort]
    query = f"""
        SELECT {_ACCOUNT_SELECT}
        FROM objectified.account
        {where_sql}
        ORDER BY {order_sql}
    """
    rows = db.execute_query(query, tuple(params) if params else None)
    return [AccountSchema(**dict(r)) for r in rows]


@router.get(
    "/users/{user_id}/lifecycle-events",
    response_model=List[AccountLifecycleEventSchema],
    summary="List user lifecycle audit events (admin)",
    description=(
        "Return recent account lifecycle events (e.g. deactivation) for auditing. **Admin only.**"
    ),
)
def list_user_lifecycle_events(
    user_id: str,
    _admin: Annotated[dict[str, Any], Depends(require_admin)] = None,
) -> List[AccountLifecycleEventSchema]:
    """List lifecycle audit rows for an account."""
    exists = db.execute_query("SELECT 1 FROM objectified.account WHERE id = %s LIMIT 1", (user_id,))
    if not exists:
        raise _not_found("User", user_id)
    rows = db.execute_query(
        """
        SELECT id, account_id, event_type, reason, actor_id, created_at
        FROM objectified.account_lifecycle_event
        WHERE account_id = %s
        ORDER BY created_at DESC
        LIMIT 100
        """,
        (user_id,),
    )
    return [AccountLifecycleEventSchema(**dict(r)) for r in rows]


@router.get(
    "/users/{user_id}",
    response_model=AccountSchema,
    summary="Get user by ID",
    description="Retrieve a single account by its UUID.",
)
def get_user(
    user_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted account"),
) -> AccountSchema:
    """Get a user account by ID."""
    if include_deleted:
        rows = db.execute_query(
            f"""
            SELECT {_ACCOUNT_SELECT}
            FROM objectified.account
            WHERE id = %s
            """,
            (user_id,),
        )
    else:
        rows = db.execute_query(
            f"""
            SELECT {_ACCOUNT_SELECT}
            FROM objectified.account
            WHERE id = %s
              AND deleted_at IS NULL
            """,
            (user_id,),
        )
    if not rows:
        raise _not_found("User", user_id)
    return AccountSchema(**dict(rows[0]))


@router.post(
    "/users",
    response_model=AccountSchema,
    status_code=201,
    summary="Create user (Sign Up)",
    description="Register a new user account. Email must be unique.",
)
def create_user(payload: AccountCreate) -> AccountSchema:
    """Create a new user account (sign-up)."""
    existing = db.execute_query(
        "SELECT id FROM objectified.account WHERE LOWER(email) = LOWER(%s)",
        (payload.email,),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    hashed = _hash_password(payload.password)
    row = db.execute_mutation(
        f"""
        INSERT INTO objectified.account (name, email, password, verified, enabled, metadata)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        RETURNING {_ACCOUNT_SELECT}
        """,
        (payload.name, payload.email, hashed, False, True, json.dumps(payload.metadata)),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return AccountSchema(**dict(row))


@router.put(
    "/users/{user_id}",
    response_model=AccountSchema,
    summary="Update user",
    description="Update an existing user account. Only provided fields are updated.",
)
def update_user(
    user_id: str,
    payload: AccountUpdate,
    _admin: Annotated[dict[str, Any], Depends(require_admin)] = None,
) -> AccountSchema:
    """Update a user account by ID."""
    if not _get_active_account_by_id(user_id):
        raise _not_found("User", user_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.email is not None:
        existing_email_rows = db.execute_query(
            """
            SELECT 1
            FROM objectified.account
            WHERE lower(email) = lower(%s)
              AND id <> %s
            """,
            (payload.email, user_id),
        )
        if existing_email_rows:
            raise HTTPException(status_code=409, detail="Email already in use")
        updates.append("email = %s")
        params.append(payload.email)
    if payload.password is not None:
        updates.append("password = %s")
        params.append(_hash_password(payload.password))
    if payload.verified is not None:
        updates.append("verified = %s")
        params.append(payload.verified)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(user_id)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.account
        SET {", ".join(updates)}
        WHERE id = %s AND deleted_at IS NULL
        RETURNING {_ACCOUNT_SELECT}
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("User", user_id)
    return AccountSchema(**dict(row))


@router.delete(
    "/users/{user_id}",
    status_code=204,
    summary="Deactivate user",
    description=(
        "Soft-delete (deactivate) a user account by setting deleted_at. "
        "The record is retained; no hard delete is performed. **Admin only.** "
        "Optional JSON body: ``{ \"reason\": \"...\" }`` (stored on the account and "
        "in the lifecycle audit log)."
    ),
)
def deactivate_user(
    user_id: str,
    caller: Annotated[dict[str, Any], Depends(require_admin)],
    payload: Optional[UserDeactivateBody] = Body(None),
) -> None:
    """Deactivate (soft-delete) a user account."""
    if not _get_active_account_by_id(user_id):
        raise _not_found("User", user_id)

    reason: Optional[str] = None
    if payload is not None and payload.reason is not None:
        stripped = payload.reason.strip()
        reason = stripped if stripped else None
    actor_id = caller.get("user_id")

    with db.transaction() as conn:
        row = db.execute_mutation(
            """
            UPDATE objectified.account
            SET deleted_at = timezone('utc', clock_timestamp()),
                enabled = false,
                deactivation_reason = %s,
                deactivated_by = %s
            WHERE id = %s AND deleted_at IS NULL
            RETURNING id
            """,
            (reason, actor_id, user_id),
            _conn=conn,
        )
        if not row:
            raise _not_found("User", user_id)

        db.execute_mutation(
            """
            INSERT INTO objectified.account_lifecycle_event (account_id, event_type, reason, actor_id)
            VALUES (%s, 'deactivated', %s, %s)
            """,
            (user_id, reason, actor_id),
            returning=False,
            _conn=conn,
        )
