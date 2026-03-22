"""
v1 API aggregator.

Routes are split across focused modules:
  - app.routes.auth              → /v1/auth/login
  - app.routes.users             → /v1/users, /v1/me
  - app.routes.dashboard_audit   → /v1/me/dashboard/page-visits (optional audit, GitHub #188)
  - app.routes.tenants           → /v1/tenants, /v1/tenants/{id}/members,
                                   /v1/tenants/{id}/administrators,
                                   /v1/tenants/{id}/administrator-audit-events,
                                   /v1/tenants/{id}/primary-administrator
  - app.routes.api_keys          → /v1/tenants/{id}/api-keys
  - app.routes.projects          → /v1/tenants/{id}/projects
  - app.routes.properties        → /v1/tenants/{tenant_id}/projects/{project_id}/properties
  - app.routes.versions          → /v1/tenants/{tenant_id}/projects/{project_id}/versions, /v1/versions/{id}
  - app.routes.classes           → /v1/versions/{version_id}/classes,
                                   /v1/versions/{version_id}/classes/{class_id}/with-properties-tags
  - app.routes.class_properties  → /v1/versions/{version_id}/classes/{class_id}/properties
  - app.routes.export            → /v1/versions/{version_id}/export/openapi,
                                   /v1/versions/{version_id}/export/jsonschema,
                                   /v1/versions/{version_id}/export/validation-rules
  - app.routes.import_routes     → /v1/versions/{version_id}/import/openapi,
                                   /v1/versions/{version_id}/import/jsonschema,
                                   /v1/versions/{version_id}/import/fetch-url
  - app.routes.version_commits   → /v1/versions/{version_id}/commit,
                                   /v1/versions/{version_id}/push,
                                   /v1/versions/{version_id}/pull,
                                   /v1/versions/{version_id}/merge
  - app.routes.schema_webhooks   → /v1/tenants/{id}/projects/{id}/schema-webhooks,
                                   schema-webhook-deliveries
  - app.routes.validate          → /v1/validate/json-schema,
                                   /v1/validate/openapi-document
  - app.routes.catalog           → /v1/catalog/tenants,
                                   /v1/catalog/tenants/{id},
                                   /v1/catalog/projects/{id}/versions,
                                   /v1/catalog/public

This module assembles them under the /v1 prefix and re-exports the password
helpers so that existing imports (e.g. in tests) continue to work.
"""

from fastapi import APIRouter

from app.routes.api_keys import router as _api_keys_router
from app.routes.auth import router as _auth_router
from app.routes.catalog import router as _catalog_router
from app.routes.class_properties import router as _class_properties_router
from app.routes.classes import router as _classes_router
from app.routes.dashboard_audit import router as _dashboard_audit_router
from app.routes.export import router as _export_router
from app.routes.import_routes import router as _import_router
from app.routes.projects import router as _projects_router
from app.routes.properties import router as _properties_router
from app.routes.rbac import router as _rbac_router
from app.routes.schema_webhooks import router as _schema_webhooks_router
from app.routes.schema_promotions import router as _schema_promotions_router
from app.routes.sso import router as _sso_router
from app.routes.tenants import router as _tenants_router
from app.routes.users import _hash_password, _verify_password  # noqa: F401 — re-export
from app.routes.users import router as _users_router
from app.routes.validate import router as _validate_router
from app.routes.version_commits import router as _version_commits_router
from app.routes.versions import router as _versions_router

router = APIRouter(prefix="/v1")
router.include_router(_auth_router)
router.include_router(_catalog_router)
router.include_router(_class_properties_router)
router.include_router(_classes_router)
router.include_router(_export_router)
router.include_router(_import_router)
router.include_router(_users_router)
router.include_router(_dashboard_audit_router)
router.include_router(_tenants_router)
router.include_router(_sso_router)
router.include_router(_rbac_router)
router.include_router(_api_keys_router)
router.include_router(_projects_router)
router.include_router(_properties_router)
router.include_router(_schema_webhooks_router)
router.include_router(_schema_promotions_router)
router.include_router(_validate_router)
router.include_router(_version_commits_router)
router.include_router(_versions_router)
