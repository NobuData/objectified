"""REST routes for /v1/users."""

import json
import logging
from typing import Annotated, Any, List

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin, require_authenticated
from app.database import db
from app.routes.helpers import _get_active_account_by_id, _not_found
from app.schemas import AccountCreate, AccountSchema, AccountUpdate, ProfileUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Users"])

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
        columns="id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at",
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
        RETURNING id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
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
        "``include_deleted=true`` to include them."
    ),
)
def list_users(
    include_deleted: bool = Query(False, description="Include soft-deleted accounts"),
    _admin: Annotated[dict[str, Any], Depends(require_admin)] = None,
) -> List[AccountSchema]:
    """List all user accounts (admin)."""
    if include_deleted:
        query = """
            SELECT id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.account
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    else:
        query = """
            SELECT id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.account
            WHERE deleted_at IS NULL
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    return [AccountSchema(**dict(r)) for r in rows]


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
            """
            SELECT id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.account
            WHERE id = %s
            """,
            (user_id,),
        )
    else:
        rows = db.execute_query(
            """
            SELECT id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
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
        """
        INSERT INTO objectified.account (name, email, password, verified, enabled, metadata)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        RETURNING id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
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
        RETURNING id, name, email, verified, enabled, metadata, created_at, updated_at, deleted_at
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
        "The record is retained; no hard delete is performed. **Admin only.**"
    ),
    dependencies=[Depends(require_admin)],
)
def deactivate_user(user_id: str) -> None:
    """Deactivate (soft-delete) a user account."""
    if not _get_active_account_by_id(user_id):
        raise _not_found("User", user_id)

    db.execute_mutation(
        """
        UPDATE objectified.account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND deleted_at IS NULL
        """,
        (user_id,),
    )
