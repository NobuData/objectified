"""REST routes for schema promotion workflow (GH-137)."""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated, require_project_permission, require_version_permission
from app.database import db
from app.routes.helpers import _assert_project_exists, _assert_tenant_exists, _not_found
from app.schema_webhook_service import build_schema_webhook_payload, try_emit_schema_webhook
from app.schemas.schema_promotions import (
    SchemaEnvironment,
    SchemaLiveVersionDetail,
    SchemaLiveVersionSchema,
    SchemaPromotionRequest,
    SchemaPromotionSchema,
    SchemaPromoteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Schema Promotions"])


_VERSION_COLUMNS_FOR_PROMOTION = (
    "id, project_id, creator_id, name, description, enabled, "
    "published, visibility, metadata, created_at, updated_at, deleted_at, "
    "published_at, code_generation_tag, source_version_id"
)


def _load_version_for_promotion(version_id: str) -> Optional[dict[str, Any]]:
    rows = db.execute_query(
        f"""
        SELECT {_VERSION_COLUMNS_FOR_PROMOTION}
        FROM objectified.version
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (version_id,),
    )
    if not rows:
        return None
    return dict(rows[0])


def _load_project_for_webhook(project_id: str) -> Optional[dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT id, tenant_id, name, slug
        FROM objectified.project
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (project_id,),
    )
    if not rows:
        return None
    return dict(rows[0])


@router.post(
    "/versions/{version_id}/promote",
    response_model=SchemaPromoteResponse,
    summary="Promote a version to an environment live target",
    description=(
        "Set the given (published) version as the live schema for an environment "
        "(e.g. dev -> staging -> prod). Emits `schema.promoted` webhooks."
    ),
)
def promote_version(
    version_id: str,
    environment: SchemaEnvironment = Query(..., description="Target deployment environment."),
    payload: SchemaPromotionRequest | None = None,
    _perm: Annotated[dict[str, Any], Depends(require_version_permission("schema:promote"))] = None,
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> SchemaPromoteResponse:
    version_row = _load_version_for_promotion(version_id)
    if not version_row:
        raise _not_found("Version", version_id)
    if not version_row.get("published"):
        raise HTTPException(status_code=400, detail="Only published versions can be promoted")

    project_id = str(version_row["project_id"])
    actor_id = (caller.get("account_id") or caller.get("user_id")) if caller else None

    env = environment.value

    # Capture previous live version id for promotion metadata/webhooks.
    live_old_rows = db.execute_query(
        """
        SELECT version_id
        FROM objectified.schema_live_version
        WHERE project_id = %s
          AND environment = %s::objectified.schema_environment
        LIMIT 1
        """,
        (project_id, env),
    )
    from_version_id = str(live_old_rows[0]["version_id"]) if live_old_rows and live_old_rows[0].get("version_id") else None

    payload = payload or SchemaPromotionRequest()
    meta = dict(payload.metadata or {})
    if payload.message:
        # Explicit message field takes precedence over metadata["message"].
        meta["message"] = payload.message
    meta_json = json.dumps(meta, default=str)

    promoted_sql = """
        INSERT INTO objectified.schema_live_version
            (project_id, environment, version_id, promoted_by, metadata)
        VALUES
            (%s, %s::objectified.schema_environment, %s, %s, %s::jsonb)
        ON CONFLICT (project_id, environment) DO UPDATE
        SET version_id = EXCLUDED.version_id,
            promoted_by = EXCLUDED.promoted_by,
            promoted_at = timezone('utc', clock_timestamp()),
            metadata = objectified.schema_live_version.metadata || EXCLUDED.metadata
        RETURNING
            project_id,
            environment,
            version_id,
            promoted_by,
            promoted_at,
            metadata
    """

    live_row = db.execute_mutation(
        promoted_sql,
        (project_id, env, version_id, actor_id, meta_json),
    )
    if not live_row:
        raise HTTPException(status_code=500, detail="Failed to update live schema version")

    promotion_sql = """
        INSERT INTO objectified.schema_promotion
            (project_id, environment, from_version_id, to_version_id, promoted_by, metadata)
        VALUES
            (%s, %s::objectified.schema_environment, %s, %s, %s, %s::jsonb)
        RETURNING
            id,
            project_id,
            environment,
            from_version_id,
            to_version_id,
            promoted_by,
            created_at,
            metadata
    """
    promotion_row = db.execute_mutation(
        promotion_sql,
        (
            project_id,
            env,
            from_version_id,
            version_id,
            actor_id,
            meta_json,
        ),
    )
    if not promotion_row:
        raise HTTPException(status_code=500, detail="Failed to record schema promotion")

    project_for_hook = _load_project_for_webhook(project_id)
    logger.info(
        "Schema version %s promoted to %s for project %s (actor=%s)",
        version_id,
        env,
        project_id,
        actor_id,
    )
    if project_for_hook:
        # Build webhook payload using the promoted version.
        hook_payload = build_schema_webhook_payload(
            tenant_id=str(project_for_hook["tenant_id"]),
            event_type="schema.promoted",
            project_row=project_for_hook,
            version_row=version_row,
            actor_user_id=actor_id,
            snapshot_row=None,
            extra={
                "environment": env,
                "from_version_id": from_version_id,
                "to_version_id": version_id,
            },
        )
        try_emit_schema_webhook(
            project_id=project_id,
            event_type="schema.promoted",
            payload=hook_payload,
        )

    live_version = SchemaLiveVersionSchema(
        project_id=str(live_row["project_id"]),
        environment=SchemaEnvironment(live_row["environment"]),
        version_id=str(live_row["version_id"]) if live_row.get("version_id") else None,
        promoted_by=str(live_row["promoted_by"]) if live_row.get("promoted_by") else None,
        promoted_at=live_row.get("promoted_at"),
        metadata=live_row.get("metadata") or {},
    )
    promotion = SchemaPromotionSchema(
        id=str(promotion_row["id"]),
        project_id=str(promotion_row["project_id"]),
        environment=SchemaEnvironment(promotion_row["environment"]),
        from_version_id=str(promotion_row["from_version_id"]) if promotion_row.get("from_version_id") else None,
        to_version_id=str(promotion_row["to_version_id"]) if promotion_row.get("to_version_id") else None,
        promoted_by=str(promotion_row["promoted_by"]) if promotion_row.get("promoted_by") else None,
        created_at=promotion_row["created_at"],
        metadata=promotion_row.get("metadata") or {},
    )
    return SchemaPromoteResponse(promotion=promotion, live_version=live_version)


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/environments/{environment}/live-version",
    response_model=SchemaLiveVersionDetail,
    summary="Get the live schema version for a project environment",
    description="Return the currently promoted live version for a project environment.",
)
def get_live_version_for_project_environment(
    tenant_id: str,
    project_id: str,
    environment: SchemaEnvironment,
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("schema:read"))] = None,
) -> SchemaLiveVersionDetail:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    live_rows = db.execute_query(
        """
        SELECT
            lv.project_id,
            lv.environment,
            lv.version_id,
            lv.promoted_by,
            lv.promoted_at,
            lv.metadata,
            v.id AS v_id,
            v.project_id AS v_project_id,
            v.creator_id,
            v.name AS v_name,
            v.description AS v_description,
            v.enabled,
            v.published,
            v.visibility,
            v.metadata AS v_metadata,
            v.created_at AS v_created_at,
            v.updated_at AS v_updated_at,
            v.deleted_at AS v_deleted_at,
            v.published_at AS v_published_at,
            v.change_log,
            v.code_generation_tag,
            v.source_version_id
        FROM objectified.schema_live_version lv
        LEFT JOIN objectified.version v
            ON v.id = lv.version_id
           AND v.deleted_at IS NULL
        WHERE lv.project_id = %s
          AND lv.environment = %s::objectified.schema_environment
        LIMIT 1
        """,
        (project_id, environment.value),
    )

    if not live_rows:
        # The project env exists (for RBAC), but nothing has been promoted yet.
        # Return a consistent detail payload with null version.
        live_version = SchemaLiveVersionSchema(
            project_id=project_id,
            environment=environment,
            version_id=None,
            promoted_by=None,
            promoted_at=None,
            metadata={},
        )
        return SchemaLiveVersionDetail(live_version=live_version, version=None)

    row = dict(live_rows[0])
    live_version = SchemaLiveVersionSchema(
        project_id=str(row["project_id"]),
        environment=SchemaEnvironment(row["environment"]),
        version_id=str(row["version_id"]) if row.get("version_id") else None,
        promoted_by=str(row["promoted_by"]) if row.get("promoted_by") else None,
        promoted_at=row.get("promoted_at"),
        metadata=row.get("metadata") or {},
    )

    if not row.get("v_id"):
        return SchemaLiveVersionDetail(live_version=live_version, version=None)

    # Map joined row into VersionSchema keys.
    version = {
        "id": str(row["v_id"]),
        "project_id": str(row["v_project_id"]),
        "creator_id": str(row["creator_id"]),
        "name": row["v_name"],
        "description": row["v_description"],
        "enabled": bool(row["enabled"]),
        "published": bool(row["published"]),
        "visibility": row.get("visibility"),
        "metadata": row.get("v_metadata") or {},
        "created_at": row["v_created_at"],
        "updated_at": row.get("v_updated_at"),
        "deleted_at": row.get("v_deleted_at"),
        "published_at": row.get("v_published_at"),
        "change_log": row.get("change_log"),
        "code_generation_tag": row.get("code_generation_tag"),
        "source_version_id": str(row["source_version_id"])
        if row.get("source_version_id")
        else None,
    }
    return SchemaLiveVersionDetail(live_version=live_version, version=version)  # type: ignore[arg-type]


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/promotions",
    response_model=list[SchemaPromotionSchema],
    summary="List schema promotions (metadata)",
    description="Return schema promotion records for a project, optionally filtered by environment.",
)
def list_schema_promotions(
    tenant_id: str,
    project_id: str,
    environment: Optional[SchemaEnvironment] = Query(
        None, description="Optional environment filter."
    ),
    limit: int = Query(50, ge=1, le=500, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    _perm: Annotated[dict[str, Any], Depends(require_project_permission("schema:read"))] = None,
) -> list[SchemaPromotionSchema]:
    _assert_tenant_exists(tenant_id)
    _assert_project_exists(project_id, tenant_id)
    params: list[Any] = [project_id]
    env_clause = ""
    if environment:
        env_clause = "AND sp.environment = %s::objectified.schema_environment"
        params.append(environment.value)

    rows = db.execute_query(
        f"""
        SELECT
            sp.id,
            sp.project_id,
            sp.environment,
            sp.from_version_id,
            sp.to_version_id,
            sp.promoted_by,
            sp.created_at,
            sp.metadata
        FROM objectified.schema_promotion sp
        WHERE sp.project_id = %s
          {env_clause}
        ORDER BY sp.created_at DESC
        LIMIT %s OFFSET %s
        """,
        tuple(params + [limit, offset]),
    )

    result: list[SchemaPromotionSchema] = []
    for r in rows:
        row = dict(r)
        result.append(
            SchemaPromotionSchema(
                id=str(row["id"]),
                project_id=str(row["project_id"]),
                environment=SchemaEnvironment(row["environment"]),
                from_version_id=str(row["from_version_id"]) if row.get("from_version_id") else None,
                to_version_id=str(row["to_version_id"]) if row.get("to_version_id") else None,
                promoted_by=str(row["promoted_by"]) if row.get("promoted_by") else None,
                created_at=row["created_at"],
                metadata=row.get("metadata") or {},
            )
        )

    return result

