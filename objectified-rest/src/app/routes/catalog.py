"""REST routes for /v1/catalog — schema discovery API (GH-136).

Public or authenticated catalog API to list projects, versions, and
published schemas (by tenant or org) for discovery, Backstage catalog sync,
or API gateways.
"""

import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_authenticated
from app.database import db
from app.routes.helpers import _not_found
from app.schemas.catalog import (
    CatalogClassSummary,
    CatalogProjectEntry,
    CatalogProjectSummary,
    CatalogTenantEntry,
    CatalogTenantSummary,
    CatalogVersionSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Catalog"])

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_TENANT_CATALOG_COLUMNS = "id, name, slug, description"
_PROJECT_CATALOG_COLUMNS = "id, name, slug, description, metadata"
_VERSION_CATALOG_COLUMNS = (
    "id, name, description, published, published_at, visibility, "
    "code_generation_tag, metadata"
)
_CLASS_CATALOG_COLUMNS = "id, name, description, schema"


def _load_classes_for_versions(version_ids: List[str]) -> dict[str, List[dict[str, Any]]]:
    """Load classes grouped by version_id for a batch of version IDs."""
    if not version_ids:
        return {}
    placeholders = ", ".join(["%s"] * len(version_ids))
    rows = db.execute_query(
        f"""
        SELECT {_CLASS_CATALOG_COLUMNS}, version_id
        FROM objectified.class
        WHERE version_id IN ({placeholders})
          AND deleted_at IS NULL
        ORDER BY name ASC
        """,
        tuple(version_ids),
    )
    by_version: dict[str, List[dict[str, Any]]] = {}
    for row in rows:
        r = dict(row)
        vid = str(r.pop("version_id", ""))
        by_version.setdefault(vid, []).append(r)
    return by_version


def _build_version_summaries(
    version_rows: list[dict[str, Any]],
    classes_by_version: dict[str, List[dict[str, Any]]],
) -> List[CatalogVersionSummary]:
    """Build CatalogVersionSummary list with nested classes."""
    result: List[CatalogVersionSummary] = []
    for vr in version_rows:
        v = dict(vr)
        vid = str(v["id"])
        cls_rows = classes_by_version.get(vid, [])
        classes = []
        for cr in cls_rows:
            c = dict(cr)
            if "schema" in c and "schema_" not in c:
                c["schema_"] = c.pop("schema", None)
            classes.append(CatalogClassSummary(**c))
        v["classes"] = classes
        result.append(CatalogVersionSummary(**v))
    return result


# ---------------------------------------------------------------------------
# Authenticated endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/catalog/tenants",
    response_model=List[CatalogTenantSummary],
    summary="List tenants with published schemas",
    description=(
        "Return tenants that have at least one project with a published version. "
        "Useful for discovering which organisations expose schemas. "
        "Supports pagination via limit and offset."
    ),
)
def list_catalog_tenants(
    limit: int = Query(100, ge=1, le=500, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[CatalogTenantSummary]:
    """List tenants that have published content."""
    rows = db.execute_query(
        f"""
        SELECT DISTINCT t.{_TENANT_CATALOG_COLUMNS.replace(', ', ', t.')}
        FROM objectified.tenant t
        JOIN objectified.project p ON p.tenant_id = t.id AND p.deleted_at IS NULL
        JOIN objectified.version v ON v.project_id = p.id AND v.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
          AND t.enabled = true
          AND v.published = true
        ORDER BY t.name ASC
        LIMIT %s OFFSET %s
        """,
        (limit, offset),
    )
    return [CatalogTenantSummary(**dict(r)) for r in rows]


@router.get(
    "/catalog/tenants/{tenant_id}",
    response_model=CatalogTenantEntry,
    summary="Get full catalog for a tenant",
    description=(
        "Return the full catalog for a tenant: all projects with published versions "
        "and their classes. Filter by visibility (public/private) if needed."
    ),
)
def get_tenant_catalog(
    tenant_id: str,
    visibility: Optional[str] = Query(
        None,
        description="Filter versions by visibility: 'public' or 'private'. Omit for all.",
    ),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> CatalogTenantEntry:
    """Return full catalog for a single tenant."""
    # Verify tenant exists
    tenant_rows = db.execute_query(
        f"SELECT {_TENANT_CATALOG_COLUMNS} FROM objectified.tenant "
        "WHERE id = %s AND deleted_at IS NULL AND enabled = true",
        (tenant_id,),
    )
    if not tenant_rows:
        raise _not_found("Tenant", tenant_id)
    tenant = CatalogTenantSummary(**dict(tenant_rows[0]))

    # Load projects for tenant
    project_rows = db.execute_query(
        f"SELECT {_PROJECT_CATALOG_COLUMNS} FROM objectified.project "
        "WHERE tenant_id = %s AND deleted_at IS NULL AND enabled = true "
        "ORDER BY name ASC",
        (tenant_id,),
    )
    if not project_rows:
        return CatalogTenantEntry(tenant=tenant, projects=[])

    project_ids = [str(dict(r)["id"]) for r in project_rows]

    # Load published versions for these projects
    visibility_clause = ""
    params: list[Any] = list(project_ids)
    placeholders = ", ".join(["%s"] * len(project_ids))

    if visibility and visibility.lower() in ("public", "private"):
        visibility_clause = "AND LOWER(v.visibility) = LOWER(%s)"
        params.append(visibility)

    version_rows = db.execute_query(
        f"""
        SELECT {_VERSION_CATALOG_COLUMNS}, v.project_id
        FROM objectified.version v
        WHERE v.project_id IN ({placeholders})
          AND v.deleted_at IS NULL
          AND v.published = true
          {visibility_clause}
        ORDER BY v.published_at DESC NULLS LAST, v.name ASC
        """,
        tuple(params),
    )

    # Group versions by project
    versions_by_project: dict[str, list[dict[str, Any]]] = {}
    version_ids: list[str] = []
    for vr in version_rows:
        v = dict(vr)
        pid = str(v.pop("project_id", ""))
        versions_by_project.setdefault(pid, []).append(v)
        version_ids.append(str(v["id"]))

    # Load classes for all versions
    classes_by_version = _load_classes_for_versions(version_ids)

    # Build response
    projects: List[CatalogProjectEntry] = []
    for pr in project_rows:
        p = dict(pr)
        pid = str(p["id"])
        ver_rows = versions_by_project.get(pid, [])
        if not ver_rows:
            continue  # Skip projects with no published versions
        ver_summaries = _build_version_summaries(ver_rows, classes_by_version)
        projects.append(
            CatalogProjectEntry(
                project=CatalogProjectSummary(**p),
                versions=ver_summaries,
            )
        )

    return CatalogTenantEntry(tenant=tenant, projects=projects)


@router.get(
    "/catalog/projects/{project_id}/versions",
    response_model=List[CatalogVersionSummary],
    summary="List published versions for a project",
    description=(
        "Return published versions and their classes for a single project. "
        "Supports pagination via limit and offset."
    ),
)
def list_catalog_project_versions(
    project_id: str,
    limit: int = Query(100, ge=1, le=500, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    caller: Annotated[Optional[dict[str, Any]], Depends(require_authenticated)] = None,
) -> List[CatalogVersionSummary]:
    """List published versions for a project with classes."""
    # Verify project exists
    project_check = db.execute_query(
        "SELECT id FROM objectified.project WHERE id = %s AND deleted_at IS NULL",
        (project_id,),
    )
    if not project_check:
        raise _not_found("Project", project_id)

    version_rows = db.execute_query(
        f"""
        SELECT {_VERSION_CATALOG_COLUMNS}
        FROM objectified.version
        WHERE project_id = %s
          AND deleted_at IS NULL
          AND published = true
        ORDER BY published_at DESC NULLS LAST, name ASC
        LIMIT %s OFFSET %s
        """,
        (project_id, limit, offset),
    )
    if not version_rows:
        return []

    version_ids = [str(dict(r)["id"]) for r in version_rows]
    classes_by_version = _load_classes_for_versions(version_ids)
    return _build_version_summaries(
        [dict(r) for r in version_rows], classes_by_version
    )


# ---------------------------------------------------------------------------
# Public (unauthenticated) endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/catalog/public",
    response_model=List[CatalogTenantEntry],
    summary="Public schema catalog",
    description=(
        "Unauthenticated endpoint that returns only published versions with "
        "visibility='public', grouped by tenant and project. Intended for "
        "Backstage catalog sync, API gateways, and external discovery."
    ),
)
def list_public_catalog(
    limit: int = Query(100, ge=1, le=500, description="Max tenant entries to return"),
    offset: int = Query(0, ge=0, description="Number of tenant entries to skip"),
) -> List[CatalogTenantEntry]:
    """Return the public catalog — only public-visibility published versions."""
    # Load tenants that have public published versions
    tenant_rows = db.execute_query(
        f"""
        SELECT DISTINCT t.{_TENANT_CATALOG_COLUMNS.replace(', ', ', t.')}
        FROM objectified.tenant t
        JOIN objectified.project p ON p.tenant_id = t.id AND p.deleted_at IS NULL
        JOIN objectified.version v ON v.project_id = p.id AND v.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
          AND t.enabled = true
          AND p.enabled = true
          AND v.published = true
          AND LOWER(v.visibility) = LOWER('public')
        ORDER BY t.name ASC
        LIMIT %s OFFSET %s
        """,
        (limit, offset),
    )
    if not tenant_rows:
        return []

    tenant_ids = [str(dict(r)["id"]) for r in tenant_rows]
    t_placeholders = ", ".join(["%s"] * len(tenant_ids))

    # Load projects under these tenants with public published versions
    project_rows = db.execute_query(
        f"""
        SELECT DISTINCT p.{_PROJECT_CATALOG_COLUMNS.replace(', ', ', p.')}, p.tenant_id
        FROM objectified.project p
        JOIN objectified.version v ON v.project_id = p.id AND v.deleted_at IS NULL
        WHERE p.tenant_id IN ({t_placeholders})
          AND p.deleted_at IS NULL
          AND p.enabled = true
          AND v.published = true
          AND LOWER(v.visibility) = LOWER('public')
        ORDER BY p.name ASC
        """,
        tuple(tenant_ids),
    )

    project_ids = [str(dict(r)["id"]) for r in project_rows]
    projects_by_tenant: dict[str, list[dict[str, Any]]] = {}
    for pr in project_rows:
        p = dict(pr)
        tid = str(p.pop("tenant_id", ""))
        projects_by_tenant.setdefault(tid, []).append(p)

    if not project_ids:
        return [
            CatalogTenantEntry(tenant=CatalogTenantSummary(**dict(tr)), projects=[])
            for tr in tenant_rows
        ]

    # Load public published versions
    p_placeholders = ", ".join(["%s"] * len(project_ids))
    version_rows = db.execute_query(
        f"""
        SELECT {_VERSION_CATALOG_COLUMNS}, v.project_id
        FROM objectified.version v
        WHERE v.project_id IN ({p_placeholders})
          AND v.deleted_at IS NULL
          AND v.published = true
          AND LOWER(v.visibility) = LOWER('public')
        ORDER BY v.published_at DESC NULLS LAST, v.name ASC
        """,
        tuple(project_ids),
    )

    versions_by_project: dict[str, list[dict[str, Any]]] = {}
    version_ids: list[str] = []
    for vr in version_rows:
        v = dict(vr)
        pid = str(v.pop("project_id", ""))
        versions_by_project.setdefault(pid, []).append(v)
        version_ids.append(str(v["id"]))

    classes_by_version = _load_classes_for_versions(version_ids)

    # Build response
    result: List[CatalogTenantEntry] = []
    for tr in tenant_rows:
        t = dict(tr)
        tid = str(t["id"])
        t_projects = projects_by_tenant.get(tid, [])
        project_entries: List[CatalogProjectEntry] = []
        for p in t_projects:
            pid = str(p["id"])
            ver_rows = versions_by_project.get(pid, [])
            if not ver_rows:
                continue
            ver_summaries = _build_version_summaries(ver_rows, classes_by_version)
            project_entries.append(
                CatalogProjectEntry(
                    project=CatalogProjectSummary(**p),
                    versions=ver_summaries,
                )
            )
        result.append(
            CatalogTenantEntry(
                tenant=CatalogTenantSummary(**t),
                projects=project_entries,
            )
        )

    return result

