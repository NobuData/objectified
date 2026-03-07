"""
Authentication module for JWT and API Key validation.

Supports both JWT tokens (from NextAuth) and API keys for authentication.
Uses objectified schema: objectified.tenant, objectified.tenant_account.
"""

import logging
from typing import Annotated, Any, Optional

from fastapi import Depends, Header, HTTPException
import jwt

from app.config import settings
from app.database import db

logger = logging.getLogger(__name__)


def decode_jwt(token: str) -> Optional[dict[str, Any]]:
    """
    Decode and validate a JWT token.

    Args:
        token: The JWT token to decode

    Returns:
        Decoded token payload if valid, None otherwise
    """
    try:
        if token.startswith("Bearer "):
            token = token[7:]
        payload = jwt.decode(
            token,
            settings.effective_jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("decode_jwt: Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("decode_jwt: Invalid token - %s", e)
        return None
    except Exception as e:
        logger.error("decode_jwt: Exception - %s", e, exc_info=True)
        return None


def get_user_tenants(user_id: str) -> list[dict[str, Any]]:
    """
    Get all tenants that a user belongs to (objectified schema).

    Args:
        user_id: The user's ID (account id)

    Returns:
        List of tenant dicts with id, slug, name
    """
    query = """
        SELECT t.id, t.slug, t.name
        FROM objectified.tenant t
        JOIN objectified.tenant_account tu ON t.id = tu.tenant_id
        WHERE tu.account_id = %s AND t.deleted_at IS NULL AND tu.deleted_at IS NULL
    """
    return db.execute_query(query, (user_id,))


def validate_user_tenant_access(
    user_id: str, tenant_slug: str
) -> Optional[dict[str, Any]]:
    """
    Validate that a user has access to a specific tenant.

    Args:
        user_id: The user's ID from JWT (account id)
        tenant_slug: The tenant slug from the URL

    Returns:
        Tenant information if user has access, None otherwise
    """
    tenant_query = """
        SELECT id AS tenant_id, slug AS tenant_slug, name AS tenant_name
        FROM objectified.tenant
        WHERE slug = %s AND deleted_at IS NULL
        LIMIT 1
    """
    tenant_results = db.execute_query(tenant_query, (tenant_slug,))
    if not tenant_results:
        logger.warning("Tenant not found: %s", tenant_slug)
        return None

    tenant = tenant_results[0]
    tenant_id = tenant["tenant_id"]

    access_query = """
        SELECT 1
        FROM objectified.tenant_account
        WHERE account_id = %s AND tenant_id = %s AND deleted_at IS NULL
        LIMIT 1
    """
    access_results = db.execute_query(access_query, (user_id, tenant_id))
    if not access_results:
        logger.warning(
            "User %s does not have access to tenant %s", user_id, tenant_id
        )
        return None

    return tenant


def validate_authentication(
    tenant_slug: str,
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    """
    Validate authentication using either JWT token or API key.

    Returns:
        Dict with tenant information and auth details.

    Raises:
        HTTPException: If authentication fails or user lacks tenant access.
    """
    if authorization:
        jwt_payload = decode_jwt(authorization)
        if not jwt_payload:
            raise HTTPException(
                status_code=401,
                detail="Invalid JWT token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = jwt_payload.get("user_id") or jwt_payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid JWT token: missing user identifier",
            )
        tenant_data = validate_user_tenant_access(user_id, tenant_slug)
        if not tenant_data:
            raise HTTPException(
                status_code=403,
                detail="User does not have access to tenant: %s"
                % tenant_slug,
            )
        return {
            **tenant_data,
            "auth_method": "jwt",
            "user_id": user_id,
            "user_email": jwt_payload.get("email"),
            "user_name": jwt_payload.get("name"),
        }

    if x_api_key:
        api_key_data = db.validate_api_key(x_api_key)
        if not api_key_data:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired API key",
                headers={"WWW-Authenticate": "API-Key"},
            )
        if api_key_data.get("tenant_slug") != tenant_slug:
            raise HTTPException(
                status_code=403,
                detail="API key does not have access to this tenant",
            )
        return {**api_key_data, "auth_method": "api_key"}

    raise HTTPException(
        status_code=401,
        detail=(
            "Authentication required. Provide either JWT token "
            "(Authorization: Bearer <token>) or API key (X-API-Key: <key>)"
        ),
        headers={"WWW-Authenticate": "Bearer, API-Key"},
    )


def get_authenticated_user_id(auth_data: dict[str, Any]) -> Optional[str]:
    """Return user ID from auth data for JWT; None for API key."""
    if auth_data.get("auth_method") == "jwt":
        return auth_data.get("user_id")
    return None


# ---------------------------------------------------------------------------
# FastAPI Depends-compatible auth dependencies
# ---------------------------------------------------------------------------

def _resolve_caller(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    """
    Resolve caller identity from JWT or API key without requiring a tenant slug.

    Returns a dict with at least:
        auth_method: "jwt" | "api_key"
        user_id: str | None  (set for JWT; None for API key)
        is_admin: bool        (True if JWT payload has is_admin=true or API key is internal)

    Raises:
        HTTPException 401 if no valid credential is presented.
    """
    if authorization:
        payload = decode_jwt(authorization)
        if not payload:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired JWT token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id: Optional[str] = payload.get("user_id") or payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid JWT token: missing user identifier",
            )
        return {
            "auth_method": "jwt",
            "user_id": user_id,
            "user_email": payload.get("email"),
            "user_name": payload.get("name"),
            # Honour an explicit is_admin claim in the token, then fall
            # back to checking whether the account is an administrator in
            # any active tenant.
            "is_admin": bool(payload.get("is_admin", False)),
        }

    if x_api_key:
        api_key_data = db.validate_api_key(x_api_key)
        if not api_key_data:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired API key",
                headers={"WWW-Authenticate": "API-Key"},
            )
        # API keys that pass validate_api_key are considered internal/admin keys.
        return {**api_key_data, "auth_method": "api_key", "is_admin": True}

    raise HTTPException(
        status_code=401,
        detail=(
            "Authentication required. Provide either a JWT token "
            "(Authorization: Bearer <token>) or an API key (X-API-Key: <key>)."
        ),
        headers={"WWW-Authenticate": "Bearer, API-Key"},
    )


def _is_platform_admin(user_id: str) -> bool:
    """
    Return True when the account holds the 'administrator' role in at
    least one active tenant.  Used as a fallback when the JWT does not
    carry an explicit is_admin claim.
    """
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account ta
        JOIN objectified.tenant t ON t.id = ta.tenant_id
        WHERE ta.account_id = %s
          AND ta.access_level = 'administrator'
          AND ta.deleted_at IS NULL
          AND t.deleted_at IS NULL
        LIMIT 1
        """,
        (user_id,),
    )
    return bool(rows)


def require_authenticated(
    caller: Annotated[dict[str, Any], Depends(_resolve_caller)],
) -> dict[str, Any]:
    """
    FastAPI dependency: require a valid JWT or API key.

    Injects the caller identity dict into the handler.  Does **not** check
    admin status; use ``require_admin`` for that.
    """
    return caller


def require_admin(
    caller: Annotated[dict[str, Any], Depends(_resolve_caller)],
) -> dict[str, Any]:
    """
    FastAPI dependency: require a valid credential **and** admin privileges.

    Admin is determined by:
      1. ``is_admin: true`` in the JWT payload, OR
      2. The account holds ``access_level = 'administrator'`` in at least
         one active tenant (platform-wide admin proxy), OR
      3. A valid internal API key (all validated API keys are treated as
         internal/admin).

    Raises:
        HTTPException 401 if unauthenticated.
        HTTPException 403 if authenticated but not an admin.
    """
    if caller.get("is_admin"):
        return caller

    # For JWT callers without an explicit is_admin claim, check the DB.
    if caller.get("auth_method") == "jwt":
        user_id = caller.get("user_id")
        if user_id and _is_platform_admin(user_id):
            caller["is_admin"] = True
            return caller

    raise HTTPException(
        status_code=403,
        detail="Admin privileges required.",
    )

