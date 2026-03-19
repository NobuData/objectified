"""Tests for tenant SSO provider configuration endpoints."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.main import app
from app.auth import require_authenticated, require_admin
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)

_ADMIN_CALLER = {"auth_method": "jwt", "user_id": "admin-uid", "is_admin": True}
_MEMBER_CALLER = {"auth_method": "jwt", "user_id": "member-uid", "is_admin": False}

_TENANT_ID = "00000000-0000-0000-0000-000000000002"
_PROVIDER_ID = "00000000-0000-0000-0000-000000000123"

_OIDC_ROW: dict[str, Any] = {
    "id": _PROVIDER_ID,
    "tenant_id": _TENANT_ID,
    "provider_type": "oidc",
    "name": "Okta",
    "enabled": True,
    "oidc_discovery": {"issuer": "https://idp.example.com"},
    "saml_metadata_xml": None,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    return TestClient(app)


@pytest.fixture
def member_client():
    app.dependency_overrides[require_authenticated] = lambda: _MEMBER_CALLER
    app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client():
    app.dependency_overrides[require_authenticated] = lambda: _ADMIN_CALLER
    app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestListSsoProviders:
    def test_list_requires_auth(self, client):
        r = client.get(f"/v1/tenants/{_TENANT_ID}/sso/providers")
        assert r.status_code == 401

    def test_list_success_member(self, member_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [{"1": 1}],  # membership check
                [_OIDC_ROW],  # list rows
            ]
            r = member_client.get(f"/v1/tenants/{_TENANT_ID}/sso/providers")
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body) == 1
        assert body[0]["id"] == _PROVIDER_ID
        assert body[0]["provider_type"] == "oidc"

    def test_list_admin_skips_membership_check(self, admin_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [_OIDC_ROW],  # list rows
            ]
            r = admin_client.get(f"/v1/tenants/{_TENANT_ID}/sso/providers")
        assert r.status_code == 200
        assert len(r.json()) == 1


class TestCreateSsoProvider:
    def test_create_admin_only(self, member_client):
        app.dependency_overrides[require_admin] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin privileges required.")
        )
        try:
            r = member_client.post(
                f"/v1/tenants/{_TENANT_ID}/sso/providers",
                json={
                    "provider_type": "oidc",
                    "name": "Okta",
                    "oidc_discovery": {"issuer": "https://idp.example.com"},
                },
            )
        finally:
            app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
        assert r.status_code == 403

    def test_create_oidc_success(self, admin_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [],  # uniqueness check
            ]
            mock_db.execute_mutation.return_value = _OIDC_ROW
            r = admin_client.post(
                f"/v1/tenants/{_TENANT_ID}/sso/providers",
                json={
                    "provider_type": "oidc",
                    "name": "Okta",
                    "enabled": True,
                    "oidc_discovery": {"issuer": "https://idp.example.com"},
                    "metadata": {},
                },
            )
        assert r.status_code == 201, r.text
        assert r.json()["id"] == _PROVIDER_ID

    def test_create_oidc_missing_discovery_returns_422(self, admin_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [[{"id": _TENANT_ID}]]
            r = admin_client.post(
                f"/v1/tenants/{_TENANT_ID}/sso/providers",
                json={"provider_type": "oidc", "name": "Okta"},
            )
        assert r.status_code == 422


class TestGetSsoProvider:
    def test_get_success_member(self, member_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [{"1": 1}],  # membership check
                [_OIDC_ROW],  # get row
            ]
            r = member_client.get(f"/v1/tenants/{_TENANT_ID}/sso/providers/{_PROVIDER_ID}")
        assert r.status_code == 200
        assert r.json()["id"] == _PROVIDER_ID

    def test_get_not_found(self, member_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [{"1": 1}],
                [],
            ]
            r = member_client.get(f"/v1/tenants/{_TENANT_ID}/sso/providers/{_PROVIDER_ID}")
        assert r.status_code == 404


class TestUpdateAndDelete:
    def test_update_admin_only(self, member_client):
        app.dependency_overrides[require_admin] = lambda: (_ for _ in ()).throw(
            HTTPException(status_code=403, detail="Admin privileges required.")
        )
        try:
            r = member_client.put(
                f"/v1/tenants/{_TENANT_ID}/sso/providers/{_PROVIDER_ID}",
                json={"enabled": False},
            )
        finally:
            app.dependency_overrides[require_admin] = lambda: _ADMIN_CALLER
        assert r.status_code == 403

    def test_update_success(self, admin_client):
        updated = {**_OIDC_ROW, "enabled": False}
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [{"id": _PROVIDER_ID, "provider_type": "oidc"}],  # provider exists
            ]
            mock_db.execute_mutation.return_value = updated
            r = admin_client.put(
                f"/v1/tenants/{_TENANT_ID}/sso/providers/{_PROVIDER_ID}",
                json={"enabled": False},
            )
        assert r.status_code == 200, r.text
        assert r.json()["enabled"] is False

    def test_delete_success(self, admin_client):
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # tenant exists
                [{"id": _PROVIDER_ID}],  # provider exists
            ]
            mock_db.execute_mutation.return_value = None
            r = admin_client.delete(f"/v1/tenants/{_TENANT_ID}/sso/providers/{_PROVIDER_ID}")
        assert r.status_code == 204, r.text
