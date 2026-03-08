"""
v1 API aggregator.

Routes are split across focused modules:
  - app.routes.auth     → /v1/auth/login
  - app.routes.users    → /v1/users
  - app.routes.tenants  → /v1/tenants, /v1/tenants/{id}/members,
                          /v1/tenants/{id}/administrators
  - app.routes.api_keys → /v1/tenants/{id}/api-keys
  - app.routes.projects → /v1/tenants/{id}/projects

This module assembles them under the /v1 prefix and re-exports the password
helpers so that existing imports (e.g. in tests) continue to work.
"""

from fastapi import APIRouter

from app.routes.api_keys import router as _api_keys_router
from app.routes.auth import router as _auth_router
from app.routes.projects import router as _projects_router
from app.routes.users import router as _users_router
from app.routes.users import _hash_password, _verify_password  # noqa: F401 — re-export
from app.routes.tenants import router as _tenants_router

router = APIRouter(prefix="/v1")
router.include_router(_auth_router)
router.include_router(_users_router)
router.include_router(_tenants_router)
router.include_router(_api_keys_router)
router.include_router(_projects_router)
