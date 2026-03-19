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

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}

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


def test_list_classes_with_properties_and_tags_includes_properties_and_tags(client):
    """GET /v1/versions/{id}/classes/with-properties-tags embeds properties and tags."""
    class_with_tags = {
        **_CLASS_ROW,
        "metadata": {"tags": ["tag1", "tag2"]},
    }
    prop_row = {
        "id": "00000000-0000-0000-0000-000000000061",
        "class_id": _CLASS_ID,
        "property_id": "00000000-0000-0000-0000-000000000062",
        "name": "myProp",
        "description": "A property",
        "data": {"type": "string"},
        "property_name": "LibraryProp",
        "property_data": {},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [class_with_tags],
            [prop_row],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/with-properties-tags")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["properties"] == [prop_row]
    assert data[0]["tags"] == ["tag1", "tag2"]


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


def test_create_class_missing_name_returns_422(client):
    """POST /v1/versions/{id}/classes without name returns 422."""
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


def test_create_class_invalid_schema_returns_400_with_details(client):
    """POST /v1/versions/{id}/classes rejects invalid JSON Schema Draft 2020-12 payloads."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes",
            json={"name": "MyClass", "schema": {"type": 123}},
        )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["message"] == "Invalid class schema payload"
    standards = {error["standard"] for error in detail["errors"]}
    assert "json-schema-2020-12" in standards
    assert "openapi-3.2.0-schema-object" not in standards


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


def test_update_class_invalid_schema_returns_400_with_details(client):
    """PUT /v1/versions/{vid}/classes/{cid} rejects invalid schema updates."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_CLASS_ROW],
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}",
            json={"schema": {"type": 123}},
        )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["message"] == "Invalid class schema payload"
    assert len(detail["errors"]) >= 1


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


def test_get_class_with_properties_and_tags_returns_class(client):
    """GET /v1/versions/{vid}/classes/{cid}/with-properties-tags returns class with properties and tags."""
    class_with_tags = {
        **_CLASS_ROW,
        "metadata": {"tags": ["tag1", "tag2"]},
    }
    prop_row = {
        "id": "00000000-0000-0000-0000-000000000061",
        "class_id": _CLASS_ID,
        "property_id": "00000000-0000-0000-0000-000000000062",
        "name": "myProp",
        "description": "A property",
        "data": {"type": "string"},
        "property_name": "LibraryProp",
        "property_data": {},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # version exists
            [class_with_tags],         # class exists
            [prop_row],                # class properties
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/with-properties-tags")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _CLASS_ID
    assert data["name"] == "MyClass"
    assert data["tags"] == ["tag1", "tag2"]
    assert len(data["properties"]) == 1
    assert data["properties"][0]["name"] == "myProp"


def test_get_class_with_properties_and_tags_no_properties(client):
    """GET /v1/versions/{vid}/classes/{cid}/with-properties-tags returns class with empty properties."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # version exists
            [_CLASS_ROW],              # class exists
            [],                        # no properties
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/with-properties-tags")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == _CLASS_ID
    assert data["properties"] == []
    assert data["tags"] == []


def test_get_class_with_properties_and_tags_not_found_returns_404(client):
    """GET /v1/versions/{vid}/classes/{cid}/with-properties-tags returns 404 when class missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # version exists
            [],                        # class not found
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/with-properties-tags")
    assert r.status_code == 404


def test_get_class_with_properties_and_tags_version_not_found_returns_404(client):
    """GET /v1/versions/{vid}/classes/{cid}/with-properties-tags returns 404 when version missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/with-properties-tags")
    assert r.status_code == 404


def test_get_class_with_properties_and_tags_string_tag(client):
    """GET /v1/versions/{vid}/classes/{cid}/with-properties-tags handles a string tag value."""
    class_with_string_tag = {
        **_CLASS_ROW,
        "metadata": {"tags": "single-tag"},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [class_with_string_tag],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/with-properties-tags")
    assert r.status_code == 200
    assert r.json()["tags"] == ["single-tag"]


def test_list_classes_requires_auth(client):
    """GET /v1/versions/{id}/classes without auth returns 401."""
    app.dependency_overrides.clear()
    with mock_db_all():
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes")
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    assert r.status_code == 401


# ─── Class tags (GitHub #103) ───────────────────────────────────────────────


def test_get_tags_for_class_returns_tags(client):
    """GET /v1/versions/{vid}/classes/{cid}/tags returns tag list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"metadata": {"tags": ["a", "b"]}}],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags")
    assert r.status_code == 200
    assert r.json()["tags"] == ["a", "b"]


def test_get_tags_for_class_empty_metadata(client):
    """GET .../tags returns [] when class has no tags in metadata."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"metadata": None}],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags")
    assert r.status_code == 200
    assert r.json()["tags"] == []


def test_get_tags_for_class_not_found_returns_404(client):
    """GET .../tags returns 404 when class missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()], []]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags")
    assert r.status_code == 404


def test_assign_tag_to_class_adds_tag(client):
    """POST .../tags adds tag to class metadata (GitHub #103)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"id": _CLASS_ID, "metadata": {"tags": ["existing"]}}],
        ]
        mock_db.execute_mutation.return_value = [{"id": _CLASS_ID}]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags",
            json={"tag": "new-tag"},
        )
    assert r.status_code == 200
    assert r.json()["tags"] == ["existing", "new-tag"]
    assert mock_db.execute_mutation.called


def test_assign_tag_to_class_idempotent(client):
    """POST .../tags with existing tag does not duplicate."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"id": _CLASS_ID, "metadata": {"tags": ["a", "b"]}}],
        ]
        mock_db.execute_mutation.return_value = [{"id": _CLASS_ID}]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags",
            json={"tag": "a"},
        )
    assert r.status_code == 200
    assert r.json()["tags"] == ["a", "b"]


def test_assign_tag_to_class_empty_tag_returns_400(client):
    """POST .../tags with empty tag returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()], [{"id": _CLASS_ID, "metadata": {}}]]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags",
            json={"tag": "   "},
        )
    assert r.status_code == 400


def test_remove_tag_from_class_removes_tag(client):
    """DELETE .../tags/{tag_name} removes tag (GitHub #103)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [{"id": _CLASS_ID, "metadata": {"tags": ["a", "b", "c"]}}],
        ]
        mock_db.execute_mutation.return_value = [{"id": _CLASS_ID}]
        r = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/tags/b",
        )
    assert r.status_code == 200
    assert r.json()["tags"] == ["a", "c"]
