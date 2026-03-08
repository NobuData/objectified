"""Tests for versions REST endpoints."""

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
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_PROJECT_ROW: dict[str, Any] = {"id": _PROJECT_ID, "tenant_id": _TENANT_ID}
_VERSION_ROW: dict[str, Any] = {
    "id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "source_version_id": None,
    "creator_id": _ACCOUNT_ID,
    "name": "v1",
    "description": "Initial",
    "change_log": "Created",
    "enabled": True,
    "published": False,
    "visibility": None,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
    "published_at": None,
}
_HISTORY_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000050",
    "version_id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "changed_by": _ACCOUNT_ID,
    "revision": 1,
    "operation": "INSERT",
    "old_data": None,
    "new_data": _VERSION_ROW,
    "changed_at": _NOW,
}


def _version_lookup_row() -> dict[str, Any]:
    """Version lookup joins include project.deleted_at filter only."""
    return {**_VERSION_ROW, "project_deleted_at": None}


@pytest.fixture
def client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_versions_returns_list(client):
    """GET /v1/tenants/{tid}/projects/{pid}/versions returns version list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_VERSION_ROW],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_create_version_returns_201(client):
    """POST /v1/tenants/{tid}/projects/{pid}/versions creates a version."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
        ]
        mock_db.execute_mutation.side_effect = [_VERSION_ROW, None]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions",
            json={"name": "v1", "description": "Initial", "change_log": "Created"},
        )
    assert r.status_code == 201


def test_create_version_with_source_version_validates_same_project(client):
    """POST create validates source_version_id is in the same project."""
    other_project_version = {**_VERSION_ROW, "project_id": "00000000-0000-0000-0000-000000000099"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [other_project_version],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions",
            json={"name": "branched", "source_version_id": _VERSION_ID},
        )
    assert r.status_code == 400


def test_get_version_by_id_returns_version(client):
    """GET /v1/versions/{id} returns version by id."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = client.get(f"/v1/versions/{_VERSION_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _VERSION_ID


def test_update_version_metadata_returns_updated_version(client):
    """PUT /v1/versions/{id} updates description/change_log."""
    updated = {**_VERSION_ROW, "description": "Updated", "change_log": "Updated log"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
        ]
        mock_db.execute_mutation.side_effect = [updated, None]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}",
            json={"description": "Updated", "change_log": "Updated log"},
        )
    assert r.status_code == 200
    assert r.json()["description"] == "Updated"


def test_delete_version_returns_204(client):
    """DELETE /v1/versions/{id} soft-deletes the version."""
    deleted = {**_VERSION_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
        ]
        mock_db.execute_mutation.side_effect = [deleted, None]
        r = client.delete(f"/v1/versions/{_VERSION_ID}")
    assert r.status_code == 204


def test_get_version_history_returns_rows(client):
    """GET /v1/versions/{id}/history returns ordered history rows."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_HISTORY_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/history")
    assert r.status_code == 200
    assert r.json()[0]["revision"] == 1


def test_get_version_by_revision_not_found_returns_404(client):
    """GET /v1/versions/{id}/revisions/{revision} returns 404 when missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/revisions/99")
    assert r.status_code == 404

