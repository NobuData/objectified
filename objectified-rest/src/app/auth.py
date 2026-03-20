"""
Authentication module for JWT and API Key validation.

Supports both JWT tokens (from NextAuth) and API keys for authentication.
Uses objectified schema: objectified.tenant, objectified.tenant_account.
"""

import logging
from typing import Annotated, Any, Callable, Optional

import jwt
from fastapi import Depends, Header, HTTPException, Request

from app.config import settings
from app.database import db
from app.request_context import bind_auth_context

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
        result = {
            **tenant_data,
            "auth_method": "jwt",
            "user_id": user_id,
            "user_email": jwt_payload.get("email"),
            "user_name": jwt_payload.get("name"),
        }
        bind_auth_context(result)
        return result

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
        scope_role = str(api_key_data.get("scope_role") or "full").lower()
        project_id_str = api_key_data.get("project_id")
        tenant_wide_full = scope_role == "full" and not project_id_str
        result = {
            **api_key_data,
            "auth_method": "api_key",
            "is_admin": False,
            "is_api_key_admin": tenant_wide_full,
            "api_key_scope_role": scope_role,
            "api_key_project_id": project_id_str,
        }
        bind_auth_context(result)
        return result

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
        is_admin: bool        (True only for JWT callers: explicit claim or DB platform-admin role)
        is_api_key_admin: bool (True if API key is tenant-wide and full-access; always False for JWT)

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
            "account_id": user_id,
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
        scope_role = str(api_key_data.get("scope_role") or "full").lower()
        project_id = api_key_data.get("project_id")
        tenant_wide_full = scope_role == "full" and not project_id
        return {
            **api_key_data,
            "auth_method": "api_key",
            "is_admin": False,
            "is_api_key_admin": tenant_wide_full,
            "account_id": api_key_data.get("account_id"),
            "api_key_scope_role": scope_role,
            "api_key_project_id": project_id,
        }

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


_API_KEY_SAFE_HTTP_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _reject_project_scoped_api_key_on_tenant_route(caller: dict[str, Any]) -> None:
    """Project-scoped keys may not use tenant-wide endpoints (no project in path)."""
    if not caller or caller.get("auth_method") != "api_key":
        return
    if caller.get("api_key_project_id"):
        raise HTTPException(
            status_code=403,
            detail=(
                "This API key is restricted to a single project; "
                "use endpoints scoped to that project or version."
            ),
        )


def _assert_api_key_project_matches(
    caller: dict[str, Any],
    project_id: str,
) -> None:
    if not caller or caller.get("auth_method") != "api_key":
        return
    scoped = caller.get("api_key_project_id")
    if scoped and str(scoped) != str(project_id):
        raise HTTPException(
            status_code=403,
            detail="API key is not authorized for this project.",
        )


def _assert_api_key_tenant_matches(
    caller: dict[str, Any],
    tenant_id: str,
) -> None:
    """Ensure an API key is only used against its own tenant (path alignment)."""
    if not caller or caller.get("auth_method") != "api_key":
        return
    api_key_tenant_id = caller.get("tenant_id")
    if api_key_tenant_id and str(api_key_tenant_id) != str(tenant_id):
        raise HTTPException(
            status_code=403,
            detail="API key is not authorized for this tenant.",
        )


def require_authenticated(
    request: Request,
    caller: Annotated[dict[str, Any], Depends(_resolve_caller)],
) -> dict[str, Any]:
    """
    FastAPI dependency: require a valid JWT or API key.

    Injects the caller identity dict into the handler.  Does **not** check
    admin status; use ``require_admin`` for that.
    """
    if caller and caller.get("auth_method") == "api_key":
        scope_role = caller.get("api_key_scope_role") or str(
            caller.get("scope_role") or "full"
        ).lower()
        if scope_role == "read_only" and request.method not in _API_KEY_SAFE_HTTP_METHODS:
            raise HTTPException(
                status_code=403,
                detail="Read-only API keys may only use GET, HEAD, or OPTIONS.",
            )
    bind_auth_context(caller)
    return caller


def require_admin(
    caller: Annotated[dict[str, Any], Depends(_resolve_caller)],
) -> dict[str, Any]:
    """
    FastAPI dependency: require a valid credential **and** admin privileges.

    Admin is determined by:
      1. ``is_admin: true`` in the JWT payload, OR
      2. The account holds ``access_level = 'administrator'`` in at least
         one active tenant (platform-wide admin proxy).

    API keys are explicitly rejected — they are tenant-scoped credentials
    and cannot be used for platform-wide admin endpoints.

    Raises:
        HTTPException 401 if unauthenticated.
        HTTPException 403 if authenticated but not an admin.
    """
    # API keys are tenant-scoped and cannot access platform admin endpoints.
    if caller.get("auth_method") == "api_key":
        raise HTTPException(
            status_code=403,
            detail="API keys cannot access platform admin endpoints.",
        )

    if caller.get("is_admin"):
        bind_auth_context(caller)
        return caller

    # For JWT callers without an explicit is_admin claim, check the DB.
    if caller.get("auth_method") == "jwt":
        user_id = caller.get("user_id")
        if user_id and _is_platform_admin(user_id):
            caller["is_admin"] = True
            bind_auth_context(caller)
            return caller

    raise HTTPException(
        status_code=403,
        detail="Admin privileges required.",
    )


# ---------------------------------------------------------------------------
# RBAC: roles and permissions
# ---------------------------------------------------------------------------

PermissionKey = str


_IMPLICIT_VIEWER_PERMISSIONS: set[PermissionKey] = {
    "project:read",
    "version:read",
    "schema:read",
}


def _is_tenant_member(account_id: str, tenant_id: str) -> bool:
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account ta
        JOIN objectified.tenant t ON t.id = ta.tenant_id
        WHERE ta.tenant_id = %s
          AND ta.account_id = %s
          AND ta.deleted_at IS NULL
          AND t.deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, account_id),
    )
    return bool(rows)


def _is_tenant_admin(account_id: str, tenant_id: str) -> bool:
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account ta
        JOIN objectified.tenant t ON t.id = ta.tenant_id
        WHERE ta.tenant_id = %s
          AND ta.account_id = %s
          AND ta.access_level = 'administrator'
          AND ta.deleted_at IS NULL
          AND t.deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, account_id),
    )
    return bool(rows)


def _has_rbac_permission(
    *,
    account_id: str,
    tenant_id: str,
    permission_key: PermissionKey,
    project_id: Optional[str] = None,
    version_id: Optional[str] = None,
) -> bool:
    """
    Return True when account has a role granting permission_key in the tenant.

    Role assignments may be:
      - tenant-wide (resource_type/resource_id NULL), or
      - scoped to a project, or
      - scoped to a version.

    When checking a version-scoped endpoint, a project-scoped assignment is
    considered applicable (e.g. project-level publisher).
    """
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.account_role ar
        JOIN objectified.role r ON r.id = ar.role_id
        JOIN objectified.role_permission rp ON rp.role_id = r.id
        JOIN objectified.permission p ON p.id = rp.permission_id
        WHERE ar.tenant_id = %s
          AND ar.account_id = %s
          AND p.key = %s
          AND ar.enabled = true
          AND r.enabled = true
          AND rp.enabled = true
          AND ar.deleted_at IS NULL
          AND r.deleted_at IS NULL
          AND rp.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND p.enabled = true
          AND (
            (ar.resource_type IS NULL AND ar.resource_id IS NULL)
            OR
            (%s::uuid IS NOT NULL AND ar.resource_type = 'project'::objectified.rbac_resource_type AND ar.resource_id = %s::uuid)
            OR
            (%s::uuid IS NOT NULL AND ar.resource_type = 'version'::objectified.rbac_resource_type AND ar.resource_id = %s::uuid)
          )
        LIMIT 1
        """,
        (
            tenant_id,
            account_id,
            permission_key,
            project_id,
            project_id,
            version_id,
            version_id,
        ),
    )
    return bool(rows)


def _require_permission_or_403(
    *,
    caller: Optional[dict[str, Any]],
    tenant_id: str,
    permission_key: PermissionKey,
    project_id: Optional[str] = None,
    version_id: Optional[str] = None,
) -> dict[str, Any]:
    if not caller:
        raise HTTPException(status_code=401, detail="Authentication required.")
    # Platform admins have unrestricted access.
    if caller.get("is_admin"):
        return caller
    # Tenant-wide full API keys are treated as full-access for their own tenant.
    if caller.get("is_api_key_admin"):
        _assert_api_key_tenant_matches(caller, tenant_id)
        return caller

    account_id = caller.get("account_id") or caller.get("user_id")
    if not account_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    # Tenant administrators have full permissions within the tenant.
    if _is_tenant_admin(account_id, tenant_id):
        return caller

    if not _is_tenant_member(account_id, tenant_id):
        raise HTTPException(status_code=403, detail="User does not have access to this tenant.")

    # Implicit baseline for members.
    if permission_key in _IMPLICIT_VIEWER_PERMISSIONS:
        return caller

    if _has_rbac_permission(
        account_id=account_id,
        tenant_id=tenant_id,
        permission_key=permission_key,
        project_id=project_id,
        version_id=version_id,
    ):
        return caller

    raise HTTPException(status_code=403, detail=f"Missing permission: {permission_key}")


def require_tenant_permission(permission_key: PermissionKey) -> Callable[..., dict[str, Any]]:
    def _dep(
        tenant_id: str,
        caller: Annotated[dict[str, Any], Depends(require_authenticated)],
    ) -> dict[str, Any]:
        _assert_api_key_tenant_matches(caller, tenant_id)
        _reject_project_scoped_api_key_on_tenant_route(caller)
        return _require_permission_or_403(
            caller=caller,
            tenant_id=tenant_id,
            permission_key=permission_key,
        )

    return _dep


def require_project_permission(permission_key: PermissionKey) -> Callable[..., dict[str, Any]]:
    def _dep(
        tenant_id: str,
        project_id: str,
        caller: Annotated[dict[str, Any], Depends(require_authenticated)],
    ) -> dict[str, Any]:
        _assert_api_key_tenant_matches(caller, tenant_id)
        _assert_api_key_project_matches(caller, project_id)
        return _require_permission_or_403(
            caller=caller,
            tenant_id=tenant_id,
            project_id=project_id,
            permission_key=permission_key,
        )

    return _dep


def _resolve_version_scope(version_id: str) -> dict[str, str]:
    row = db.execute_query(
        """
        SELECT p.tenant_id, v.project_id
        FROM objectified.version v
        JOIN objectified.project p ON p.id = v.project_id
        WHERE v.id = %s
          AND v.deleted_at IS NULL
          AND p.deleted_at IS NULL
        LIMIT 1
        """,
        (version_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Version not found: {version_id}")
    out = dict(row[0])
    return {"tenant_id": str(out["tenant_id"]), "project_id": str(out["project_id"])}


def require_version_permission(permission_key: PermissionKey) -> Callable[..., dict[str, Any]]:
    def _dep(
        version_id: str,
        caller: Annotated[dict[str, Any], Depends(require_authenticated)],
    ) -> dict[str, Any]:
        # JWT platform admins (is_admin=True) have unrestricted access across all tenants;
        # tenant alignment checks do not apply.  API keys always have is_admin=False and
        # proceed through scope resolution and alignment checks below.
        if caller and caller.get("is_admin"):
            return caller
        scope = _resolve_version_scope(version_id)
        _assert_api_key_tenant_matches(caller, scope["tenant_id"])
        _assert_api_key_project_matches(caller, scope["project_id"])
        return _require_permission_or_403(
            caller=caller,
            tenant_id=scope["tenant_id"],
            project_id=scope["project_id"],
            version_id=version_id,
            permission_key=permission_key,
        )

    return _dep


def require_tenant_admin(
    tenant_id: str,
    caller: Annotated[dict[str, Any], Depends(require_authenticated)],
) -> dict[str, Any]:
    """
    Require tenant administrator access for tenant-scoped configuration endpoints.

    Accepts platform-admin JWTs, tenant administrators, and tenant-wide ``full``
    API keys (caller.is_api_key_admin) whose tenant matches the path. Project-scoped
    API keys are always rejected.
    """
    if (
        caller
        and caller.get("auth_method") == "api_key"
        and caller.get("api_key_project_id")
    ):
        raise HTTPException(
            status_code=403,
            detail="Project-scoped API keys cannot perform tenant administration actions.",
        )
    if caller and caller.get("is_admin"):
        return caller
    # Tenant-wide full API keys may perform tenant administration actions for their tenant.
    if caller and caller.get("is_api_key_admin"):
        _assert_api_key_tenant_matches(caller, tenant_id)
        return caller
    account_id = caller.get("account_id") if caller else None
    if not account_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    if _is_tenant_admin(account_id, tenant_id):
        return caller
    raise HTTPException(status_code=403, detail="Tenant administrator privileges required.")

