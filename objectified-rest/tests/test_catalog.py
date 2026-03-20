"""Tests for the schema catalog discovery API (GH-136)."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)
_TENANT_ID = "00000000-0000-0000-0000-000000000010"
_PROJECT_ID = "00000000-0000-0000-0000-000000000020"
_VERSION_ID = "00000000-0000-0000-0000-000000000030"
_CLASS_ID = "00000000-0000-0000-0000-000000000040"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000050"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}


@pytest.fixture
def client():
    """Authenticated test client."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    """Unauthenticated test client (no auth override)."""
    app.dependency_overrides.clear()
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _tenant_row() -> dict[str, Any]:
    return {
        "id": _TENANT_ID,
        "name": "Acme Corp",
        "slug": "acme",
        "description": "Test tenant",
    }


def _project_row(tenant_id: str = _TENANT_ID) -> dict[str, Any]:
    return {
        "id": _PROJECT_ID,
        "name": "Main Project",
        "slug": "main-project",
        "description": "The main project",
        "metadata": {},
        "tenant_id": tenant_id,
    }


def _version_row(
    project_id: str = _PROJECT_ID,
    visibility: str = "public",
    published: bool = True,
) -> dict[str, Any]:
    return {
        "id": _VERSION_ID,
        "name": "v1.0",
        "description": "Initial release",
        "published": published,
        "published_at": _NOW,
        "visibility": visibility,
        "code_generation_tag": "v1.0.0",
        "metadata": {},
        "project_id": project_id,
    }


def _class_row(version_id: str = _VERSION_ID) -> dict[str, Any]:
    return {
        "id": _CLASS_ID,
        "name": "User",
        "description": "A user class",
        "schema": {"type": "object", "properties": {"name": {"type": "string"}}},
        "version_id": version_id,
    }


# ---------------------------------------------------------------------------
# GET /v1/catalog/tenants
# ---------------------------------------------------------------------------


def test_list_catalog_tenants_returns_tenants(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_tenant_row()]
        r = client.get("/v1/catalog/tenants")
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["id"] == _TENANT_ID
        assert body[0]["name"] == "Acme Corp"
        assert body[0]["slug"] == "acme"


def test_list_catalog_tenants_empty(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get("/v1/catalog/tenants")
        assert r.status_code == 200
        assert r.json() == []


def test_list_catalog_tenants_unauthenticated(anon_client):
    """Unauthenticated requests to the authenticated endpoint return 401."""
    r = anon_client.get("/v1/catalog/tenants")
    assert r.status_code == 401


def test_list_catalog_tenants_pagination(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_tenant_row()]
        r = client.get("/v1/catalog/tenants?limit=10&offset=5")
        assert r.status_code == 200
        # Verify limit and offset were passed to the query
        call_args = mock_db.execute_query.call_args
        assert call_args[0][1] == (10, 5)


# ---------------------------------------------------------------------------
# GET /v1/catalog/tenants/{tenant_id}
# ---------------------------------------------------------------------------


def test_tenant_catalog_full(client):
    """Full catalog for a tenant returns projects, versions, and classes."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            # 1. tenant lookup
            [_tenant_row()],
            # 2. project lookup
            [_project_row()],
            # 3. version lookup
            [_version_row()],
            # 4. class lookup
            [_class_row()],
        ]
        r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}")
        assert r.status_code == 200
        body = r.json()
        assert body["tenant"]["id"] == _TENANT_ID
        assert len(body["projects"]) == 1
        assert body["projects"][0]["project"]["id"] == _PROJECT_ID
        assert len(body["projects"][0]["versions"]) == 1
        ver = body["projects"][0]["versions"][0]
        assert ver["id"] == _VERSION_ID
        assert ver["published"] is True
        assert len(ver["classes"]) == 1
        assert ver["classes"][0]["id"] == _CLASS_ID
        assert ver["classes"][0]["name"] == "User"


def test_tenant_catalog_not_found(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}")
        assert r.status_code == 404


def test_tenant_catalog_no_projects(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [],  # no projects
        ]
        r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}")
        assert r.status_code == 200
        assert r.json()["projects"] == []


def test_tenant_catalog_excludes_unpublished_versions(client):
    """Only published versions are returned in the tenant catalog."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [_project_row()],
            [],  # no published versions (they were filtered by the query)
            # no class query needed since no versions
        ]
        r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}")
        assert r.status_code == 200
        assert r.json()["projects"] == []


def test_tenant_catalog_visibility_filter(client):
    """The visibility query parameter filters versions."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [_project_row()],
            [_version_row(visibility="public")],
            [_class_row()],
        ]
        r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}?visibility=public")
        assert r.status_code == 200
        body = r.json()
        assert len(body["projects"]) == 1
        assert body["projects"][0]["versions"][0]["visibility"] == "public"


# ---------------------------------------------------------------------------
# GET /v1/catalog/projects/{project_id}/versions
# ---------------------------------------------------------------------------


def test_catalog_project_versions(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            # 1. project check (now includes tenant_id)
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            # 2. version rows
            [_version_row()],
            # 3. class rows
            [_class_row()],
        ]
        r = client.get(f"/v1/catalog/projects/{_PROJECT_ID}/versions")
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["id"] == _VERSION_ID
        assert len(body[0]["classes"]) == 1


def test_catalog_project_versions_not_found(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/catalog/projects/{_PROJECT_ID}/versions")
        assert r.status_code == 404


def test_catalog_project_versions_empty(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            [],  # no published versions
        ]
        r = client.get(f"/v1/catalog/projects/{_PROJECT_ID}/versions")
        assert r.status_code == 200
        assert r.json() == []


def test_catalog_project_versions_pagination(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            [_version_row()],
            [_class_row()],
        ]
        r = client.get(f"/v1/catalog/projects/{_PROJECT_ID}/versions?limit=5&offset=10")
        assert r.status_code == 200
        # Verify pagination params were passed to the version query
        version_call = mock_db.execute_query.call_args_list[1]
        assert version_call[0][1] == (_PROJECT_ID, 5, 10)


def test_tenant_catalog_invalid_visibility(client):
    """An invalid visibility value must return 422."""
    r = client.get(f"/v1/catalog/tenants/{_TENANT_ID}?visibility=invalid_value")
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /v1/catalog/public
# ---------------------------------------------------------------------------


def test_public_catalog_no_auth_required(anon_client):
    """The public endpoint does not require authentication."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [_project_row()],
            [_version_row(visibility="public")],
            [_class_row()],
        ]
        r = anon_client.get("/v1/catalog/public")
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["tenant"]["id"] == _TENANT_ID
        assert len(body[0]["projects"]) == 1
        assert body[0]["projects"][0]["versions"][0]["visibility"] == "public"


def test_public_catalog_empty(anon_client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = anon_client.get("/v1/catalog/public")
        assert r.status_code == 200
        assert r.json() == []


def test_public_catalog_excludes_private_versions(anon_client):
    """The public endpoint only returns public visibility versions."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            # tenants query returns nothing because no public versions exist
            [],
        ]
        r = anon_client.get("/v1/catalog/public")
        assert r.status_code == 200
        assert r.json() == []


def test_public_catalog_pagination(anon_client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [_project_row()],
            [_version_row(visibility="public")],
            [_class_row()],
        ]
        r = anon_client.get("/v1/catalog/public?limit=50&offset=0")
        assert r.status_code == 200
        # Verify pagination params on the first query (tenant query)
        first_call = mock_db.execute_query.call_args_list[0]
        assert first_call[0][1] == (50, 0)


def test_public_catalog_full_structure(anon_client):
    """Verify the full nested structure of the public catalog response."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_tenant_row()],
            [_project_row()],
            [_version_row(visibility="public")],
            [_class_row()],
        ]
        r = anon_client.get("/v1/catalog/public")
        assert r.status_code == 200
        body = r.json()

        # Verify tenant structure
        tenant = body[0]["tenant"]
        assert "id" in tenant
        assert "name" in tenant
        assert "slug" in tenant
        assert "description" in tenant

        # Verify project structure
        project = body[0]["projects"][0]["project"]
        assert "id" in project
        assert "name" in project
        assert "slug" in project
        assert "description" in project

        # Verify version structure
        version = body[0]["projects"][0]["versions"][0]
        assert "id" in version
        assert "name" in version
        assert "published" in version
        assert "visibility" in version
        assert "classes" in version

        # Verify class structure
        cls = version["classes"][0]
        assert "id" in cls
        assert "name" in cls
        assert "description" in cls


