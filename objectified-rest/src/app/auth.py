"""
Authentication module for JWT and API Key validation.

Supports both JWT tokens (from NextAuth) and API keys for authentication.
Uses objectified schema: objectified.tenant, objectified.tenant_account.
"""

import logging
from typing import Any, Optional

from fastapi import Header, HTTPException
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
