"""Optional tenant-level quotas (projects and versions per project)."""

from __future__ import annotations

from fastapi import HTTPException

from app.database import db


def ensure_project_quota_allows_create(tenant_id: str) -> None:
    """Raise HTTP 403 when the tenant has reached ``max_projects`` (if set)."""
    rows = db.execute_query(
        """
        SELECT max_projects
        FROM objectified.tenant
        WHERE id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id,),
    )
    if not rows:
        return
    max_projects = rows[0].get("max_projects")
    if max_projects is None:
        return
    cnt_rows = db.execute_query(
        """
        SELECT COUNT(*)::int AS c
        FROM objectified.project
        WHERE tenant_id = %s AND deleted_at IS NULL
        """,
        (tenant_id,),
    )
    if not cnt_rows:
        return
    current = int(cnt_rows[0]["c"])
    limit_n = int(max_projects)
    if current >= limit_n:
        raise HTTPException(
            status_code=403,
            detail=(
                "This tenant has reached its maximum number of projects "
                f"({limit_n}). Raise the quota or remove a project to continue."
            ),
        )


def ensure_version_quota_allows_create(tenant_id: str, project_id: str) -> None:
    """Raise HTTP 403 when the project has reached ``max_versions_per_project`` for its tenant."""
    rows = db.execute_query(
        """
        SELECT t.max_versions_per_project
        FROM objectified.tenant t
        WHERE t.id = %s AND t.deleted_at IS NULL
        LIMIT 1
        """,
        (tenant_id,),
    )
    if not rows:
        return
    max_v = rows[0].get("max_versions_per_project")
    if max_v is None:
        return
    cnt_rows = db.execute_query(
        """
        SELECT COUNT(*)::int AS c
        FROM objectified.version v
        INNER JOIN objectified.project p ON p.id = v.project_id AND p.deleted_at IS NULL
        WHERE v.project_id = %s AND v.deleted_at IS NULL
        """,
        (project_id,),
    )
    if not cnt_rows:
        return
    current = int(cnt_rows[0]["c"])
    limit_n = int(max_v)
    if current >= limit_n:
        raise HTTPException(
            status_code=403,
            detail=(
                "This project has reached the maximum number of versions allowed "
                f"for its tenant ({limit_n}). Raise the quota or remove a version to continue."
            ),
        )
