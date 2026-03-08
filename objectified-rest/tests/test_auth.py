"""Tests for authentication (login) and API key management endpoints.

Covers:
  POST /v1/auth/login
  GET  /v1/tenants/{tenant_id}/api-keys
  POST /v1/tenants/{tenant_id}/api-keys
  DELETE /v1/tenants/{tenant_id}/api-keys/{key_id}
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_authenticated, require_admin
from app.routes.users import _hash_password
from tests.conftest import mock_db_all

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_NOW = datetime.now(timezone.utc)

_ADMIN_CALLER = {"auth_method": "jwt", "user_id": "admin-uid", "is_admin": True}
_MEMBER_CALLER = {"auth_method": "jwt", "user_id": "member-uid", "is_admin": False}

_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001"
_TENANT_ID = "00000000-0000-0000-0000-000000000002"
_KEY_ID = "00000000-0000-0000-0000-000000000099"

_ACCOUNT_ROW: dict[str, Any] = {
    "id": _ACCOUNT_ID,
    "name": "Alice",
    "email": "alice@example.com",
    "password": _hash_password("correctpassword"),
    "verified": True,
    "enabled": True,
}

_TENANT_ROW: dict[str, Any] = {
    "id": _TENANT_ID,
    "name": "Acme",
    "description": "Acme Corp",
    "slug": "acme",
    "enabled": True,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

_API_KEY_ROW: dict[str, Any] = {
    "id": _KEY_ID,
    "tenant_id": _TENANT_ID,
    "account_id": _ACCOUNT_ID,
    "name": "Test key",
    "key_prefix": "ok_abcde",
    "expires_at": None,
    "last_used": None,
    "enabled": True,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    """FastAPI test client — no dependency overrides."""
    app.dependency_overrides.clear()
    return TestClient(app)


@pytest.fixture
def auth_client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _MEMBER_CALLER
    app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client():
    """FastAPI test client with require_authenticated + require_admin overridden as admin."""
    app.dependency_overrides[require_authenticated] = lambda: _ADMIN_CALLER
    app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ===========================================================================
# POST /v1/auth/login
# ===========================================================================


class TestLogin:
    """Tests for POST /v1/auth/login."""

    def test_login_success_returns_token(self, client):
        """Valid credentials return a JWT access token."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = [_ACCOUNT_ROW]
            with patch("app.routes.auth.settings") as mock_settings:
                mock_settings.effective_jwt_secret = "test-secret-that-is-at-least-32-bytes-long"
                mock_settings.jwt_algorithm = "HS256"
                r = client.post(
                    "/v1/auth/login",
                    json={"email": "alice@example.com", "password": "correctpassword"},
                )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["user_id"] == _ACCOUNT_ID
        assert body["email"] == "alice@example.com"
        assert body["name"] == "Alice"
        assert body["expires_in"] == 86400

    def test_login_unknown_email_returns_401(self, client):
        """Unknown email returns 401."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.post(
                "/v1/auth/login",
                json={"email": "nobody@example.com", "password": "pass"},
            )
        assert r.status_code == 401

    def test_login_wrong_password_returns_401(self, client):
        """Wrong password returns 401 (same message to prevent enumeration)."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = [_ACCOUNT_ROW]
            r = client.post(
                "/v1/auth/login",
                json={"email": "alice@example.com", "password": "wrongpassword"},
            )
        assert r.status_code == 401

    def test_login_disabled_account_returns_403(self, client):
        """Disabled account returns 403."""
        disabled_row = {**_ACCOUNT_ROW, "enabled": False}
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = [disabled_row]
            r = client.post(
                "/v1/auth/login",
                json={"email": "alice@example.com", "password": "correctpassword"},
            )
        assert r.status_code == 403

    def test_login_missing_email_returns_422(self, client):
        """Missing required field returns 422."""
        r = client.post("/v1/auth/login", json={"password": "pass"})
        assert r.status_code == 422

    def test_login_missing_password_returns_422(self, client):
        """Missing required field returns 422."""
        r = client.post("/v1/auth/login", json={"email": "alice@example.com"})
        assert r.status_code == 422


# ===========================================================================
# GET /v1/tenants/{tenant_id}/api-keys
# ===========================================================================


class TestListApiKeys:
    """Tests for GET /v1/tenants/{tenant_id}/api-keys."""

    def test_list_api_keys_success(self, auth_client):
        """Returns list of API key metadata for a tenant."""
        with mock_db_all() as mock_db:
            # First call: assert tenant exists
            # Second call: list keys
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [_API_KEY_ROW],         # key list
            ]
            r = auth_client.get(f"/v1/tenants/{_TENANT_ID}/api-keys")
        assert r.status_code == 200, r.text
        keys = r.json()
        assert len(keys) == 1
        assert keys[0]["id"] == _KEY_ID
        assert keys[0]["key_prefix"] == "ok_abcde"
        assert "key_hash" not in keys[0], "raw hash must never be exposed"

    def test_list_api_keys_tenant_not_found(self, auth_client):
        """404 when tenant does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [[]]  # tenant not found
            r = auth_client.get(f"/v1/tenants/{_TENANT_ID}/api-keys")
        assert r.status_code == 404

    def test_list_api_keys_requires_auth(self, client):
        """Unauthenticated request returns 401."""
        r = client.get(f"/v1/tenants/{_TENANT_ID}/api-keys")
        assert r.status_code == 401

    def test_list_api_keys_empty(self, auth_client):
        """Returns empty list when no keys exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [],
            ]
            r = auth_client.get(f"/v1/tenants/{_TENANT_ID}/api-keys")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_api_keys_include_revoked(self, auth_client):
        """include_revoked=true returns revoked keys too."""
        revoked_row = {**_API_KEY_ROW, "deleted_at": _NOW}
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [revoked_row],
            ]
            r = auth_client.get(f"/v1/tenants/{_TENANT_ID}/api-keys?include_revoked=true")
        assert r.status_code == 200
        keys = r.json()
        assert len(keys) == 1
        assert keys[0]["deleted_at"] is not None


# ===========================================================================
# POST /v1/tenants/{tenant_id}/api-keys
# ===========================================================================


class TestCreateApiKey:
    """Tests for POST /v1/tenants/{tenant_id}/api-keys."""

    def test_create_api_key_success(self, auth_client):
        """Successfully creates an API key and returns raw secret once."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],          # tenant exists
                [{"1": 1}],                      # membership check
            ]
            mock_db.execute_mutation.return_value = _API_KEY_ROW
            r = auth_client.post(
                f"/v1/tenants/{_TENANT_ID}/api-keys",
                json={"name": "Test key"},
            )
        assert r.status_code == 201, r.text
        body = r.json()
        assert "raw_key" in body, "raw_key must be present on creation"
        assert body["raw_key"].startswith("ok_"), "key should have ok_ prefix"
        assert body["id"] == _KEY_ID
        assert body["name"] == "Test key"
        assert "key_hash" not in body, "hash must never be exposed"

    def test_create_api_key_tenant_not_found(self, auth_client):
        """404 when tenant does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [[]]
            r = auth_client.post(
                f"/v1/tenants/{_TENANT_ID}/api-keys",
                json={"name": "Key"},
            )
        assert r.status_code == 404

    def test_create_api_key_not_member_returns_403(self, auth_client):
        """403 when the calling account is not a member of the tenant."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [],                     # membership check fails
            ]
            r = auth_client.post(
                f"/v1/tenants/{_TENANT_ID}/api-keys",
                json={"name": "Key"},
            )
        assert r.status_code == 403

    def test_create_api_key_requires_auth(self, client):
        """Unauthenticated request returns 401."""
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/api-keys",
            json={"name": "Key"},
        )
        assert r.status_code == 401

    def test_create_api_key_missing_name_returns_422(self, auth_client):
        """Missing required name field returns 422."""
        r = auth_client.post(f"/v1/tenants/{_TENANT_ID}/api-keys", json={})
        assert r.status_code == 422

    def test_create_api_key_server_error(self, auth_client):
        """500 when database insert fails."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [{"1": 1}],
            ]
            mock_db.execute_mutation.return_value = None
            r = auth_client.post(
                f"/v1/tenants/{_TENANT_ID}/api-keys",
                json={"name": "Key"},
            )
        assert r.status_code == 500

    def test_create_api_key_with_expiry(self, auth_client):
        """API key with explicit expiry date is accepted."""
        expiry_row = {**_API_KEY_ROW, "expires_at": _NOW}
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [{"1": 1}],
            ]
            mock_db.execute_mutation.return_value = expiry_row
            r = auth_client.post(
                f"/v1/tenants/{_TENANT_ID}/api-keys",
                json={"name": "Expiring key", "expires_at": _NOW.isoformat()},
            )
        assert r.status_code == 201
        body = r.json()
        assert body["expires_at"] is not None


# ===========================================================================
# DELETE /v1/tenants/{tenant_id}/api-keys/{key_id}
# ===========================================================================


class TestRevokeApiKey:
    """Tests for DELETE /v1/tenants/{tenant_id}/api-keys/{key_id}."""

    def test_revoke_api_key_owner_success(self):
        """Key owner can revoke their own key."""
        # Override require_authenticated so user_id matches key owner
        caller = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}
        app.dependency_overrides[require_authenticated] = lambda: caller
        try:
            with mock_db_all() as mock_db:
                mock_db.execute_query.side_effect = [
                    [{"id": _TENANT_ID}],   # tenant exists
                    [_API_KEY_ROW],           # key exists
                ]
                mock_db.execute_mutation.return_value = None
                r = TestClient(app).delete(
                    f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}"
                )
        finally:
            app.dependency_overrides.clear()
        assert r.status_code == 204, r.text

    def test_revoke_api_key_admin_success(self, admin_client):
        """Admin can revoke any key."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [_API_KEY_ROW],
            ]
            mock_db.execute_mutation.return_value = None
            r = admin_client.delete(
                f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}"
            )
        assert r.status_code == 204

    def test_revoke_api_key_not_found(self, admin_client):
        """404 when key does not exist or is already revoked."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [],  # key not found
            ]
            r = admin_client.delete(
                f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}"
            )
        assert r.status_code == 404

    def test_revoke_api_key_requires_auth(self, client):
        """Unauthenticated request returns 401."""
        r = client.delete(f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}")
        assert r.status_code == 401

    def test_revoke_api_key_wrong_user_returns_403(self, auth_client):
        """Non-owner, non-admin cannot revoke another user's key."""
        # _MEMBER_CALLER has user_id != _API_KEY_ROW["account_id"]
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [_API_KEY_ROW],  # account_id = _ACCOUNT_ID != "member-uid"
            ]
            r = auth_client.delete(
                f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}"
            )
        assert r.status_code == 403

    def test_revoke_api_key_tenant_not_found(self, auth_client):
        """404 when tenant does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [[]]
            r = auth_client.delete(
                f"/v1/tenants/{_TENANT_ID}/api-keys/{_KEY_ID}"
            )
        assert r.status_code == 404


# ===========================================================================
# validate_api_key in database module
# ===========================================================================


class TestValidateApiKey:
    """Tests for database.Database.validate_api_key."""

    def test_validate_api_key_short_key_returns_none(self):
        """Keys shorter than 12 chars are immediately rejected."""
        from app.database import Database
        db_instance = Database()
        assert db_instance.validate_api_key("short") is None
        assert db_instance.validate_api_key("") is None

    def test_validate_api_key_unknown_hash_returns_none(self):
        """Unknown key hash returns None."""
        from app.database import Database
        db_instance = Database()
        with patch.object(db_instance, "execute_query", return_value=[]):
            result = db_instance.validate_api_key("ok_" + "x" * 40)
        assert result is None

    def test_validate_api_key_disabled_returns_none(self):
        """Disabled key returns None."""
        from app.database import Database
        import datetime
        db_instance = Database()
        row = {
            "key_id": _KEY_ID,
            "tenant_id": _TENANT_ID,
            "account_id": _ACCOUNT_ID,
            "enabled": False,
            "expires_at": None,
            "tenant_slug": "acme",
            "tenant_name": "Acme",
        }
        with patch.object(db_instance, "execute_query", return_value=[row]):
            result = db_instance.validate_api_key("ok_" + "x" * 40)
        assert result is None

    def test_validate_api_key_expired_returns_none(self):
        """Expired key returns None."""
        from app.database import Database
        from datetime import datetime, timezone, timedelta
        db_instance = Database()
        row = {
            "key_id": _KEY_ID,
            "tenant_id": _TENANT_ID,
            "account_id": _ACCOUNT_ID,
            "enabled": True,
            "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
            "tenant_slug": "acme",
            "tenant_name": "Acme",
        }
        with patch.object(db_instance, "execute_query", return_value=[row]):
            with patch.object(db_instance, "execute_mutation", return_value=None):
                result = db_instance.validate_api_key("ok_" + "x" * 40)
        assert result is None

    def test_validate_api_key_valid_returns_data(self):
        """Valid, enabled, non-expired key returns tenant and account info."""
        from app.database import Database
        db_instance = Database()
        row = {
            "key_id": _KEY_ID,
            "tenant_id": _TENANT_ID,
            "account_id": _ACCOUNT_ID,
            "enabled": True,
            "expires_at": None,
            "tenant_slug": "acme",
            "tenant_name": "Acme",
        }
        with patch.object(db_instance, "execute_query", return_value=[row]):
            with patch.object(db_instance, "execute_mutation", return_value=None):
                result = db_instance.validate_api_key("ok_" + "x" * 40)
        assert result is not None
        assert result["tenant_slug"] == "acme"
        assert result["account_id"] == _ACCOUNT_ID


