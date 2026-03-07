"""Tests for objectified-rest FastAPI app and schemas."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import (
    AccountSchema,
    TenantSchema,
    TenantAccessLevel,
    VersionVisibility,
)


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


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


def test_v1_users_stub_returns_501(client):
    """Stub list users returns 501."""
    r = client.get("/v1/users")
    assert r.status_code == 501


def test_v1_tenants_stub_returns_501(client):
    """Stub list tenants returns 501."""
    r = client.get("/v1/tenants")
    assert r.status_code == 501


def test_v1_tenants_members_stub_returns_501(client):
    """Stub list tenant members returns 501."""
    r = client.get("/v1/tenants/00000000-0000-0000-0000-000000000000/members")
    assert r.status_code == 501


def test_v1_tenants_administrators_stub_returns_501(client):
    """Stub list tenant administrators returns 501."""
    r = client.get(
        "/v1/tenants/00000000-0000-0000-0000-000000000000/administrators"
    )
    assert r.status_code == 501


def test_account_schema_serialization():
    """AccountSchema can be built and serialized."""
    from datetime import datetime, timezone

    obj = AccountSchema(
        id="00000000-0000-0000-0000-000000000001",
        name="Test",
        email="test@example.com",
        verified=True,
        enabled=True,
        metadata={},
        created_at=datetime.now(timezone.utc),
        updated_at=None,
        deleted_at=None,
    )
    d = obj.model_dump()
    assert d["email"] == "test@example.com"
    assert d["name"] == "Test"


def test_tenant_schema_serialization():
    """TenantSchema can be built and serialized."""
    from datetime import datetime, timezone

    obj = TenantSchema(
        id="00000000-0000-0000-0000-000000000002",
        name="Acme",
        description="Acme tenant",
        slug="acme",
        enabled=True,
        metadata={},
        created_at=datetime.now(timezone.utc),
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
