"""Tests for objectified-rest FastAPI app and schemas."""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_admin
from app.schemas import (
    AccountSchema,
    TenantSchema,
    TenantAccessLevel,
    VersionVisibility,
)

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
}
_TENANT_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000002",
    "name": "Acme",
    "description": "Acme Corp",
    "slug": "acme",
    "enabled": True,
    "metadata": {},
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


# ---------------------------------------------------------------------------
# Core app tests
# ---------------------------------------------------------------------------


def test_root(client):
    """Root returns message and v1 links."""
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "Objectified REST API"
    assert "v1" in data
    assert data["v1"]["users"] == "/v1/users"
    assert data["v1"]["tenants"] == "/v1/tenants"


def test_health(client):
    """Health check returns ok."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


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
         patch("app.v1_routes.db") as mock_db:
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
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = admin_client.get("/v1/users")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["email"] == "alice@example.com"


def test_list_users_empty(admin_client):
    """GET /v1/users returns empty list when no accounts exist (admin)."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = admin_client.get("/v1/users")
    assert r.status_code == 200
    assert r.json() == []


def test_get_user_by_id_found(client):
    """GET /v1/users/{id} returns account when found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = client.get(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == _ACCOUNT_ROW["id"]


def test_get_user_by_id_not_found(client):
    """GET /v1/users/{id} returns 404 when account not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/users/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


def test_create_user_success(client):
    """POST /v1/users creates a new user and returns 201."""
    with patch("app.v1_routes.db") as mock_db:
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
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = client.post(
            "/v1/users",
            json={"name": "Alice", "email": "alice@example.com", "password": "secret123"},
        )
    assert r.status_code == 409


def test_update_user_success(client):
    """PUT /v1/users/{id} updates a user and returns updated account."""
    updated = {**_ACCOUNT_ROW, "name": "Alice Updated"}
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = client.put(f"/v1/users/{_ACCOUNT_ROW['id']}", json={"name": "Alice Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Alice Updated"


def test_update_user_not_found(client):
    """PUT /v1/users/{id} returns 404 when user does not exist."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.put("/v1/users/00000000-0000-0000-0000-000000000099", json={"name": "Ghost"})
    assert r.status_code == 404


def test_update_user_no_fields(client):
    """PUT /v1/users/{id} returns 400 when no fields are provided."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        r = client.put(f"/v1/users/{_ACCOUNT_ROW['id']}", json={})
    assert r.status_code == 400


def test_deactivate_user_success(client):
    """DELETE /v1/users/{id} soft-deletes user and returns 204."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = None
        r = client.delete(f"/v1/users/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 204


def test_deactivate_user_not_found(client):
    """DELETE /v1/users/{id} returns 404 when user does not exist."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.delete("/v1/users/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant routes
# ---------------------------------------------------------------------------


def test_list_tenants_returns_tenants(client):
    """GET /v1/tenants returns list of tenants."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.get("/v1/tenants")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["slug"] == "acme"


def test_get_tenant_by_id_found(client):
    """GET /v1/tenants/{id} returns tenant when found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}")
    assert r.status_code == 200
    assert r.json()["slug"] == "acme"


def test_get_tenant_by_id_not_found(client):
    """GET /v1/tenants/{id} returns 404 when not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


def test_create_tenant_success(client):
    """POST /v1/tenants creates a tenant and returns 201."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        mock_db.execute_mutation.return_value = _TENANT_ROW
        r = client.post("/v1/tenants", json={"name": "Acme", "description": "Acme Corp", "slug": "acme"})
    assert r.status_code == 201
    assert r.json()["slug"] == "acme"


def test_create_tenant_duplicate_slug(client):
    """POST /v1/tenants returns 409 when slug already exists."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.post("/v1/tenants", json={"name": "Acme2", "description": "", "slug": "acme"})
    assert r.status_code == 409


def test_update_tenant_success(client):
    """PUT /v1/tenants/{id} updates tenant."""
    updated = {**_TENANT_ROW, "name": "Acme Updated"}
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={"name": "Acme Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Acme Updated"


def test_update_tenant_not_found(client):
    """PUT /v1/tenants/{id} returns 404 when tenant not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.put("/v1/tenants/00000000-0000-0000-0000-000000000099", json={"name": "Ghost"})
    assert r.status_code == 404


def test_update_tenant_no_fields(client):
    """PUT /v1/tenants/{id} returns 400 when no fields are provided."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        r = client.put(f"/v1/tenants/{_TENANT_ROW['id']}", json={})
    assert r.status_code == 400


def test_deactivate_tenant_success(client):
    """DELETE /v1/tenants/{id} soft-deletes tenant and returns 204."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ROW]
        mock_db.execute_mutation.return_value = None
        r = client.delete(f"/v1/tenants/{_TENANT_ROW['id']}")
    assert r.status_code == 204


def test_deactivate_tenant_not_found(client):
    """DELETE /v1/tenants/{id} returns 404 when tenant not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.delete("/v1/tenants/00000000-0000-0000-0000-000000000099")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant member routes
# ---------------------------------------------------------------------------


def test_list_tenant_members_found(client):
    """GET /v1/tenants/{id}/members returns members."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_TENANT_ACCOUNT_ROW]]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}/members")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["access_level"] == "member"


def test_list_tenant_members_tenant_not_found(client):
    """GET /v1/tenants/{id}/members returns 404 when tenant not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099/members")
    assert r.status_code == 404


def test_add_tenant_member_success(client):
    """POST /v1/tenants/{id}/members adds a member."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], []]
        mock_db.execute_mutation.return_value = _TENANT_ACCOUNT_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
        )
    assert r.status_code == 201
    assert r.json()["account_id"] == _ACCOUNT_ROW["id"]


def test_add_tenant_member_duplicate(client):
    """POST /v1/tenants/{id}/members returns 409 when already a member."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [_ACCOUNT_ROW], [_TENANT_ACCOUNT_ROW]]
        r = client.post(
            f"/v1/tenants/{_TENANT_ROW['id']}/members",
            json={"tenant_id": _TENANT_ROW["id"], "account_id": _ACCOUNT_ROW["id"], "access_level": "member"},
        )
    assert r.status_code == 409


def test_remove_tenant_member_success(client):
    """DELETE /v1/tenants/{id}/members/{account_id} removes member."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = None
        r = client.delete(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 204


def test_remove_tenant_member_not_found(client):
    """DELETE /v1/tenants/{id}/members/{account_id} returns 404 when not a member."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.delete(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Tenant administrator routes
# ---------------------------------------------------------------------------


def test_list_tenant_administrators_found(client):
    """GET /v1/tenants/{id}/administrators returns admins."""
    admin_row = {**_TENANT_ACCOUNT_ROW, "access_level": "administrator"}
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.side_effect = [[_TENANT_ROW], [admin_row]]
        r = client.get(f"/v1/tenants/{_TENANT_ROW['id']}/administrators")
    assert r.status_code == 200
    assert r.json()[0]["access_level"] == "administrator"


def test_list_tenant_administrators_tenant_not_found(client):
    """GET /v1/tenants/{id}/administrators returns 404 when tenant not found."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000099/administrators")
    assert r.status_code == 404


def test_update_tenant_member_success(client):
    """PUT /v1/tenants/{id}/members/{account_id} updates access level."""
    updated = {**_TENANT_ACCOUNT_ROW, "access_level": "administrator"}
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}",
            json={"access_level": "administrator"},
        )
    assert r.status_code == 200
    assert r.json()["access_level"] == "administrator"


def test_update_tenant_member_no_fields(client):
    """PUT /v1/tenants/{id}/members/{account_id} returns 400 with empty body."""
    with patch("app.v1_routes.db") as mock_db:
        mock_db.execute_query.return_value = [_TENANT_ACCOUNT_ROW]
        r = client.put(f"/v1/tenants/{_TENANT_ROW['id']}/members/{_ACCOUNT_ROW['id']}", json={})
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
