"""Tests for class property REST endpoints."""

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
_PROPERTY_ID = "00000000-0000-0000-0000-000000000070"
_CLASS_PROP_ID = "00000000-0000-0000-0000-000000000080"
_PARENT_ID = "00000000-0000-0000-0000-000000000090"
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
}

_PROPERTY_ROW: dict[str, Any] = {
    "id": _PROPERTY_ID,
}

_CLASS_PROP_ROW: dict[str, Any] = {
    "id": _CLASS_PROP_ID,
    "class_id": _CLASS_ID,
    "property_id": _PROPERTY_ID,
    "parent_id": None,
    "name": "myProp",
    "description": "A property",
    "data": {"type": "string"},
    "created_at": _NOW,
    "updated_at": None,
}


@pytest.fixture
def client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# List class properties
# ---------------------------------------------------------------------------


def test_list_class_properties_returns_list(client):
    """GET /v1/versions/{vid}/classes/{cid}/properties returns list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "myProp"


def test_list_class_properties_empty(client):
    """GET /v1/versions/{vid}/classes/{cid}/properties returns empty list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties")
    assert r.status_code == 200
    assert r.json() == []


def test_list_class_properties_filtered_by_parent_id(client):
    """GET /v1/versions/{vid}/classes/{cid}/properties?parent_id=X filters by parent."""
    child_row = {**_CLASS_PROP_ROW, "parent_id": _PARENT_ID}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [child_row],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties?parent_id={_PARENT_ID}"
        )
    assert r.status_code == 200
    assert r.json()[0]["parent_id"] == _PARENT_ID


def test_list_class_properties_version_not_found_returns_404(client):
    """GET /v1/versions/{vid}/classes/{cid}/properties returns 404 when version missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties")
    assert r.status_code == 404


def test_list_class_properties_class_not_found_returns_404(client):
    """GET /v1/versions/{vid}/classes/{cid}/properties returns 404 when class missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Add property to class
# ---------------------------------------------------------------------------


def test_add_property_to_class_returns_201(client):
    """POST /v1/versions/{vid}/classes/{cid}/properties creates class property."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],   # version exists
            [_CLASS_ROW],     # class exists
            [_PROPERTY_ROW],  # property exists
            [],               # no name conflict
        ]
        mock_db.execute_mutation.return_value = _CLASS_PROP_ROW
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 201
    assert r.json()["name"] == "myProp"


def test_add_property_to_class_with_parent_id_returns_201(client):
    """POST with parent_id nests the property."""
    child_row = {**_CLASS_PROP_ROW, "parent_id": _PARENT_ID}
    parent_row = {**_CLASS_PROP_ROW, "id": _PARENT_ID, "name": "parentProp"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],    # version exists
            [_CLASS_ROW],      # class exists
            [_PROPERTY_ROW],   # property exists
            [parent_row],      # parent class property exists
            [],                # no name conflict
        ]
        mock_db.execute_mutation.return_value = child_row
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp", "parent_id": _PARENT_ID},
        )
    assert r.status_code == 201
    assert r.json()["parent_id"] == _PARENT_ID


def test_add_property_missing_name_returns_400(client):
    """POST without name returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": ""},
        )
    assert r.status_code == 400


def test_add_property_duplicate_name_returns_409(client):
    """POST with duplicate name returns 409."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROPERTY_ROW],
            [{"id": "existing"}],  # name conflict
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 409


def test_add_property_version_not_found_returns_404(client):
    """POST returns 404 when version missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 404


def test_add_property_library_property_not_found_returns_404(client):
    """POST returns 404 when library property missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [],  # property missing
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update class property
# ---------------------------------------------------------------------------


def test_update_class_property_returns_updated(client):
    """PUT /v1/versions/{vid}/classes/{cid}/properties/{pid} updates join row."""
    updated = {**_CLASS_PROP_ROW, "name": "renamedProp", "description": "Updated"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],       # version exists
            [_CLASS_ROW],         # class exists
            [_CLASS_PROP_ROW],    # class property exists
            [],                   # no name conflict
        ]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "renamedProp", "description": "Updated"},
        )
    assert r.status_code == 200
    assert r.json()["name"] == "renamedProp"


def test_update_class_property_no_fields_returns_existing(client):
    """PUT with no fields returns existing row unchanged."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],  # class property exists (assert)
            [_CLASS_PROP_ROW],  # re-fetch for no-op return
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={},
        )
    assert r.status_code == 200
    assert r.json()["name"] == "myProp"


def test_update_class_property_empty_name_returns_400(client):
    """PUT with empty name returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "   "},
        )
    assert r.status_code == 400


def test_update_class_property_duplicate_name_returns_409(client):
    """PUT with duplicate name returns 409."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
            [{"id": "other"}],  # name conflict
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "conflictProp"},
        )
    assert r.status_code == 409


def test_update_class_property_self_parent_returns_400(client):
    """PUT setting parent_id to same id returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"parent_id": _CLASS_PROP_ID},
        )
    assert r.status_code == 400


def test_update_class_property_not_found_returns_404(client):
    """PUT returns 404 when class property missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [],  # class property missing
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "renamedProp"},
        )
    assert r.status_code == 404


def test_update_class_property_with_parent_id_returns_200(client):
    """PUT with valid parent_id re-nests the property."""
    parent_row = {**_CLASS_PROP_ROW, "id": _PARENT_ID, "name": "parentProp"}
    updated = {**_CLASS_PROP_ROW, "parent_id": _PARENT_ID}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],   # class property exists
            [parent_row],        # parent class property exists
            [],                  # no sibling name conflict under new parent
        ]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"parent_id": _PARENT_ID},
        )
    assert r.status_code == 200
    assert r.json()["parent_id"] == _PARENT_ID


def test_update_class_property_reparent_sibling_conflict_returns_409(client):
    """PUT returns 409 when re-nesting causes a sibling name conflict under the new parent."""
    parent_row = {**_CLASS_PROP_ROW, "id": _PARENT_ID, "name": "parentProp"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],        # class property exists
            [parent_row],             # parent class property exists
            [{"id": "sibling-id"}],   # sibling name conflict under new parent
        ]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"parent_id": _PARENT_ID},
        )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Remove property from class
# ---------------------------------------------------------------------------


def test_remove_property_from_class_returns_204(client):
    """DELETE /v1/versions/{vid}/classes/{cid}/properties/{pid} removes the row."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
        ]
        mock_db.execute_mutation.side_effect = [
            None,            # reparent children (no-op)
            _CLASS_PROP_ROW, # delete returning row
        ]
        r = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}"
        )
    assert r.status_code == 204


def test_remove_property_from_class_not_found_returns_404(client):
    """DELETE returns 404 when class property missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [],  # class property missing
        ]
        r = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}"
        )
    assert r.status_code == 404


def test_remove_property_version_not_found_returns_404(client):
    """DELETE returns 404 when version missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}"
        )
    assert r.status_code == 404


def test_class_properties_require_auth(client):
    """All class property endpoints return 401 without auth."""
    app.dependency_overrides.clear()
    with mock_db_all():
        r_get = client.get(f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties")
        r_post = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "x"},
        )
        r_put = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "x"},
        )
        r_delete = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}"
        )
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    assert r_get.status_code == 401
    assert r_post.status_code == 401
    assert r_put.status_code == 401
    assert r_delete.status_code == 401


# ---------------------------------------------------------------------------
# Additional coverage: DB exception and edge-case paths
# ---------------------------------------------------------------------------


def test_add_property_db_unique_constraint_returns_409(client):
    """POST returns 409 when DB raises unique constraint error on mutation."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROPERTY_ROW],
            [],  # no pre-check conflict
        ]
        mock_db.execute_mutation.side_effect = Exception("23505 unique constraint")
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 409


def test_add_property_mutation_returns_none_returns_500(client):
    """POST returns 500 when mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROPERTY_ROW],
            [],
        ]
        mock_db.execute_mutation.return_value = None
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties",
            json={"property_id": _PROPERTY_ID, "name": "myProp"},
        )
    assert r.status_code == 500


def test_update_class_property_db_unique_constraint_returns_409(client):
    """PUT returns 409 when DB raises unique constraint error on mutation."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
            [],  # no pre-check conflict
        ]
        mock_db.execute_mutation.side_effect = Exception("unique constraint violation")
        r = client.put(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}",
            json={"name": "newName"},
        )
    assert r.status_code == 409


def test_remove_property_delete_returns_none_returns_404(client):
    """DELETE returns 404 when DELETE mutation returns None."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_CLASS_PROP_ROW],
        ]
        mock_db.execute_mutation.side_effect = [
            None,  # reparent children
            None,  # delete returns None
        ]
        r = client.delete(
            f"/v1/versions/{_VERSION_ID}/classes/{_CLASS_ID}/properties/{_CLASS_PROP_ID}"
        )
    assert r.status_code == 404
