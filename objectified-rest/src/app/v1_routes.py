"""
REST routes for /v1/users, /v1/tenants, /v1/tenants/{id}/members,
/v1/tenants/{id}/administrators. Documented in OpenAPI.
"""

import logging
from typing import Annotated, Any, List, Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin
from app.database import db
from app.schemas import (
    AccountCreate,
    AccountSchema,
    AccountUpdate,
    TenantAccountCreate,
    TenantAccountSchema,
    TenantAccountUpdate,
    TenantCreate,
    TenantSchema,
    TenantUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["Users and Tenants"])

# ---------------------------------------------------------------------------
# Password hashing — Argon2id via argon2-cffi
# ---------------------------------------------------------------------------
# Argon2id (RFC 9106) is the current best-practice adaptive password hash.
# PasswordHasher defaults: time_cost=3, memory_cost=65536 (64 MiB),
# parallelism=4, hash_len=32, salt_len=16. The encoded string stores all
# parameters so existing hashes remain verifiable after a cost change.

_ph = PasswordHasher()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _not_found(entity: str, entity_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{entity} not found: {entity_id}")


# ---------------------------------------------------------------------------
# User / Account Routes
# ---------------------------------------------------------------------------

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
    # Check for duplicate email (case-insensitive, aligned with DB UNIQUE INDEX on LOWER(email))
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
        (
            payload.name,
            payload.email,
            hashed,
            False,
            True,
            __import__("json").dumps(payload.metadata),
        ),
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
def update_user(user_id: str, payload: AccountUpdate) -> AccountSchema:
    """Update a user account by ID."""
    rows = db.execute_query(
        "SELECT id FROM objectified.account WHERE id = %s AND deleted_at IS NULL",
        (user_id,),
    )
    if not rows:
        raise _not_found("User", user_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.email is not None:
        # Ensure email is unique (case-insensitive) before updating, aligned with the DB index.
        existing_email_rows = db.execute_query(
            """
            SELECT 1
            FROM objectified.account
            WHERE lower(email) = lower(%s)
              AND id <> %s
              AND deleted_at IS NULL
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
        params.append(__import__("json").dumps(payload.metadata))

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
        "The record is retained; no hard delete is performed."
    ),
)
def deactivate_user(user_id: str) -> None:
    """Deactivate (soft-delete) a user account."""
    rows = db.execute_query(
        "SELECT id FROM objectified.account WHERE id = %s AND deleted_at IS NULL",
        (user_id,),
    )
    if not rows:
        raise _not_found("User", user_id)

    db.execute_mutation(
        """
        UPDATE objectified.account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND deleted_at IS NULL
        """,
        (user_id,),
        returning=False,
    )


# ---------------------------------------------------------------------------
# Tenant Routes
# ---------------------------------------------------------------------------

@router.get(
    "/tenants",
    response_model=List[TenantSchema],
    summary="List tenants",
    description="List all tenants. Soft-deleted tenants are excluded by default.",
)
def list_tenants(
    include_deleted: bool = Query(False, description="Include soft-deleted tenants"),
) -> List[TenantSchema]:
    """List tenants."""
    if include_deleted:
        query = """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    else:
        query = """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE deleted_at IS NULL
            ORDER BY created_at ASC
        """
        rows = db.execute_query(query)
    return [TenantSchema(**dict(r)) for r in rows]


@router.get(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    summary="Get tenant by ID",
    description="Retrieve a single tenant by its UUID. Soft-deleted tenants are excluded by default.",
)
def get_tenant(
    tenant_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted tenant"),
) -> TenantSchema:
    """Get a tenant by ID."""
    if include_deleted:
        rows = db.execute_query(
            """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE id = %s
            """,
            (tenant_id,),
        )
    else:
        rows = db.execute_query(
            """
            SELECT id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
            FROM objectified.tenant
            WHERE id = %s AND deleted_at IS NULL
            """,
            (tenant_id,),
        )
    if not rows:
        raise _not_found("Tenant", tenant_id)
    return TenantSchema(**dict(rows[0]))


@router.post(
    "/tenants",
    response_model=TenantSchema,
    status_code=201,
    summary="Create tenant",
    description="Create a new tenant. Slug must be unique and URL-safe (lowercase alphanumeric with hyphens).",
)
def create_tenant(payload: TenantCreate) -> TenantSchema:
    """Create a new tenant."""
    existing = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE slug = %s",
        (payload.slug,),
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug already in use: {payload.slug}")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.tenant (name, description, slug, enabled, metadata)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        RETURNING id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
        """,
        (
            payload.name,
            payload.description,
            payload.slug,
            payload.enabled,
            __import__("json").dumps(payload.metadata),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create tenant")
    return TenantSchema(**dict(row))


@router.put(
    "/tenants/{tenant_id}",
    response_model=TenantSchema,
    summary="Update tenant",
    description="Update an existing tenant. Only provided fields are updated.",
)
def update_tenant(tenant_id: str, payload: TenantUpdate) -> TenantSchema:
    """Update a tenant by ID."""
    rows = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s AND deleted_at IS NULL",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)

    updates: list[str] = []
    params: list = []

    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name)
    if payload.description is not None:
        updates.append("description = %s")
        params.append(payload.description)
    if payload.slug is not None:
        # Ensure slug uniqueness before updating to avoid DB unique-constraint violations
        existing_slug_rows = db.execute_query(
            "SELECT id FROM objectified.tenant WHERE slug = %s AND id <> %s",
            (payload.slug, tenant_id),
        )
        if existing_slug_rows:
            raise HTTPException(
                status_code=409,
                detail="Tenant slug already exists",
            )
        updates.append("slug = %s")
        params.append(payload.slug)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(__import__("json").dumps(payload.metadata))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(tenant_id)
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant
        SET {", ".join(updates)}
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name, description, slug, enabled, metadata, created_at, updated_at, deleted_at
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("Tenant", tenant_id)
    return TenantSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}",
    status_code=204,
    summary="Deactivate tenant",
    description=(
        "Soft-delete (deactivate) a tenant by setting deleted_at. "
        "The record is retained; no hard delete is performed."
    ),
)
def deactivate_tenant(tenant_id: str) -> None:
    """Deactivate (soft-delete) a tenant."""
    rows = db.execute_query(
        "SELECT id FROM objectified.tenant WHERE id = %s AND deleted_at IS NULL",
        (tenant_id,),
    )
    if not rows:
        raise _not_found("Tenant", tenant_id)

    db.execute_mutation(
        """
        UPDATE objectified.tenant
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
        returning=False,
    )


# ---------------------------------------------------------------------------
# Tenant Members Routes
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/members",
    response_model=List[TenantAccountSchema],
    summary="List tenant members",
    description="List all active members (tenant_account rows) for a tenant.",
)
def list_tenant_members(tenant_id: str) -> List[TenantAccountSchema]:
    """List members of a tenant."""
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        FROM objectified.tenant_account
        WHERE tenant_id = %s AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (tenant_id,),
    )
    return [TenantAccountSchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/members",
    response_model=TenantAccountSchema,
    status_code=201,
    summary="Add tenant member",
    description="Add an account to a tenant with a given access level.",
)
def add_tenant_member(tenant_id: str, payload: TenantAccountCreate) -> TenantAccountSchema:
    """Add a member to a tenant."""
    _assert_tenant_exists(tenant_id)
    _assert_tenant_exists(tenant_id)
    # Ensure the tenant_id in the payload (if provided) matches the path parameter
    payload_tenant_id = getattr(payload, "tenant_id", None)
    if payload_tenant_id is not None and payload_tenant_id != tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Payload tenant_id does not match path tenant_id",
        )

    existing = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, payload.account_id),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Account is already a member of this tenant")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
        VALUES (%s, %s, %s, %s)
        RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        """,
        (tenant_id, payload.account_id, payload.access_level.value, payload.enabled),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to add member")
    return TenantAccountSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/members/{account_id}",
    status_code=204,
    summary="Remove tenant member",
    description="Remove (soft-delete) an account from a tenant.",
)
def remove_tenant_member(tenant_id: str, account_id: str) -> None:
    """Remove a member from a tenant (soft-delete)."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    db.execute_mutation(
        """
        UPDATE objectified.tenant_account
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
        returning=False,
    )


# ---------------------------------------------------------------------------
# Tenant Administrators Routes
# ---------------------------------------------------------------------------

@router.get(
    "/tenants/{tenant_id}/administrators",
    response_model=List[TenantAccountSchema],
    summary="List tenant administrators",
    description="List all active members with access_level=administrator for a tenant.",
)
def list_tenant_administrators(tenant_id: str) -> List[TenantAccountSchema]:
    """List administrators of a tenant."""
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        FROM objectified.tenant_account
        WHERE tenant_id = %s AND access_level = 'administrator' AND deleted_at IS NULL
        ORDER BY created_at ASC
        """,
        (tenant_id,),
    )
    return [TenantAccountSchema(**dict(r)) for r in rows]


@router.put(
    "/tenants/{tenant_id}/members/{account_id}",
    response_model=TenantAccountSchema,
    summary="Update tenant member",
    description="Update the access level or enabled status of a tenant member.",
)
def update_tenant_member(
    tenant_id: str, account_id: str, payload: TenantAccountUpdate
) -> TenantAccountSchema:
    """Update a tenant member's access level or enabled status."""
    rows = db.execute_query(
        """
        SELECT id FROM objectified.tenant_account
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")

    updates: list[str] = []
    params: list = []

    if payload.access_level is not None:
        updates.append("access_level = %s")
        params.append(payload.access_level.value)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.extend([tenant_id, account_id])
    row = db.execute_mutation(
        f"""
        UPDATE objectified.tenant_account
        SET {", ".join(updates)}
        WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
        RETURNING id, tenant_id, account_id, access_level, enabled, created_at, updated_at, deleted_at
        """,
        tuple(params),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Member not found in this tenant")
    return TenantAccountSchema(**dict(row))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

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
