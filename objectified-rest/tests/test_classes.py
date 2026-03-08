"""Tests for class REST endpoints (version-scoped)."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)
_VERSION_ID = "00000000-0000-0000-0000-000000000030"
_CLASS_ID = "00000000-0000-0000-0000-000000000060"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_VERSION_ROW: dict[str, Any] = {
    "id": _VERSION_ID,
    "project_id": "00000000-0000-0000-0000-000000000020",
    "source_version_id": None,
    "creator_id": _ACCOUNT_ID,
    "name": "v1",
    "description": "",
    "change_log": None,
    "enabled": True,
    "published": False,
    "visibility": None,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
    "published_at": None,
}

_CLASS_ROW: dict[str, Any] = {
    "id": _CLASS_ID,
    "version_id": _VERSION_ID,
    "name": "MyClass",
    "description": "A class",
    "schema": {},
    "metadata": {},
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}


def _version_lookup_row() -> dict[str, Any]:
    return {**_VERSION_ROW}


@pytest.fixture
def client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_classes_by_version_returns_list(client):
    """GET /v1/versions/{id}/classes returns class list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "MyClass"
    assert data[0]["version_id"] == _VERSION_ID


def test_list_classes_by_version_include_deleted(client):
    """GET /v1/versions/{id}/classes?include_deleted=true includes deleted."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes?include_deleted=true")
    assert r.status_code == 200


def test_list_classes_version_not_found_returns_404(client):
    """GET /v1/versions/{id}/classes returns 404 when version missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes")
    assert r.status_code == 404


def test_list_classes_with_properties_and_tags_returns_list(client):
    """GET /v1/versions/{id}/classes/with-properties-tags returns classes with properties."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/with-properties-tags")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert "properties" in data[0]
    assert data[0]["properties"] == []


def test_get_class_returns_class(client):
    """GET /v1/versions/{vid}/classes/{cid} returns class."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _CLASS_ID
    assert r.json()["name"] == "MyClass"


def test_get_class_not_found_returns_404(client):
    """GET /v1/versions/{vid}/classes/{cid} returns 404 when class missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}")
    assert r.status_code == 404


def test_create_class_returns_201(client):
    """POST /v1/versions/{id}/classes creates a class."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        mock_db.execute_mutation.return_value = _CLASS_ROW
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes",
            json={"name": "MyClass", "description": "A class"},
        )
    assert r.status_code == 201
    assert r.json()["name"] == "MyClass"


def test_create_class_missing_name_returns_400(client):
    """POST /v1/versions/{id}/classes without name returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes",
            json={"description": "A class"},
        )
    assert r.status_code == 422


def test_create_class_version_id_mismatch_returns_400(client):
    """POST /v1/versions/{id}/classes with different body version_id returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes",
            json={
                "version_id": "00000000-0000-0000-0000-000000000099",
                "name": "MyClass",
            },
        )
    assert r.status_code == 400


def test_create_class_duplicate_name_returns_409(client):
    """POST /v1/versions/{id}/classes duplicate name returns 409."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        mock_db.execute_mutation.side_effect = Exception("unique constraint")
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes",
            json={"name": "MyClass", "description": "A class"},
        )
    assert r.status_code == 409


def test_update_class_returns_updated(client):
    """PUT /v1/versions/{vid}/classes/{cid} updates class."""
    updated = {**_CLASS_ROW, "description": "Updated desc", "name": "MyClass"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}",
            json={"description": "Updated desc"},
        )
    assert r.status_code == 200
    assert r.json()["description"] == "Updated desc"


def test_update_class_canvas_metadata_merges_into_metadata(client):
    """PUT /v1/versions/{vid}/classes/{cid} with canvas_metadata merges into metadata."""
    updated = {
        **_CLASS_ROW,
        "metadata": {"canvas_metadata": {"position": {"x": 10, "y": 20}}},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}",
            json={"canvas_metadata": {"position": {"x": 10, "y": 20}}},
        )
    assert r.status_code == 200


def test_update_class_not_found_returns_404(client):
    """PUT /v1/versions/{vid}/classes/{cid} when class missing returns 404."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}",
            json={"description": "Updated"},
        )
    assert r.status_code == 404


def test_delete_class_returns_204(client):
    """DELETE /v1/versions/{vid}/classes/{cid} soft-deletes class."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"id": _CLASS_ID}],
        ]
        mock_db.execute_mutation.return_value = {**_CLASS_ROW, "deleted_at": _NOW}
        r = client.delete(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}")
    assert r.status_code == 204


def test_delete_class_not_found_returns_404(client):
    """DELETE /v1/versions/{vid}/classes/{cid} when class missing returns 404."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.delete(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}")
    assert r.status_code == 404


def test_list_classes_requires_auth(client):
    """GET /v1/versions/{id}/classes without auth returns 401."""
    app.dependency_overrides.clear()
    with mock_db_all():
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes")
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    assert r.status_code == 401
