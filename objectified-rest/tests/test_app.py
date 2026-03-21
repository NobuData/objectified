"""Tests for objectified-rest FastAPI app and schemas."""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_admin, require_authenticated
from app.schemas import (
    AccountSchema,
    TenantSchema,
    TenantAccessLevel,
    TenantAdministratorCreate,
    VersionVisibility,
)
from app.routes.users import _hash_password, _verify_password
from tests.conftest import mock_db_all

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_ADMIN_CALLER = {"auth_method": "jwt", "user_id": "admin-uid", "is_admin": True}

_NOW = datetime.now(timezone.utc)
_ACCOUNT_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Alice",
    "email": "alice@example.com",
    "verified": True,
    "enabled": True,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
    "last_login_at": None,
    "deactivation_reason": None,
    "deactivated_by": None,
}
_TENANT_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000002",
    "name": "Acme",
    "description": "Acme Corp",
    "slug": "acme",
    "enabled": True,
    "metadata": {},
    "rate_limit_requests_per_minute": None,
    "max_projects": None,
    "max_versions_per_project": None,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}
_TENANT_ACCOUNT_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000003",
    "tenant_id": "00000000-0000-0000-0000-000000000002",
    "account_id": "00000000-0000-0000-0000-000000000001",
    "access_level": "member",
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    """FastAPI test client - no dependency overrides."""
    app.dependency_overrides.clear()
    return TestClient(app)


@pytest.fixture
def admin_client():
    """FastAPI test client with require_admin overridden to pass as admin."""
    app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def jwt_client():
    """FastAPI test client with require_authenticated overridden (JWT caller for /me)."""
    app.dependency_overrides[require_authenticated] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Password hashing tests
# ---------------------------------------------------------------------------


def test_hash_password_produces_argon2id_hash():
    """_hash_password returns an Argon2id encoded string."""
    hashed = _hash_password("mysecretpassword")
    assert hashed.startswith("$argon2id$"), f"Expected Argon2id hash, got: {hashed[:30]}"


def test_hash_password_is_not_plaintext():
    """_hash_password does not return the password in plaintext."""
    password = "mysecretpassword"
    hashed = _hash_password(password)
    assert password not in hashed


def test_hash_password_different_salts():
    """_hash_password generates a unique hash each call (random salt)."""
    h1 = _hash_password("samepassword")
    h2 = _hash_password("samepassword")
    assert h1 != h2, "Two hashes of the same password should differ (random salt)"


def test_verify_password_correct():
    """_verify_password returns True for a matching password."""
    password = "correcthorsebatterystaple"
    hashed = _hash_password(password)
    assert _verify_password(password, hashed) is True


def test_verify_password_incorrect():
    """_verify_password returns False for a non-matching password."""
    hashed = _hash_password("correctpassword")
    assert _verify_password("wrongpassword", hashed) is False


def test_verify_password_invalid_hash():
    """_verify_password returns False for a completely invalid hash string."""
    assert _verify_password("anypassword", "not-a-valid-hash") is False


# ---------------------------------------------------------------------------
# Core app tests
# ---------------------------------------------------------------------------


def test_root(client):
    """Root returns message and v1 links."""
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "Objectified REST API"
    assert data.get("health") == "/health"
    assert data.get("ready") == "/ready"
    assert "v1" in data
    assert data["v1"]["users"] == "/v1/users"
    assert data["v1"]["tenants"] == "/v1/tenants"


def test_health(client):
    """Health check returns ok."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready_skips_database_when_disabled(client):
    """READINESS_CHECK_DATABASE=false returns ready without calling the DB."""
    from app.config import settings

    with patch.object(settings, "readiness_check_database", False):
        r = client.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "skipped"


def test_ready_ok_when_database_ping_succeeds(client):
    """GET /ready returns 200 when db.ping() is True."""
    with patch("app.main.db.ping", return_value=True):
        r = client.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"


def test_ready_503_when_database_unavailable(client):
    """GET /ready returns 503 when db.ping() is False."""
    with patch("app.main.db.ping", return_value=False):
        r = client.get("/ready")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"] == "unavailable"


def test_openapi_has_security_schemes(client):
    """OpenAPI schema includes Bearer and ApiKey security schemes and is 3.2.0."""
    r = client.get("/openapi.json")
    assert r.status_code == 200
    data = r.json()
    assert data.get("openapi") == "3.2.0"
    schemes = data.get("components", {}).get("securitySchemes", {})
    assert "Bearer" in schemes
    assert schemes["Bearer"]["type"] == "http"
    assert "ApiKey" in schemes
    assert schemes["ApiKey"]["in"] == "header"
    assert schemes["ApiKey"]["name"] == "X-API-Key"


# ---------------------------------------------------------------------------
# User routes - auth enforcement on GET /v1/users
# ---------------------------------------------------------------------------


def test_list_users_requires_auth(client):
    """GET /v1/users returns 401 with no credentials."""
    r = client.get("/v1/users")
    assert r.status_code == 401


def test_list_users_requires_admin_non_admin_jwt(client):
    """GET /v1/users returns 403 when JWT caller is not an admin."""
    with patch("app.auth.decode_jwt") as mock_decode, \
         patch("app.auth._is_platform_admin") as mock_is_admin:
        mock_decode.return_value = {
            "sub": "member-uid",
            "email": "member@example.com",
            "is_admin": False,
        }
        mock_is_admin.return_value = False
        r = client.get(
            "/v1/users",
            headers={"Authorization": "Bearer valid.jwt.token"},
        )
    assert r.status_code == 403


def test_list_users_succeeds_for_tenant_admin_via_db(client):
    """GET /v1/users returns 200 for a JWT caller who is a tenant administrator (DB fallback)."""
    with patch("app.auth.decode_jwt") as mock_decode, \
         patch("app.auth._is_platform_admin") as mock_is_admin, \
         mock_db_all() as mock_db:
        mock_decode.return_value = {
            "sub": "admin-uid",
            "email": "admin@example.com",
            "is_admin": False,
        }
        mock_is_admin.return_value = True
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = client.get(
            "/v1/users",
            headers={"Authorization": "Bearer valid.jwt.token"},
        )
    assert r.status_code == 200
    assert r.json()[0]["email"] == "alice@example.com"


# ---------------------------------------------------------------------------
# User routes - happy path (admin_client bypasses the auth dependency)
# ---------------------------------------------------------------------------


def test_list_users_returns_accounts(admin_client):
    """GET /v1/users returns list of accounts when called with admin credentials."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = admin_client.get("/v1/users")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["email"] == "alice@example.com"


def test_list_users_empty(admin_client):
    """GET /v1/users returns empty list when no accounts exist (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.get("/v1/users")
    assert r.status_code == 200
    assert r.json() == []


def test_list_users_search_status_sort_builds_query(admin_client):
    """GET /v1/users passes search, status, and sort into SQL."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.get(
            "/v1/users?search=ali&status=active&sort=last_login_at_desc"
        )
    assert r.status_code == 200
    mock_db.execute_query.assert_called_once()
    sql = mock_db.execute_query.call_args[0][0]
    assert "ILIKE" in sql
    assert "last_login_at DESC" in sql


def test_list_user_lifecycle_events(admin_client):
    """GET /v1/users/{id}/lifecycle-events returns audit rows."""
    ev = {
        "id": "00000000-0000-0000-0000-0000000000aa",
        "account_id": _ACCOUNT_ROW["id"],
        "event_type": "deactivated",
        "reason": "test",
        "actor_id": "admin-uid",
        "created_at": _NOW,
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"1": 1}],
            [ev],
        ]
        r = admin_client.get(f"/v1/users/{_ACCOUNT_ROW['id']}/lifecycle-events")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["event_type"] == "deactivated"


def test_bulk_invite_tenant_members(admin_client):
    """POST .../members/bulk-invite adds existing accounts by email."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ROW["id"]}],
            [{"id": _ACCOUNT_ROW["id"], "email": "alice@example.com"}],
            [],
        ]
        mock_db.execute_mutation.return_value = dict(_TENANT_ACCOUNT_ROW)
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/bulk-invite",
            json={"emails": ["alice@example.com"], "access_level": "member"},
        )
    assert r.status_code == 200
    assert r.json()["results"][0]["status"] == "added"


def test_get_user_requires_auth(client):
    """GET /v1/users/{id} returns 401 with no credentials."""
    r = client.get(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 401


def test_get_user_by_id_found(admin_client):
    """GET /v1/users/{id} returns account when found (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = admin_client.get(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == _ACCOUNT_ROW["id"]


def test_get_user_by_id_not_found(admin_client):
    """GET /v1/users/{id} returns 404 when account not found (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.get("/v1/users/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


def test_list_user_tenant_memberships(admin_client):
    """GET /v1/users/{id}/tenant-memberships returns memberships and roles (admin)."""
    membership = {
        "tenant_id": _TENANT_ROW["id"],
        "tenant_name": "Acme",
        "access_level": "member",
        "membership_enabled": True,
    }
    role = {
        "tenant_id": _TENANT_ROW["id"],
        "role_id": "00000000-0000-0000-0000-0000000000bb",
        "key": "editor",
        "name": "Editor",
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": 1}],
            [membership],
            [role],
        ]
        r = admin_client.get(f"/v1/users/{_ACCOUNT_ROW['id']}/tenant-memberships")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["tenant_name"] == "Acme"
    assert data[0]["access_level"] == "member"
    assert data[0]["membership_enabled"] is True
    assert len(data[0]["roles"]) == 1
    assert data[0]["roles"][0]["key"] == "editor"


def test_list_user_tenant_memberships_user_not_found(admin_client):
    """GET /v1/users/{id}/tenant-memberships returns 404 when user missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.get("/v1/users/00000000-0000-0000-0000-000000000099/tenant-memberships")
    assert r.status_code == 404


def test_list_user_tenant_memberships_empty_memberships(admin_client):
    """GET /v1/users/{id}/tenant-memberships returns empty list when no tenants."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": 1}],
            [],
            [],
        ]
        r = admin_client.get(f"/v1/users/{_ACCOUNT_ROW['id']}/tenant-memberships")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# GET /v1/me and PATCH /v1/me (current user profile)
# ---------------------------------------------------------------------------

_ME_ACCOUNT_ROW: dict[str, Any] = {
    **_ACCOUNT_ROW,
    "id": _ADMIN_CALLER["user_id"],
}


def test_get_me_requires_auth(client):
    """GET /v1/me returns 401 with no credentials."""
    r = client.get("/v1/me")
    assert r.status_code == 401


def test_get_me_success(jwt_client):
    """GET /v1/me returns the authenticated user's account."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ME_ACCOUNT_ROW]
        r = jwt_client.get("/v1/me")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _ADMIN_CALLER["user_id"]
    assert data["email"] == _ME_ACCOUNT_ROW["email"]


def test_get_me_not_found(jwt_client):
    """GET /v1/me returns 404 when account no longer exists."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = jwt_client.get("/v1/me")
    assert r.status_code == 404


def test_patch_me_success(jwt_client):
    """PATCH /v1/me updates name and metadata and returns updated account."""
    updated = {**_ME_ACCOUNT_ROW, "name": "Alice Updated", "metadata": {"k": "v"}}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ME_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = jwt_client.patch(
            "/v1/me",
            json={"name": "Alice Updated", "metadata": {"k": "v"}},
        )
    assert r.status_code == 200
    assert r.json()["name"] == "Alice Updated"
    assert r.json()["metadata"] == {"k": "v"}


def test_patch_me_no_fields(jwt_client):
    """PATCH /v1/me returns 400 when no fields are provided."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ME_ACCOUNT_ROW]
        r = jwt_client.patch("/v1/me", json={})
    assert r.status_code == 400


def test_patch_me_requires_auth(client):
    """PATCH /v1/me returns 401 with no credentials."""
    r = client.patch("/v1/me", json={"name": "Ghost"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /v1/users/{id}, POST /v1/users, etc.
# ---------------------------------------------------------------------------


def test_create_user_success(client):
    """POST /v1/users creates a new user and returns 201."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.return_value = _ACCOUNT_ROW
        r = client.post(
            "/v1/users",
            json={"name": "Alice", "email": "alice@example.com", "password": "secret123"},
        )
    assert r.status_code == 201
    assert r.json()["email"] == "alice@example.com"


def test_create_user_duplicate_email(client):
    """POST /v1/users returns 409 when email already exists."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = client.post(
            "/v1/users",
            json={"name": "Alice", "email": "alice@example.com", "password": "secret123"},
        )
    assert r.status_code == 409


def test_update_user_success(admin_client):
    """PUT /v1/users/{id} updates a user and returns updated account (admin)."""
    updated = {**_ACCOUNT_ROW, "name": "Alice Updated"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(f"/v1/users/{_ACCOUNT_ROW['id']}", json={"name": "Alice Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Alice Updated"


def test_update_user_requires_auth(client):
    """PUT /v1/users/{id} returns 401 with no credentials."""
    r = client.put(f"/v1/users/{_ACCOUNT_ROW['id']}", json={"name": "Ghost"})
    assert r.status_code == 401


def test_update_user_not_found(admin_client):
    """PUT /v1/users/{id} returns 404 when user does not exist (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.put("/v1/users/00000000-0000-0000-0000-000000000099", json={"name": "Ghost"})
    assert r.status_code == 404


def test_update_user_no_fields(admin_client):
    """PUT /v1/users/{id} returns 400 when no fields are provided (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = admin_client.put(f"/v1/users/{_ACCOUNT_ROW['id']}", json={})
    assert r.status_code == 400


def test_deactivate_user_success(admin_client):
    """DELETE /v1/users/{id} soft-deletes user and returns 204."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.side_effect = [
            {"id": _ACCOUNT_ROW["id"]},
            None,
        ]
        r = admin_client.delete(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 204


def test_deactivate_user_not_found(admin_client):
    """DELETE /v1/users/{id} returns 404 when user does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.delete("/v1/users/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant routes
# ---------------------------------------------------------------------------


def test_list_tenants_returns_tenants(client):
    """GET /v1/tenants returns list of tenants."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.get("/v1/tenants")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["slug"] == "acme"


def test_list_tenants_archived_only_adds_deleted_filter(client):
    """GET /v1/tenants?archived_only=true restricts to soft-deleted rows."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants?archived_only=true")
    assert r.status_code == 200
    sql = mock_db.execute_query.call_args[0][0]
    assert "deleted_at IS NOT NULL" in sql


def test_list_tenants_search_adds_position_predicates(client):
    """GET /v1/tenants?search=ac adds case-insensitive substring filters."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants?search=ac")
    assert r.status_code == 200
    sql = mock_db.execute_query.call_args[0][0]
    assert "POSITION(" in sql
    args = mock_db.execute_query.call_args[0][1]
    assert args == ("ac", "ac", "ac")


def test_list_tenants_me_requires_auth(client):
    """GET /v1/tenants/me returns 401 with no credentials."""
    r = client.get("/v1/tenants/me")
    assert r.status_code == 401


def test_list_tenants_me_returns_current_user_tenants(jwt_client):
    """GET /v1/tenants/me returns tenants the authenticated user is a member of."""
    tenant_refs = [{"id": _TENANT_ROW["id"], "slug": "acme", "name": "Acme"}]
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [tenant_refs, [_TENANT_ROW]]
        r = jwt_client.get("/v1/tenants/me")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == _TENANT_ROW["id"]
    assert data[0]["slug"] == "acme"


def test_list_tenants_me_returns_empty_when_no_tenants(jwt_client):
    """GET /v1/tenants/me returns empty list when user has no tenants."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = jwt_client.get("/v1/tenants/me")
    assert r.status_code == 200
    assert r.json() == []


def test_list_tenants_me_include_archived_omits_deleted_filter_on_tenant_table(jwt_client):
    """GET /v1/tenants/me?include_archived=true lists memberships including archived tenants."""
    tenant_refs = [{"id": _TENANT_ROW["id"], "slug": "acme", "name": "Acme"}]
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [tenant_refs, [_TENANT_ROW]]
        r = jwt_client.get("/v1/tenants/me?include_archived=true")
    assert r.status_code == 200
    second_sql = mock_db.execute_query.call_args_list[1][0][0]
    assert "AND deleted_at IS NULL" not in second_sql


def test_get_tenant_by_id_found(client):
    """GET /v1/tenants/{id} returns tenant when found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}")
    assert r.status_code == 200
    assert r.json()["slug"] == "acme"


def test_get_tenant_by_id_not_found(client):
    """GET /v1/tenants/{id} returns 404 when not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


def test_create_tenant_success(jwt_client):
    """POST /v1/tenants creates a tenant and assigns the caller as administrator; returns 201."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.side_effect = [_TENANT_ROW, _TENANT_ACCOUNT_ROW]
        r = jwt_client.post("/v1/tenants", json={"name": "Acme", "description": "Acme Corp", "slug": "acme"})
    assert r.status_code == 201
    assert r.json()["slug"] == "acme"


def test_create_tenant_requires_auth(client):
    """POST /v1/tenants without authentication returns 401."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
    r = client.post("/v1/tenants", json={"name": "Acme", "description": "Acme Corp", "slug": "acme"})
    assert r.status_code == 401


def test_create_tenant_duplicate_slug(jwt_client):
    """POST /v1/tenants returns 409 when slug already exists."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = jwt_client.post("/v1/tenants", json={"name": "Acme2", "description": "", "slug": "acme"})
    assert r.status_code == 409


def test_restore_tenant_success(admin_client):
    """POST /v1/tenants/{id}/restore clears deleted_at (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"id": _TENANT_ROW["id"]}]
        mock_db.execute_mutation.return_value = _TENANT_ROW
        r = admin_client.post(f"/v1/tenants/{_TENANT_ROW['id']}/restore")
    assert r.status_code == 200
    assert r.json()["slug"] == "acme"


def test_get_tenant_activity_summary(jwt_client):
    """GET /v1/tenants/{id}/activity-summary returns aggregate counts."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ROW["id"]}],
            [
                {
                    "active_project_count": 2,
                    "active_member_count": 5,
                    "schema_version_count": 11,
                }
            ],
            [{"c": 4}],
        ]
        r = jwt_client.get(f"/v1/tenants/{_TENANT_ROW['id']}/activity-summary")
    assert r.status_code == 200
    body = r.json()
    assert body["active_project_count"] == 2
    assert body["active_member_count"] == 5
    assert body["schema_version_count"] == 11
    assert body["dashboard_page_visits_last_7_days"] == 4


def test_put_tenant_appearance_updates_metadata(jwt_client):
    """PUT /v1/tenants/{id}/appearance merges branding into metadata."""
    updated = dict(_TENANT_ROW)
    updated["metadata"] = {
        "branding": {"logoUrl": "https://cdn.example.com/logo.png"},
        "defaultTheme": "dark",
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"metadata": {}}]
        mock_db.execute_mutation.return_value = updated
        r = jwt_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/appearance",
            json={
                "logo_url": "https://cdn.example.com/logo.png",
                "default_theme": "dark",
            },
        )
    assert r.status_code == 200
    assert r.json()["metadata"]["defaultTheme"] == "dark"


# ---------------------------------------------------------------------------
# Tenant slug validation (matches DB CHECK constraint)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("slug", [
    "Uppercase",        # uppercase letters
    "has space",        # space
    "has_underscore",   # underscore
    "-leading-hyphen",  # leading hyphen
    "trailing-hyphen-", # trailing hyphen
    "double--hyphen",   # consecutive hyphens
    "",                 # empty string
])
def test_create_tenant_invalid_slug_returns_422(jwt_client, slug):
    """POST /v1/tenants returns 422 for slugs that violate the slug format."""
    r = jwt_client.post(
        "/v1/tenants",
        json={"name": "Test", "description": "", "slug": slug},
    )
    assert r.status_code == 422
    detail = r.json().get("detail", "")
    assert detail  # some validation message must be present


@pytest.mark.parametrize("slug", [
    "acme",
    "my-tenant",
    "acme-corp-2",
    "a",
    "abc123",
    "123",
])
def test_create_tenant_valid_slug_passes_validation(jwt_client, slug):
    """POST /v1/tenants accepts well-formed slugs (no 422)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.side_effect = [{**_TENANT_ROW, "slug": slug}, _TENANT_ACCOUNT_ROW]
        r = jwt_client.post(
            "/v1/tenants",
            json={"name": "Test", "description": "", "slug": slug},
        )
    assert r.status_code == 201


@pytest.mark.parametrize("slug", [
    "Uppercase",
    "has space",
    "has_underscore",
    "-leading",
    "trailing-",
    "double--hyphen",
])
def test_update_tenant_invalid_slug_returns_422(admin_client, slug):
    """PUT /v1/tenants/{id} returns 422 when an invalid slug is supplied."""
    r = admin_client.put(
        f"/v1/tenants/{_TENANT_ROW['id']}",
        json={"slug": slug},
    )
    assert r.status_code == 422


def test_update_tenant_valid_slug_passes_validation(admin_client):
    """PUT /v1/tenants/{id} accepts a well-formed slug."""
    updated = {**_TENANT_ROW, "slug": "new-slug"}
    with mock_db_all() as mock_db:
        # First call: tenant existence check → found
        # Second call: slug uniqueness check → no conflict
        mock_db.execute_query.side_effect = [[_TENANT_ROW], []]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"slug": "new-slug"})
    assert r.status_code == 200
    assert r.json()["slug"] == "new-slug"


def test_update_tenant_success(admin_client):
    """PUT /v1/tenants/{id} updates tenant."""
    updated = {**_TENANT_ROW, "name": "Acme Updated"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"name": "Acme Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Acme Updated"


def test_update_tenant_not_found(admin_client):
    """PUT /v1/tenants/{id} returns 404 when tenant not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.put("/v1/tenants/00000000-0000-0000-0000-000000000099", json={"name": "Ghost"})
    assert r.status_code == 404


def test_update_tenant_no_fields(admin_client):
    """PUT /v1/tenants/{id} returns 400 when no fields are provided."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={})
    assert r.status_code == 400


def test_deactivate_tenant_success(admin_client):
    """DELETE /v1/tenants/{id} soft-deletes tenant and returns 204."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.delete(f"/v1/tenants/{_TENANT_ROW['id']}")
    assert r.status_code == 204


def test_deactivate_tenant_not_found(admin_client):
    """DELETE /v1/tenants/{id} returns 404 when tenant not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.delete("/v1/tenants/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant member routes
# ---------------------------------------------------------------------------


def test_list_tenant_members_found(client):
    """GET /v1/tenants/{id}/members returns members."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_TENANT_ACCOUNT_ROW]]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}/members")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["access_level"] == "member"
    assert r.json()[0]["roles"] == []


def test_list_tenant_members_tenant_not_found(client):
    """GET /v1/tenants/{id}/members returns 404 when tenant not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099/members")
    assert r.status_code == 404


def test_add_tenant_member_success(admin_client):
    """POST /v1/tenants/{id}/members adds a member (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], [], []]
        mock_db.execute_mutation.return_value = _TENANT_ACCOUNT_ROW
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
        )
    assert r.status_code == 201
    assert r.json()["account_id"] == _ACCOUNT_ROW["id"]


def test_add_tenant_member_requires_auth(client):
    """POST /v1/tenants/{id}/members returns 401 with no credentials."""
    r = client.post(
        f"/v1/tenants/{_TENANT_ROW['id']}/members",
        json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
    )
    assert r.status_code == 401


def test_add_tenant_member_account_not_found(admin_client):
    """POST /v1/tenants/{id}/members returns 404 when account_id does not exist."""
    with mock_db_all() as mock_db:
        # Tenant exists, but account does not
        mock_db.execute_query.side_effect = [[_TENANT_ROW], []]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": "00000000-0000-0000-0000-000000000099", "access_level": "member"},
        )
    assert r.status_code == 404


def test_add_tenant_member_duplicate(admin_client):
    """POST /v1/tenants/{id}/members returns 409 when already a member (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], [_TENANT_ACCOUNT_ROW]]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
        )
    assert r.status_code == 409


def test_remove_tenant_member_success(admin_client):
    """DELETE /v1/tenants/{id}/members/{account_id} removes member."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.delete(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 204


def test_remove_tenant_member_not_found(admin_client):
    """DELETE /v1/tenants/{id}/members/{account_id} returns 404 when not a member."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.delete(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant administrator routes
# ---------------------------------------------------------------------------


def test_list_tenant_administrators_found(client):
    """GET /v1/tenants/{id}/administrators returns admins."""
    admin_row = {**_TENANT_ACCOUNT_ROW, "access_level": "administrator"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [admin_row]]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}/administrators")
    assert r.status_code == 200
    assert r.json()[0]["access_level"] == "administrator"


def test_list_tenant_administrators_tenant_not_found(client):
    """GET /v1/tenants/{id}/administrators returns 404 when tenant not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099/administrators")
    assert r.status_code == 404


def test_update_tenant_member_success(admin_client):
    """PUT /v1/tenants/{id}/members/{account_id} updates access level."""
    updated = {**_TENANT_ACCOUNT_ROW, "access_level": "administrator"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"access_level": "administrator"},
        )
    assert r.status_code == 200
    assert r.json()["access_level"] == "administrator"


def test_update_tenant_member_no_fields(admin_client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 400 with empty body."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}", json={})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Schema serialization tests
# ---------------------------------------------------------------------------


def test_account_schema_serialization():
    """AccountSchema can be built and serialized."""
    obj = AccountSchema(
        id="00000000-0000-0000-0000-000000000001",
        name="Test",
        email="test@example.com",
        verified=True,
        enabled=True,
        metadata={},
        created_at=_NOW,
        updated_at=None,
        deleted_at=None,
    )
    d = obj.model_dump()
    assert d["email"] == "test@example.com"
    assert d["name"] == "Test"


def test_tenant_schema_serialization():
    """TenantSchema can be built and serialized."""
    obj = TenantSchema(
        id="00000000-0000-0000-0000-000000000002",
        name="Acme",
        description="Acme tenant",
        slug="acme",
        enabled=True,
        metadata={},
        created_at=_NOW,
        updated_at=None,
        deleted_at=None,
    )
    d = obj.model_dump()
    assert d["slug"] == "acme"


def test_tenant_access_level_enum():
    """TenantAccessLevel has member and administrator."""
    assert TenantAccessLevel.MEMBER.value == "member"
    assert TenantAccessLevel.ADMINISTRATOR.value == "administrator"


def test_version_visibility_enum():
    """VersionVisibility has private and public."""
    assert VersionVisibility.PRIVATE.value == "private"
    assert VersionVisibility.PUBLIC.value == "public"


# ---------------------------------------------------------------------------
# include_deleted parameter coverage for user routes
# ---------------------------------------------------------------------------


def test_list_users_include_deleted(admin_client):
    """GET /v1/users?include_deleted=true returns all accounts including deleted ones."""
    deleted_row = {**_ACCOUNT_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW, deleted_row]
        r = admin_client.get("/v1/users?include_deleted=true")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_user_include_deleted(admin_client):
    """GET /v1/users/{id}?include_deleted=true returns deleted account (admin)."""
    deleted_row = {**_ACCOUNT_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [deleted_row]
        r = admin_client.get(f"/v1/users/{_ACCOUNT_ROW['id']}?include_deleted=true")
    assert r.status_code == 200
    assert r.json()["id"] == _ACCOUNT_ROW["id"]


def test_create_user_server_error(client):
    """POST /v1/users returns 500 when DB mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.return_value = None
        r = client.post(
            "/v1/users",
            json={"name": "Alice", "email": "alice@example.com", "password": "secret123"},
        )
    assert r.status_code == 500


# ---------------------------------------------------------------------------
# update_user - additional field coverage
# ---------------------------------------------------------------------------


def test_update_user_email_conflict(admin_client):
    """PUT /v1/users/{id} returns 409 when new email is already in use."""
    with mock_db_all() as mock_db:
        # First call: existence check → found; second call: email uniqueness → conflict
        mock_db.execute_query.side_effect = [[_ACCOUNT_ROW], [_ACCOUNT_ROW]]
        r = admin_client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"email": "other@example.com"},
        )
    assert r.status_code == 409


def test_update_user_password_change(admin_client):
    """PUT /v1/users/{id} successfully updates the password."""
    updated = {**_ACCOUNT_ROW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"password": "newSecurePassword1"},
        )
    assert r.status_code == 200


def test_update_user_verified_enabled_metadata(admin_client):
    """PUT /v1/users/{id} updates verified, enabled, and metadata fields."""
    updated = {**_ACCOUNT_ROW, "verified": True, "enabled": False, "metadata": {"role": "tester"}}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"verified": True, "enabled": False, "metadata": {"role": "tester"}},
        )
    assert r.status_code == 200
    assert r.json()["verified"] is True
    assert r.json()["enabled"] is False


def test_update_user_mutation_returns_none(admin_client):
    """PUT /v1/users/{id} returns 404 when DB mutation returns None (race condition)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"name": "Ghost"},
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# include_deleted parameter coverage for tenant routes
# ---------------------------------------------------------------------------


def test_list_tenants_include_deleted(client):
    """GET /v1/tenants?include_deleted=true returns all tenants including deleted."""
    deleted_row = {**_TENANT_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW, deleted_row]
        r = client.get("/v1/tenants?include_deleted=true")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_tenant_include_deleted(client):
    """GET /v1/tenants/{id}?include_deleted=true returns deleted tenant."""
    deleted_row = {**_TENANT_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [deleted_row]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}?include_deleted=true")
    assert r.status_code == 200
    assert r.json()["id"] == _TENANT_ROW["id"]


def test_create_tenant_server_error(jwt_client):
    """POST /v1/tenants returns 500 when DB mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.return_value = None
        r = jwt_client.post("/v1/tenants", json={"name": "Acme", "description": "Acme Corp", "slug": "acme"})
    assert r.status_code == 500


# Note: create_tenant uses a single CTE to insert tenant + tenant_account atomically,
# so there is no separate "admin assign fails" path; test_create_tenant_server_error
# covers the case when the mutation returns None.


# ---------------------------------------------------------------------------
# update_tenant - additional field coverage
# ---------------------------------------------------------------------------


def test_update_tenant_description_update(admin_client):
    """PUT /v1/tenants/{id} updates the description field."""
    updated = {**_TENANT_ROW, "description": "Updated description"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"description": "Updated description"})
    assert r.status_code == 200
    assert r.json()["description"] == "Updated description"


def test_update_tenant_slug_conflict(admin_client):
    """PUT /v1/tenants/{id} returns 409 when new slug is already in use by another tenant."""
    other_tenant = {**_TENANT_ROW, "id": "00000000-0000-0000-0000-000000000099"}
    with mock_db_all() as mock_db:
        # First call: tenant existence; second call: slug uniqueness conflict
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [other_tenant]]
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}",
            json={"slug": "other-slug"},
        )
    assert r.status_code == 409


def test_update_tenant_enabled_metadata(admin_client):
    """PUT /v1/tenants/{id} updates enabled and metadata fields."""
    updated = {**_TENANT_ROW, "enabled": False, "metadata": {"tier": "free"}}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}",
            json={"enabled": False, "metadata": {"tier": "free"}},
        )
    assert r.status_code == 200
    assert r.json()["enabled"] is False


def test_update_tenant_mutation_returns_none(admin_client):
    """PUT /v1/tenants/{id} returns 404 when DB mutation returns None (race condition)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"name": "Ghost"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# add_tenant_member - mismatched tenant_id in payload
# ---------------------------------------------------------------------------


def test_add_tenant_member_mismatched_tenant_id(admin_client):
    """POST /v1/tenants/{id}/members returns 400 when payload tenant_id differs from path."""
    different_tenant_id = "00000000-0000-0000-0000-000000000099"
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={
                "tenant_id": different_tenant_id,
                "account_id": _ACCOUNT_ROW["id"],
                "access_level": "member",
            },
        )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# update_tenant_member - additional field coverage
# ---------------------------------------------------------------------------


def test_update_tenant_member_enabled_only(admin_client):
    """PUT /v1/tenants/{id}/members/{account_id} updates enabled field only."""
    updated = {**_TENANT_ACCOUNT_ROW, "enabled": False}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"enabled": False},
        )
    assert r.status_code == 200
    assert r.json()["enabled"] is False


def test_update_tenant_member_mutation_returns_none(admin_client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 404 when DB mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"access_level": "administrator"},
        )
    assert r.status_code == 404


def test_update_tenant_member_not_found(admin_client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 404 when member not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"access_level": "administrator"},
        )
    assert r.status_code == 404


def test_update_user_email_success(admin_client):
    """PUT /v1/users/{id} succeeds when new email is unique (no conflict)."""
    updated = {**_ACCOUNT_ROW, "email": "newemail@example.com"}
    with mock_db_all() as mock_db:
        # First call: existence check → found; second call: email uniqueness → no conflict
        mock_db.execute_query.side_effect = [[_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = updated
        r = admin_client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"email": "newemail@example.com"},
        )
    assert r.status_code == 200
    assert r.json()["email"] == "newemail@example.com"


def test_add_tenant_member_server_error(admin_client):
    """POST /v1/tenants/{id}/members returns 500 when DB mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], [], []]
        mock_db.execute_mutation.return_value = None
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
        )
    assert r.status_code == 500


# ---------------------------------------------------------------------------
# Email-based tenant member addition (GH-17)
# ---------------------------------------------------------------------------


def test_add_tenant_member_by_email_success(admin_client):
    """POST /v1/tenants/{id}/members with email resolves to account and adds member."""
    email_lookup_row = {"id": _ACCOUNT_ROW["id"]}
    with mock_db_all() as mock_db:
        # Calls: tenant exists, email lookup, duplicate check, insert
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],           # _assert_tenant_exists
            [email_lookup_row],      # email → account_id lookup
            [],                      # duplicate membership check
            [],                      # workspace roles for response
        ]
        mock_db.execute_mutation.return_value = _TENANT_ACCOUNT_ROW
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"email": _ACCOUNT_ROW["email"], "access_level": "member"},
        )
    assert r.status_code == 201
    assert r.json()["account_id"] == _ACCOUNT_ROW["id"]


def test_add_tenant_member_by_email_not_found(admin_client):
    """POST /v1/tenants/{id}/members returns 404 when email does not match any account."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],  # _assert_tenant_exists
            [],             # email lookup → no result
        ]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"email": "unknown@example.com", "access_level": "member"},
        )
    assert r.status_code == 404
    assert "email" in r.json()["detail"].lower()


def test_add_tenant_member_by_email_duplicate(admin_client):
    """POST /v1/tenants/{id}/members by email returns 409 when account is already a member."""
    email_lookup_row = {"id": _ACCOUNT_ROW["id"]}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],           # _assert_tenant_exists
            [email_lookup_row],      # email lookup
            [_TENANT_ACCOUNT_ROW],  # duplicate check → already a member
        ]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"email": _ACCOUNT_ROW["email"], "access_level": "member"},
        )
    assert r.status_code == 409


def test_add_tenant_member_no_identifier_returns_422(admin_client):
    """POST /v1/tenants/{id}/members returns 422 when neither account_id nor email is provided."""
    r = admin_client.post(
        f"/v1/tenants/{_TENANT_ROW['id']}/members",
        json={"access_level": "member"},
    )
    assert r.status_code == 422


def test_add_tenant_member_account_id_takes_precedence_over_email(admin_client):
    """POST /v1/tenants/{id}/members uses account_id when both account_id and email are given."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],   # _assert_tenant_exists
            [_ACCOUNT_ROW],  # _assert_account_exists (uses account_id path)
            [],              # duplicate check
            [],              # workspace roles for response
        ]
        mock_db.execute_mutation.return_value = _TENANT_ACCOUNT_ROW
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={
                "account_id": _ACCOUNT_ROW["id"],
                "email": "other@example.com",
                "access_level": "member",
            },
        )
    assert r.status_code == 201
    assert r.json()["account_id"] == _ACCOUNT_ROW["id"]


def test_add_tenant_member_by_email_server_error(admin_client):
    """POST /v1/tenants/{id}/members by email returns 500 when DB mutation returns None."""
    email_lookup_row = {"id": _ACCOUNT_ROW["id"]}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [email_lookup_row],
            [],
        ]
        mock_db.execute_mutation.return_value = None
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"email": _ACCOUNT_ROW["email"], "access_level": "member"},
        )
    assert r.status_code == 500


# ---------------------------------------------------------------------------
# GH-18: Tenant administrator routes (add / remove)
# ---------------------------------------------------------------------------

_TENANT_ADMIN_ROW: dict[str, Any] = {
    **_TENANT_ACCOUNT_ROW,
    "access_level": "administrator",
}


def test_add_tenant_administrator_success(admin_client):
    """POST /v1/tenants/{id}/administrators adds a new administrator (admin)."""
    with mock_db_all() as mock_db:
        # Calls: tenant exists, account exists, existing membership check
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = _TENANT_ADMIN_ROW
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 201
    assert r.json()["access_level"] == "administrator"
    assert r.json()["account_id"] == _ACCOUNT_ROW["id"]


def test_add_tenant_administrator_rejects_access_level_field(admin_client):
    """POST /v1/tenants/{id}/administrators returns 422 when access_level is supplied.

    The dedicated schema does not include access_level — it is always 'administrator'.
    """
    r = admin_client.post(
        f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
        json={"account_id": _ACCOUNT_ROW["id"], "access_level": "administrator"},
    )
    assert r.status_code == 422


def test_add_tenant_administrator_requires_auth(client):
    """POST /v1/tenants/{id}/administrators returns 401 with no credentials."""
    r = client.post(
        f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
        json={"account_id": _ACCOUNT_ROW["id"]},
    )
    assert r.status_code == 401


def test_add_tenant_administrator_tenant_not_found(admin_client):
    """POST /v1/tenants/{id}/administrators returns 404 when tenant not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.post(
            "/v1/tenants/00000000-0000-0000-0000-000000000099/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 404


def test_add_tenant_administrator_account_not_found(admin_client):
    """POST /v1/tenants/{id}/administrators returns 404 when account_id does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], []]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": "00000000-0000-0000-0000-000000000099"},
        )
    assert r.status_code == 404


def test_add_tenant_administrator_duplicate(admin_client):
    """POST /v1/tenants/{id}/administrators returns 409 when already an administrator."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_ACCOUNT_ROW],
            [_TENANT_ADMIN_ROW],  # existing row with access_level=administrator
        ]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 409


def test_add_tenant_administrator_promotes_existing_member(admin_client):
    """POST /v1/tenants/{id}/administrators promotes an existing member to administrator."""
    member_row = {**_TENANT_ACCOUNT_ROW, "access_level": "member"}
    promoted_row = {**_TENANT_ACCOUNT_ROW, "access_level": "administrator"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_ACCOUNT_ROW],
            [member_row],  # existing member row
        ]
        mock_db.execute_mutation.return_value = promoted_row
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 201
    assert r.json()["access_level"] == "administrator"


def test_add_tenant_administrator_promote_server_error(admin_client):
    """POST /v1/tenants/{id}/administrators returns 500 when promotion mutation returns None."""
    member_row = {**_TENANT_ACCOUNT_ROW, "access_level": "member"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_ACCOUNT_ROW],
            [member_row],
        ]
        mock_db.execute_mutation.return_value = None
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 500


def test_add_tenant_administrator_server_error(admin_client):
    """POST /v1/tenants/{id}/administrators returns 500 when insert mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = None
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
        )
    assert r.status_code == 500


def test_add_tenant_administrator_by_email_success(admin_client):
    """POST /v1/tenants/{id}/administrators with email resolves account and adds administrator."""
    email_lookup_row = {"id": _ACCOUNT_ROW["id"]}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [email_lookup_row],
            [],
        ]
        mock_db.execute_mutation.return_value = _TENANT_ADMIN_ROW
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"email": _ACCOUNT_ROW["email"]},
        )
    assert r.status_code == 201
    assert r.json()["access_level"] == "administrator"


def test_add_tenant_administrator_by_email_not_found(admin_client):
    """POST /v1/tenants/{id}/administrators returns 404 when email does not match any account."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [],  # email lookup → no result
        ]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"email": "unknown@example.com"},
        )
    assert r.status_code == 404
    assert "email" in r.json()["detail"].lower()


def test_add_tenant_administrator_no_identifier_returns_422(admin_client):
    """POST /v1/tenants/{id}/administrators returns 422 when neither account_id nor email is provided."""
    r = admin_client.post(
        f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
        json={},
    )
    assert r.status_code == 422


def test_add_tenant_administrator_mismatched_tenant_id(admin_client):
    """POST /v1/tenants/{id}/administrators returns 400 when payload tenant_id differs from path."""
    different_tenant_id = "00000000-0000-0000-0000-000000000099"
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = admin_client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={
                "tenant_id": different_tenant_id,
                "account_id": _ACCOUNT_ROW["id"],
            },
        )
    assert r.status_code == 400


def test_remove_tenant_administrator_success(admin_client):
    """DELETE /v1/tenants/{id}/administrators/{account_id} removes administrator (admin)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ADMIN_ROW]
        mock_db.execute_mutation.return_value = None
        r = admin_client.delete(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators/{_ACCOUNT_ROW['id']}"
        )
    assert r.status_code == 204


def test_remove_tenant_administrator_requires_auth(client):
    """DELETE /v1/tenants/{id}/administrators/{account_id} returns 401 with no credentials."""
    r = client.delete(
        f"/v1/tenants/{_TENANT_ROW['id']}/administrators/{_ACCOUNT_ROW['id']}"
    )
    assert r.status_code == 401


def test_remove_tenant_administrator_not_found(admin_client):
    """DELETE /v1/tenants/{id}/administrators/{account_id} returns 404 when not an administrator."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.delete(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators/{_ACCOUNT_ROW['id']}"
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# GH-18: Auth enforcement on previously-unprotected mutation routes
# ---------------------------------------------------------------------------


def test_deactivate_user_requires_auth(client):
    """DELETE /v1/users/{id} returns 401 with no credentials."""
    r = client.delete(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 401


def test_update_tenant_requires_auth(client):
    """PUT /v1/tenants/{id} returns 401 with no credentials."""
    r = client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"name": "Ghost"})
    assert r.status_code == 401


def test_deactivate_tenant_requires_auth(client):
    """DELETE /v1/tenants/{id} returns 401 with no credentials."""
    r = client.delete(f"/v1/tenants/{_TENANT_ROW['id']}")
    assert r.status_code == 401


def test_remove_tenant_member_requires_auth(client):
    """DELETE /v1/tenants/{id}/members/{account_id} returns 401 with no credentials."""
    r = client.delete(
        f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}"
    )
    assert r.status_code == 401


def test_update_tenant_member_requires_auth(client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 401 with no credentials."""
    r = client.put(
        f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
        json={"access_level": "administrator"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GH-18: 403 tests — authenticated-but-not-admin for every admin-only route
# ---------------------------------------------------------------------------

def _non_admin_headers() -> dict:
    """Return auth headers that decode to a valid but non-admin JWT caller."""
    return {"Authorization": "Bearer valid.jwt.token"}


def _patch_non_admin():
    """Context manager that patches JWT decoding to return a non-admin caller."""
    from unittest.mock import patch as _patch
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        _patch(
            "app.auth.decode_jwt",
            return_value={
                "sub": "member-uid",
                "email": "member@example.com",
                "is_admin": False,
            },
        )
    )
    stack.enter_context(_patch("app.auth._is_platform_admin", return_value=False))
    return stack


def test_update_user_non_admin_returns_403(client):
    """PUT /v1/users/{id} returns 403 when caller is authenticated but not an admin."""
    with _patch_non_admin():
        r = client.put(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            json={"name": "Ghost"},
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_deactivate_user_non_admin_returns_403(client):
    """DELETE /v1/users/{id} returns 403 when caller is authenticated but not an admin."""
    with _patch_non_admin():
        r = client.delete(
            f"/v1/users/{_ACCOUNT_ROW['id']}",
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_add_tenant_member_non_admin_returns_403(client):
    """POST /v1/tenants/{id}/members returns 403 when caller is authenticated but not an admin."""
    with _patch_non_admin():
        r = client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_update_tenant_non_admin_returns_403(client):
    """PUT /v1/tenants/{id} returns 403 when caller is authenticated but not an admin."""
    with _patch_non_admin():
        r = client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}",
            json={"name": "Ghost"},
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_deactivate_tenant_non_admin_returns_403(client):
    """DELETE /v1/tenants/{id} returns 403 when caller is authenticated but not an admin."""
    with _patch_non_admin():
        r = client.delete(
            f"/v1/tenants/{_TENANT_ROW['id']}",
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_remove_tenant_member_non_admin_returns_403(client):
    """DELETE /v1/tenants/{id}/members/{account_id} returns 403 when caller is not an admin."""
    with _patch_non_admin():
        r = client.delete(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_update_tenant_member_non_admin_returns_403(client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 403 when caller is not an admin."""
    with _patch_non_admin():
        r = client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"access_level": "administrator"},
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_add_tenant_administrator_non_admin_returns_403(client):
    """POST /v1/tenants/{id}/administrators returns 403 when caller is not an admin."""
    with _patch_non_admin():
        r = client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators",
            json={"account_id": _ACCOUNT_ROW["id"]},
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


def test_remove_tenant_administrator_non_admin_returns_403(client):
    """DELETE /v1/tenants/{id}/administrators/{account_id} returns 403 when caller is not an admin."""
    with _patch_non_admin():
        r = client.delete(
            f"/v1/tenants/{_TENANT_ROW['id']}/administrators/{_ACCOUNT_ROW['id']}",
            headers=_non_admin_headers(),
        )
    assert r.status_code == 403


