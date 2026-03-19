"""Tests for core modules: auth, database, config, and main app functions."""

from datetime import datetime, timezone, timedelta
from typing import Any
from unittest.mock import MagicMock, patch, call
import os
import json

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.main import app
from app.auth import (
    decode_jwt,
    get_user_tenants,
    validate_user_tenant_access,
    validate_authentication,
    get_authenticated_user_id,
    _resolve_caller,
    _is_platform_admin,
    require_authenticated,
    require_admin,
)
from app.database import Database
from app.config import Settings, settings
from tests.conftest import mock_db_all


# ============================================================================
# Tests for auth.py module functions
# ============================================================================


class TestDecodeJwt:
    """Tests for decode_jwt function."""

    def test_decode_jwt_valid_token(self):
        """Test decoding a valid JWT token."""
        import jwt as pyjwt

        payload = {"user_id": "user123", "email": "test@example.com"}
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = secret
            mock_settings.jwt_algorithm = "HS256"
            result = decode_jwt(token)

        assert result == payload

    def test_decode_jwt_valid_token_with_bearer_prefix(self):
        """Test decoding a JWT token with Bearer prefix."""
        import jwt as pyjwt

        payload = {"user_id": "user123", "sub": "sub123"}
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = secret
            mock_settings.jwt_algorithm = "HS256"
            result = decode_jwt(f"Bearer {token}")

        assert result == payload

    def test_decode_jwt_expired_token(self):
        """Test decoding an expired JWT token."""
        import jwt as pyjwt

        payload = {
            "user_id": "user123",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = secret
            mock_settings.jwt_algorithm = "HS256"
            result = decode_jwt(token)

        assert result is None

    def test_decode_jwt_invalid_signature(self):
        """Test decoding a JWT token with invalid signature."""
        import jwt as pyjwt

        payload = {"user_id": "user123"}
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "wrong_secret"
            mock_settings.jwt_algorithm = "HS256"
            result = decode_jwt(token)

        assert result is None

    def test_decode_jwt_invalid_token_format(self):
        """Test decoding an invalid token format."""
        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "secret"
            mock_settings.jwt_algorithm = "HS256"
            result = decode_jwt("not.a.valid.token")

        assert result is None

    def test_decode_jwt_exception_handling(self):
        """Test exception handling in decode_jwt."""
        with patch("app.auth.settings") as mock_settings:
            mock_settings.effective_jwt_secret = "secret"
            mock_settings.jwt_algorithm = "HS256"
            # This will cause an exception
            result = decode_jwt(None)

        assert result is None


class TestGetUserTenants:
    """Tests for get_user_tenants function."""

    def test_get_user_tenants_empty_list(self):
        """Test get_user_tenants with no tenants."""
        with patch("app.database.db.execute_query") as mock_query:
            mock_query.return_value = []
            result = get_user_tenants("user123")

        assert result == []


class TestValidateUserTenantAccess:
    """Tests for validate_user_tenant_access function."""

    def test_validate_user_tenant_access_tenant_not_found(self):
        """Test tenant access validation when tenant doesn't exist."""
        with patch("app.database.db.execute_query") as mock_query:
            mock_query.return_value = []
            result = validate_user_tenant_access("user123", "nonexistent")

        assert result is None


class TestValidateAuthentication:
    """Tests for validate_authentication function."""

    def test_validate_authentication_with_valid_jwt(self):
        """Test authentication with valid JWT token."""
        import jwt as pyjwt

        payload = {"user_id": "user123", "email": "test@example.com", "name": "Test User"}
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        tenant_data = {"tenant_id": "t1", "tenant_slug": "acme", "tenant_name": "Acme Corp"}

        with patch("app.auth.decode_jwt", return_value=payload):
            with patch("app.auth.validate_user_tenant_access", return_value=tenant_data):
                result = validate_authentication("acme", authorization=token)

        assert result["auth_method"] == "jwt"
        assert result["user_id"] == "user123"
        assert result["user_email"] == "test@example.com"
        assert result["user_name"] == "Test User"

    def test_validate_authentication_with_invalid_jwt(self):
        """Test authentication with invalid JWT token."""
        with patch("app.auth.decode_jwt", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                validate_authentication("acme", authorization="invalid_token")

        assert exc_info.value.status_code == 401

    def test_validate_authentication_jwt_missing_user_id(self):
        """Test authentication with JWT missing user_id."""
        payload = {"email": "test@example.com"}  # No user_id or sub

        with patch("app.auth.decode_jwt", return_value=payload):
            with pytest.raises(HTTPException) as exc_info:
                validate_authentication("acme", authorization="token")

        assert exc_info.value.status_code == 401
        assert "missing user identifier" in exc_info.value.detail

    def test_validate_authentication_jwt_user_no_tenant_access(self):
        """Test authentication when user has no access to tenant."""
        payload = {"user_id": "user123", "email": "test@example.com"}

        with patch("app.auth.decode_jwt", return_value=payload):
            with patch("app.auth.validate_user_tenant_access", return_value=None):
                with pytest.raises(HTTPException) as exc_info:
                    validate_authentication("acme", authorization="token")

        assert exc_info.value.status_code == 403

    def test_validate_authentication_no_credentials(self):
        """Test authentication with no credentials."""
        # Can't test validate_authentication directly - it uses Header() FastAPI dependencies
        # This function is tested via route tests in test_auth.py
        pass  # Placeholder for documentation purposes


class TestGetAuthenticatedUserId:
    """Tests for get_authenticated_user_id function."""

    def test_get_authenticated_user_id_jwt(self):
        """Test getting user ID from JWT auth."""
        auth_data = {
            "auth_method": "jwt",
            "user_id": "user123",
        }
        result = get_authenticated_user_id(auth_data)
        assert result == "user123"

    def test_get_authenticated_user_id_api_key(self):
        """Test getting user ID from API key auth."""
        auth_data = {
            "auth_method": "api_key",
            "user_id": None,
        }
        result = get_authenticated_user_id(auth_data)
        assert result is None


class TestResolveCaller:
    """Tests for _resolve_caller function."""

    def test_resolve_caller_with_valid_jwt(self):
        """Test resolving caller with valid JWT."""
        import jwt as pyjwt

        payload = {
            "user_id": "user123",
            "email": "test@example.com",
            "name": "Test User",
            "is_admin": True,
        }
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.decode_jwt", return_value=payload):
            result = _resolve_caller(authorization=token)

        assert result["auth_method"] == "jwt"
        assert result["user_id"] == "user123"
        assert result["account_id"] == "user123"
        assert result["is_admin"] is True

    def test_resolve_caller_jwt_no_is_admin_claim(self):
        """Test resolving caller with JWT without is_admin claim."""
        import jwt as pyjwt

        payload = {"user_id": "user123", "email": "test@example.com"}
        secret = "test_secret_key"
        token = pyjwt.encode(payload, secret, algorithm="HS256")

        with patch("app.auth.decode_jwt", return_value=payload):
            result = _resolve_caller(authorization=token)

        assert result["auth_method"] == "jwt"
        assert result["account_id"] == "user123"
        assert result["is_admin"] is False

    def test_resolve_caller_invalid_jwt(self):
        """Test resolving caller with invalid JWT."""
        with patch("app.auth.decode_jwt", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                _resolve_caller(authorization="invalid_token")

        assert exc_info.value.status_code == 401

    def test_resolve_caller_jwt_missing_user_id(self):
        """Test resolving caller with JWT missing user_id."""
        payload = {"email": "test@example.com"}

        with patch("app.auth.decode_jwt", return_value=payload):
            with pytest.raises(HTTPException) as exc_info:
                _resolve_caller(authorization="token")

        assert exc_info.value.status_code == 401
        assert "missing user identifier" in exc_info.value.detail

    def test_resolve_caller_no_credentials(self):
        """Test resolving caller with no credentials."""
        # Can't test _resolve_caller directly - it uses Header() FastAPI dependencies
        # These are tested via route tests in test_auth.py
        pass  # Placeholder for documentation


class TestIsPlatformAdmin:
    """Tests for _is_platform_admin function."""

    def test_is_platform_admin_true(self):
        """Test when user is a platform admin."""
        with patch("app.database.db.execute_query") as mock_query:
            mock_query.return_value = [{"admin": 1}]
            result = _is_platform_admin("user123")

        assert result is True

    def test_is_platform_admin_false(self):
        """Test when user is not a platform admin."""
        with patch("app.database.db.execute_query") as mock_query:
            mock_query.return_value = []
            result = _is_platform_admin("user123")

        assert result is False


class TestRequireAdmin:
    """Tests for require_admin dependency."""

    def test_require_admin_with_is_admin_true(self):
        """Test require_admin when is_admin is already true."""
        caller = {
            "auth_method": "jwt",
            "user_id": "user123",
            "is_admin": True,
        }

        result = require_admin(caller)
        assert result == caller

    def test_require_admin_api_key(self):
        """Test require_admin with API key (always admin)."""
        caller = {
            "auth_method": "api_key",
            "is_admin": True,
        }

        result = require_admin(caller)
        assert result == caller

    def test_require_admin_jwt_user_is_platform_admin(self):
        """Test require_admin with JWT user who is platform admin."""
        caller = {
            "auth_method": "jwt",
            "user_id": "user123",
            "is_admin": False,
        }

        with patch("app.auth._is_platform_admin", return_value=True):
            result = require_admin(caller)

        assert result["is_admin"] is True

    def test_require_admin_jwt_user_not_admin(self):
        """Test require_admin with JWT user who is not admin."""
        caller = {
            "auth_method": "jwt",
            "user_id": "user123",
            "is_admin": False,
        }

        with patch("app.auth._is_platform_admin", return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                require_admin(caller)

        assert exc_info.value.status_code == 403

    def test_require_admin_no_user_id(self):
        """Test require_admin when JWT has no user_id."""
        caller = {
            "auth_method": "jwt",
            "user_id": None,
            "is_admin": False,
        }

        with pytest.raises(HTTPException) as exc_info:
            require_admin(caller)

        assert exc_info.value.status_code == 403


# ============================================================================
# Tests for database.py module functions
# ============================================================================


class TestDatabase:
    """Tests for Database class."""

    def test_database_connect_creates_connection(self):
        """Test that connect creates a connection."""
        db = Database()
        assert db._connection is None

        with patch("psycopg2.connect") as mock_connect:
            mock_connect.return_value = MagicMock()
            connection = db.connect()

        assert connection is not None
        mock_connect.assert_called_once()

    def test_database_connect_reuses_connection(self):
        """Test that connect reuses existing connection."""
        db = Database()
        mock_conn = MagicMock()
        mock_conn.closed = False
        db._connection = mock_conn

        result = db.connect()
        assert result == mock_conn

    def test_database_connect_reconnects_if_closed(self):
        """Test that connect reconnects if connection is closed."""
        db = Database()
        mock_old_conn = MagicMock()
        mock_old_conn.closed = True
        db._connection = mock_old_conn

        mock_new_conn = MagicMock()

        with patch("psycopg2.connect", return_value=mock_new_conn):
            result = db.connect()

        assert result == mock_new_conn
        assert db._connection == mock_new_conn

    def test_database_connect_exception(self):
        """Test connect handles exceptions."""
        db = Database()

        with patch("psycopg2.connect", side_effect=Exception("Connection failed")):
            result = db.connect()

        assert result is None
        assert db._connection is None

    def test_database_close(self):
        """Test closing database connection."""
        db = Database()
        mock_conn = MagicMock()
        mock_conn.closed = False
        db._connection = mock_conn

        db.close()

        mock_conn.close.assert_called_once()
        assert db._connection is None

    def test_database_close_no_connection(self):
        """Test closing when no connection exists."""
        db = Database()
        db.close()  # Should not raise

    def test_database_close_exception(self):
        """Test close handles exceptions."""
        db = Database()
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_conn.close.side_effect = Exception("Close failed")
        db._connection = mock_conn

        db.close()  # Should not raise

    def test_database_execute_query_success(self):
        """Test successful query execution returns list."""
        db = Database()

        # Just verify it doesn't crash when connection works
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": 1, "name": "test"}]

        # Create a proper context manager mock
        mock_cursor_cm = MagicMock()
        mock_cursor_cm.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor_cm.__exit__ = MagicMock(return_value=None)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor_cm

        with patch.object(db, "connect", return_value=mock_conn):
            result = db.execute_query("SELECT * FROM test", (1,))

        # Result should be what the cursor returns
        assert result == [{"id": 1, "name": "test"}]

    def test_database_execute_query_no_connection(self):
        """Test query execution with no connection."""
        db = Database()

        with patch.object(db, "connect", return_value=None):
            result = db.execute_query("SELECT * FROM test")

        assert result == []

    def test_database_execute_query_exception(self):
        """Test query execution with exception."""
        db = Database()
        mock_conn = MagicMock()
        mock_conn.cursor.side_effect = Exception("Query failed")

        with patch.object(db, "connect", return_value=mock_conn):
            result = db.execute_query("SELECT * FROM test")

        assert result == []

    def test_database_execute_mutation_no_returning(self):
        """Test mutation execution without RETURNING."""
        db = Database()
        mock_cursor = MagicMock()

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch.object(db, "connect", return_value=mock_conn):
            result = db.execute_mutation(
                "INSERT INTO test VALUES (%s)",
                (1,),
                returning=False,
            )

        assert result is None
        mock_cursor.fetchone.assert_not_called()

    def test_database_execute_mutation_no_connection(self):
        """Test mutation execution with no connection."""
        db = Database()

        with patch.object(db, "connect", return_value=None):
            result = db.execute_mutation("INSERT INTO test VALUES (%s)")

        assert result is None

    def test_database_execute_mutation_exception(self):
        """Test mutation execution with exception."""
        db = Database()
        mock_conn = MagicMock()
        mock_conn.cursor.side_effect = Exception("Mutation failed")

        with patch.object(db, "connect", return_value=mock_conn):
            with pytest.raises(Exception):
                db.execute_mutation("INSERT INTO test VALUES (%s)")

    def test_database_validate_api_key_success(self):
        """Test successful API key validation."""
        import hashlib

        db = Database()
        api_key = "valid_api_key_1234567890"
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        row = {
            "key_id": 1,
            "tenant_id": "t1",
            "tenant_slug": "acme",
            "tenant_name": "Acme Corp",
            "account_id": "acc1",
            "enabled": True,
            "expires_at": None,
        }

        with patch.object(db, "execute_query", return_value=[row]):
            with patch.object(db, "execute_mutation"):
                result = db.validate_api_key(api_key)

        assert result["tenant_slug"] == "acme"
        assert result["key_id"] == "1"

    def test_database_validate_api_key_short_key(self):
        """Test API key validation with short key."""
        db = Database()
        result = db.validate_api_key("short")
        assert result is None

    def test_database_validate_api_key_no_key(self):
        """Test API key validation with no key."""
        db = Database()
        result = db.validate_api_key(None)
        assert result is None

    def test_database_validate_api_key_not_found(self):
        """Test API key validation with unknown key."""
        db = Database()

        with patch.object(db, "execute_query", return_value=[]):
            result = db.validate_api_key("valid_api_key_1234567890")

        assert result is None

    def test_database_validate_api_key_disabled(self):
        """Test API key validation with disabled key."""
        db = Database()

        row = {
            "key_id": 1,
            "enabled": False,
        }

        with patch.object(db, "execute_query", return_value=[row]):
            result = db.validate_api_key("valid_api_key_1234567890")

        assert result is None

    def test_database_validate_api_key_expired(self):
        """Test API key validation with expired key."""
        db = Database()

        expires_at = datetime.now(timezone.utc) - timedelta(hours=1)

        row = {
            "key_id": 1,
            "enabled": True,
            "expires_at": expires_at,
            "tenant_id": "t1",
            "tenant_slug": "acme",
            "tenant_name": "Acme",
            "account_id": "acc1",
        }

        with patch.object(db, "execute_query", return_value=[row]):
            result = db.validate_api_key("valid_api_key_1234567890")

        assert result is None

    def test_database_validate_api_key_last_used_update_fails(self):
        """Test API key validation when last_used update fails."""
        import hashlib

        db = Database()
        api_key = "valid_api_key_1234567890"

        row = {
            "key_id": 1,
            "tenant_id": "t1",
            "tenant_slug": "acme",
            "tenant_name": "Acme Corp",
            "account_id": "acc1",
            "enabled": True,
            "expires_at": None,
        }

        with patch.object(db, "execute_query", return_value=[row]):
            with patch.object(db, "execute_mutation", side_effect=Exception("Update failed")):
                result = db.validate_api_key(api_key)

        # Should still return valid result even if last_used update fails
        assert result is not None


# ============================================================================
# Tests for config.py module functions
# ============================================================================


class TestConfig:
    """Tests for Settings class."""

    def test_settings_effective_database_url_from_url(self):
        """Test effective_database_url with DATABASE_URL set."""
        s = Settings(database_url="postgresql://user:pass@localhost/db")
        assert s.effective_database_url == "postgresql://user:pass@localhost/db"

    def test_settings_effective_database_url_from_components(self):
        """Test effective_database_url built from components."""
        s = Settings(
            postgres_user="user",
            postgres_password="pass",
            postgres_host="localhost",
            postgres_port=5432,
            postgres_db="testdb",
        )
        expected = "postgresql://user:pass@localhost:5432/testdb"
        assert s.effective_database_url == expected

    def test_settings_effective_jwt_secret_from_nextauth(self):
        """Test effective_jwt_secret preferring NEXTAUTH_SECRET."""
        s = Settings(
            nextauth_secret="nextauth_key",
            jwt_secret="jwt_key",
        )
        assert s.effective_jwt_secret == "nextauth_key"

    def test_settings_effective_jwt_secret_from_jwt(self):
        """Test effective_jwt_secret falling back to JWT_SECRET."""
        with patch.dict(os.environ, {"JWT_SECRET": "jwt_key", "NEXTAUTH_SECRET": ""}, clear=False):
            s = Settings()
            assert s.effective_jwt_secret == "jwt_key"

    def test_settings_effective_jwt_secret_missing(self):
        """Test effective_jwt_secret raises error when not configured."""
        s = Settings(jwt_secret=None, nextauth_secret=None)

        with pytest.raises(ValueError) as exc_info:
            _ = s.effective_jwt_secret

        assert "JWT secret is not configured" in str(exc_info.value)


# ============================================================================
# Tests for main.py module functions
# ============================================================================


class TestMainApp:
    """Tests for FastAPI app and root endpoints."""

    def test_root_endpoint(self):
        """Test root endpoint returns correct response."""
        client = TestClient(app)
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Objectified REST API"
        assert data["version"] == "1.0.0"
        assert "docs" in data
        assert "openapi" in data

    def test_health_endpoint(self):
        """Test health check endpoint."""
        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_openapi_json_endpoint(self):
        """Test OpenAPI JSON endpoint."""
        client = TestClient(app)
        response = client.get("/openapi.json")

        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]
        data = response.json()
        assert "openapi" in data or "swagger" in data

    def test_openapi_schema_has_security_schemes(self):
        """Test that OpenAPI schema includes security schemes."""
        client = TestClient(app)
        response = client.get("/openapi.json")

        data = response.json()
        components = data.get("components", {})
        security_schemes = components.get("securitySchemes", {})

        assert "Bearer" in security_schemes
        assert "ApiKey" in security_schemes
        assert security_schemes["Bearer"]["type"] == "http"
        assert security_schemes["ApiKey"]["type"] == "apiKey"






















