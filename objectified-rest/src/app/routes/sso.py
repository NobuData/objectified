"""REST routes for /v1/tenants/{tenant_id}/sso — tenant SSO provider configuration."""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_admin, require_authenticated, _is_platform_admin
from app.database import db
from app.routes.helpers import _assert_tenant_exists, _not_found
from app.schemas.sso import (
    SsoProviderCreate,
    SsoProviderSchema,
    SsoProviderType,
    SsoProviderUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["SSO"])


def _validate_sso_payload(provider_type: SsoProviderType, oidc_discovery: Any, saml_metadata_xml: Any) -> None:
    if provider_type == SsoProviderType.oidc:
        if oidc_discovery is None:
            raise HTTPException(
                status_code=422,
                detail="OIDC provider requires oidc_discovery JSON.",
            )
        if saml_metadata_xml is not None:
            raise HTTPException(
                status_code=422,
                detail="OIDC provider must not include saml_metadata_xml.",
            )
    if provider_type == SsoProviderType.saml:
        if saml_metadata_xml is None or not str(saml_metadata_xml).strip():
            raise HTTPException(
                status_code=422,
                detail="SAML provider requires saml_metadata_xml (non-empty).",
            )
        if oidc_discovery is not None:
            raise HTTPException(
                status_code=422,
                detail="SAML provider must not include oidc_discovery.",
            )


def _assert_admin_or_member(
    tenant_id: str,
    caller: dict[str, Any],
) -> None:
    if caller.get("is_admin"):
        return
    user_id = caller.get("user_id")
    if not user_id:
        raise HTTPException(status_code=403, detail="This endpoint requires JWT authentication.")
    # Apply the same platform-admin DB fallback used by require_admin so that
    # a platform admin without an explicit is_admin JWT claim is still permitted.
    if caller.get("auth_method") == "jwt" and _is_platform_admin(user_id):
        return
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.tenant_account
        WHERE tenant_id = %s
          AND account_id = %s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, user_id),
    )
    if not rows:
        raise HTTPException(status_code=403, detail="User does not have access to this tenant.")


@router.get(
    "/tenants/{tenant_id}/sso/providers",
    response_model=List[SsoProviderSchema],
    summary="List SSO providers for a tenant",
    description=(
        "List configured SSO providers (OIDC/SAML) for a tenant. "
        "Requires authentication and tenant membership; platform admins may access any tenant."
    ),
    responses={
        403: {"description": "Authenticated but not a tenant member or platform admin"},
        404: {"description": "Tenant not found"},
    },
)
def list_sso_providers(
    tenant_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted providers"),
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> List[SsoProviderSchema]:
    _assert_tenant_exists(tenant_id)
    _assert_admin_or_member(tenant_id, caller)
    where = "" if include_deleted else "AND deleted_at IS NULL"
    rows = db.execute_query(
        f"""
        SELECT id, tenant_id, provider_type, name, enabled,
               oidc_discovery, saml_metadata_xml, metadata,
               created_at, updated_at, deleted_at
        FROM objectified.sso_provider
        WHERE tenant_id = %s
          {where}
        ORDER BY created_at ASC
        """,
        (tenant_id,),
    )
    return [SsoProviderSchema(**dict(r)) for r in rows]


@router.post(
    "/tenants/{tenant_id}/sso/providers",
    response_model=SsoProviderSchema,
    status_code=201,
    summary="Create an SSO provider for a tenant",
    description="Create an OIDC or SAML SSO provider configuration for a tenant. **Admin only.**",
    dependencies=[Depends(require_admin)],
    responses={
        400: {"description": "tenant_id in payload does not match path"},
        403: {"description": "Admin privileges required"},
        404: {"description": "Tenant not found"},
        409: {"description": "SSO provider name already exists for this tenant and type"},
    },
)
def create_sso_provider(tenant_id: str, payload: SsoProviderCreate) -> SsoProviderSchema:
    _assert_tenant_exists(tenant_id)
    if payload.tenant_id and payload.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id in payload must match path.")

    # Normalize name up-front so the uniqueness check and the insert use the same value.
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="SSO provider name must not be empty.")

    _validate_sso_payload(payload.provider_type, payload.oidc_discovery, payload.saml_metadata_xml)

    existing = db.execute_query(
        """
        SELECT id
        FROM objectified.sso_provider
        WHERE tenant_id = %s
          AND provider_type = %s
          AND LOWER(name) = LOWER(%s)
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, payload.provider_type.value, name),
    )
    if existing:
        raise HTTPException(status_code=409, detail="SSO provider name already exists for this tenant and type.")

    row = db.execute_mutation(
        """
        INSERT INTO objectified.sso_provider
            (tenant_id, provider_type, name, enabled, oidc_discovery, saml_metadata_xml, metadata)
        VALUES
            (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb)
        RETURNING id, tenant_id, provider_type, name, enabled,
                  oidc_discovery, saml_metadata_xml, metadata,
                  created_at, updated_at, deleted_at
        """,
        (
            tenant_id,
            payload.provider_type.value,
            name,
            payload.enabled,
            json.dumps(payload.oidc_discovery) if payload.oidc_discovery is not None else None,
            payload.saml_metadata_xml,
            json.dumps(payload.metadata),
        ),
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create SSO provider.")
    logger.info("create_sso_provider: tenant=%s type=%s id=%s", tenant_id, payload.provider_type.value, row["id"])
    return SsoProviderSchema(**dict(row))


@router.get(
    "/tenants/{tenant_id}/sso/providers/{provider_id}",
    response_model=SsoProviderSchema,
    summary="Get SSO provider by ID",
    description="Get a single SSO provider configuration by ID for a tenant.",
    responses={
        403: {"description": "Authenticated but not a tenant member or platform admin"},
        404: {"description": "Tenant or SSO provider not found"},
    },
)
def get_sso_provider(
    tenant_id: str,
    provider_id: str,
    include_deleted: bool = Query(False, description="Include soft-deleted provider"),
    caller: Annotated[dict[str, Any], Depends(require_authenticated)] = None,
) -> SsoProviderSchema:
    _assert_tenant_exists(tenant_id)
    _assert_admin_or_member(tenant_id, caller)
    where = "" if include_deleted else "AND deleted_at IS NULL"
    rows = db.execute_query(
        f"""
        SELECT id, tenant_id, provider_type, name, enabled,
               oidc_discovery, saml_metadata_xml, metadata,
               created_at, updated_at, deleted_at
        FROM objectified.sso_provider
        WHERE tenant_id = %s
          AND id = %s
          {where}
        LIMIT 1
        """,
        (tenant_id, provider_id),
    )
    if not rows:
        raise _not_found("SSO provider", provider_id)
    return SsoProviderSchema(**dict(rows[0]))


@router.put(
    "/tenants/{tenant_id}/sso/providers/{provider_id}",
    response_model=SsoProviderSchema,
    summary="Update an SSO provider",
    description="Update an existing SSO provider configuration. **Admin only.**",
    dependencies=[Depends(require_admin)],
    responses={
        400: {"description": "No fields to update"},
        403: {"description": "Admin privileges required"},
        404: {"description": "Tenant or SSO provider not found"},
        409: {"description": "SSO provider name already exists for this tenant and type"},
    },
)
def update_sso_provider(tenant_id: str, provider_id: str, payload: SsoProviderUpdate) -> SsoProviderSchema:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id, provider_type
        FROM objectified.sso_provider
        WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, provider_id),
    )
    if not rows:
        raise _not_found("SSO provider", provider_id)
    provider_type = SsoProviderType(rows[0]["provider_type"])

    if payload.oidc_discovery is not None or payload.saml_metadata_xml is not None:
        _validate_sso_payload(provider_type, payload.oidc_discovery, payload.saml_metadata_xml)

    updates: list[str] = []
    params: list[Any] = []

    if payload.name is not None:
        normalized_name = payload.name.strip()
        if not normalized_name:
            raise HTTPException(status_code=422, detail="SSO provider name must not be empty.")
        # Guard against renaming to an existing name for the same tenant+type.
        dup = db.execute_query(
            """
            SELECT id
            FROM objectified.sso_provider
            WHERE tenant_id = %s
              AND provider_type = %s
              AND LOWER(name) = LOWER(%s)
              AND id != %s
              AND deleted_at IS NULL
            LIMIT 1
            """,
            (tenant_id, provider_type.value, normalized_name, provider_id),
        )
        if dup:
            raise HTTPException(status_code=409, detail="SSO provider name already exists for this tenant and type.")
        updates.append("name = %s")
        params.append(normalized_name)
    if payload.enabled is not None:
        updates.append("enabled = %s")
        params.append(payload.enabled)
    if payload.oidc_discovery is not None:
        updates.append("oidc_discovery = %s::jsonb")
        params.append(json.dumps(payload.oidc_discovery))
    if payload.saml_metadata_xml is not None:
        updates.append("saml_metadata_xml = %s")
        params.append(payload.saml_metadata_xml)
    if payload.metadata is not None:
        updates.append("metadata = %s::jsonb")
        params.append(json.dumps(payload.metadata))

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    params.extend([tenant_id, provider_id])
    row = db.execute_mutation(
        f"""
        UPDATE objectified.sso_provider
        SET {", ".join(updates)}
        WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL
        RETURNING id, tenant_id, provider_type, name, enabled,
                  oidc_discovery, saml_metadata_xml, metadata,
                  created_at, updated_at, deleted_at
        """,
        tuple(params),
    )
    if not row:
        raise _not_found("SSO provider", provider_id)
    logger.info("update_sso_provider: tenant=%s id=%s", tenant_id, provider_id)
    return SsoProviderSchema(**dict(row))


@router.delete(
    "/tenants/{tenant_id}/sso/providers/{provider_id}",
    status_code=204,
    summary="Delete (soft-delete) an SSO provider",
    description="Soft-delete an SSO provider configuration. **Admin only.**",
    dependencies=[Depends(require_admin)],
    responses={
        403: {"description": "Admin privileges required"},
        404: {"description": "Tenant or SSO provider not found"},
    },
)
def delete_sso_provider(tenant_id: str, provider_id: str) -> None:
    _assert_tenant_exists(tenant_id)
    rows = db.execute_query(
        """
        SELECT id
        FROM objectified.sso_provider
        WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id, provider_id),
    )
    if not rows:
        raise _not_found("SSO provider", provider_id)
    db.execute_mutation(
        """
        UPDATE objectified.sso_provider
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s AND id = %s AND deleted_at IS NULL
        """,
        (tenant_id, provider_id),
        returning=False,
    )
    logger.info("delete_sso_provider: tenant=%s id=%s", tenant_id, provider_id)
