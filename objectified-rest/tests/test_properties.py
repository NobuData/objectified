"""Tests for /v1/tenants/{tenant_id}/projects/{project_id}/properties endpoints."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)

_TENANT_ID = "00000000-0000-0000-0000-000000000110"
_PROJECT_ID = "00000000-0000-0000-0000-000000000111"
_PROPERTY_ID = "00000000-0000-0000-0000-000000000112"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000113"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_TENANT_ROW: dict[str, Any] = {"id": _TENANT_ID}
_PROJECT_ROW: dict[str, Any] = {"id": _PROJECT_ID, "tenant_id": _TENANT_ID}
_PROPERTY_ROW: dict[str, Any] = {
    "id": _PROPERTY_ID,
    "project_id": _PROJECT_ID,
    "name": "Status",
    "description": "Workflow status",
    "data": {"type": "string", "enum": ["draft", "published"]},
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}


@pytest.fixture
def client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_properties_returns_list(client):
    """GET /properties returns project-scoped properties."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == _PROPERTY_ID
    assert data[0]["name"] == "Status"


def test_list_properties_include_deleted(client):
    """GET /properties?include_deleted=true includes soft-deleted rows."""
    deleted_row = {**_PROPERTY_ROW, "deleted_at": _NOW.isoformat()}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW, deleted_row],
        ]
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties?include_deleted=true"
        )
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_list_deleted_properties_returns_only_deleted(client):
    """GET /properties/deleted returns only soft-deleted rows."""
    deleted_row = {**_PROPERTY_ROW, "deleted_at": _NOW.isoformat()}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [deleted_row],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/deleted")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_property_by_id_returns_property(client):
    """GET /properties/{property_id} returns a property."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _PROPERTY_ID


def test_get_property_by_id_include_deleted_returns_soft_deleted(client):
    """GET /properties/{property_id}?include_deleted=true returns a soft-deleted property."""
    deleted_row = {**_PROPERTY_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [deleted_row],
        ]
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}"
            "?include_deleted=true"
        )
    assert r.status_code == 200
    assert r.json()["id"] == _PROPERTY_ID
    assert r.json()["deleted_at"] is not None


def test_get_property_by_id_not_found(client):
    """GET /properties/{property_id} returns 404 when missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}")
    assert r.status_code == 404


def test_get_property_by_name_case_insensitive(client):
    """GET /properties/by-name/{name} performs case-insensitive lookup."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/by-name/status"
        )
    assert r.status_code == 200
    assert r.json()["name"] == "Status"


def test_get_property_by_name_include_deleted_returns_soft_deleted(client):
    """GET /properties/by-name/{name}?include_deleted=true returns a soft-deleted property."""
    deleted_row = {**_PROPERTY_ROW, "deleted_at": _NOW}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [deleted_row],
        ]
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/by-name/Status"
            "?include_deleted=true"
        )
    assert r.status_code == 200
    assert r.json()["name"] == "Status"
    assert r.json()["deleted_at"] is not None


def test_get_property_by_name_not_found(client):
    """GET /properties/by-name/{name} returns 404 when missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [],
        ]
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/by-name/unknown"
        )
    assert r.status_code == 404


def test_create_property_returns_201(client):
    """POST /properties creates a new property."""
    payload = {
        "project_id": _PROJECT_ID,
        "name": "Status",
        "description": "Workflow status",
        "data": {"type": "string"},
        "enabled": True,
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [],
        ]
        mock_db.execute_mutation.return_value = _PROPERTY_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json=payload,
        )
    assert r.status_code == 201
    assert r.json()["name"] == "Status"


def test_create_property_name_required(client):
    """POST /properties validates name."""
    payload = {
        "project_id": _PROJECT_ID,
        "name": "   ",
        "description": "Workflow status",
        "data": {"type": "string"},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json=payload,
        )
    assert r.status_code == 400


def test_create_property_project_id_mismatch_returns_400(client):
    """POST /properties rejects mismatched payload project_id."""
    payload = {
        "project_id": "00000000-0000-0000-0000-000000009999",
        "name": "Status",
        "description": "Workflow status",
        "data": {"type": "string"},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json=payload,
        )
    assert r.status_code == 400


def test_create_property_duplicate_returns_409(client):
    """POST /properties returns 409 for duplicate names."""
    payload = {
        "project_id": _PROJECT_ID,
        "name": "Status",
        "description": "Workflow status",
        "data": {"type": "string"},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [{"id": _PROPERTY_ID}],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json=payload,
        )
    assert r.status_code == 409


def test_create_property_invalid_data_returns_400_with_details(client):
    """POST /properties rejects invalid JSON Schema/OpenAPI data payloads."""
    payload = {
        "project_id": _PROJECT_ID,
        "name": "Status",
        "description": "Workflow status",
        "data": {"type": 123},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json=payload,
        )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["message"] == "Invalid property data payload"
    standards = {error["standard"] for error in detail["errors"]}
    assert "json-schema-2020-12" in standards
    assert "openapi-3.2.0-schema-object" not in standards


def test_update_property_returns_updated_row(client):
    """PUT /properties/{property_id} updates provided fields."""
    updated = {**_PROPERTY_ROW, "description": "Updated"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        mock_db.execute_mutation.return_value = updated
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}",
            json={"description": "Updated"},
        )
    assert r.status_code == 200
    assert r.json()["description"] == "Updated"


def test_update_property_name_empty_returns_400(client):
    """PUT /properties/{property_id} validates name when provided."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}",
            json={"name": "   "},
        )
    assert r.status_code == 400


def test_update_property_duplicate_name_returns_409(client):
    """PUT /properties/{property_id} returns 409 for duplicate names."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
            [{"id": "00000000-0000-0000-0000-000000000199"}],
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}",
            json={"name": "status"},
        )
    assert r.status_code == 409


def test_update_property_invalid_data_returns_400_with_details(client):
    """PUT /properties/{property_id} rejects invalid data schema updates."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}",
            json={"data": {"type": 123}},
        )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["message"] == "Invalid property data payload"
    assert len(detail["errors"]) >= 1


def test_update_property_no_fields_returns_existing(client):
    """PUT /properties/{property_id} with empty payload returns current row."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
            [_PROPERTY_ROW],
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}",
            json={},
        )
    assert r.status_code == 200
    assert r.json()["id"] == _PROPERTY_ID


def test_delete_property_returns_204(client):
    """DELETE /properties/{property_id} soft-deletes a property."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [_PROPERTY_ROW],
        ]
        mock_db.execute_mutation.return_value = {**_PROPERTY_ROW, "deleted_at": _NOW}
        r = client.delete(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}"
        )
    assert r.status_code == 204


def test_delete_property_not_found_returns_404(client):
    """DELETE /properties/{property_id} returns 404 when missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [],
        ]
        r = client.delete(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties/{_PROPERTY_ID}"
        )
    assert r.status_code == 404


def test_property_routes_project_not_found_returns_404(client):
    """Property routes return 404 when project is missing in tenant scope."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties")
    assert r.status_code == 404


def test_property_routes_tenant_not_found_returns_404(client):
    """Property routes return 404 when tenant is missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties")
    assert r.status_code == 404


def test_property_routes_require_auth(client):
    """Property routes require auth and return 401 when dependency is not overridden."""
    app.dependency_overrides.clear()
    with mock_db_all():
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties")
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    assert r.status_code == 401


def test_create_property_then_class_then_class_properties_flow(client):
    """Exercise creation/association flow using mocked DB responses across endpoints."""
    version_id = "00000000-0000-0000-0000-000000000114"
    class_id = "00000000-0000-0000-0000-000000000115"
    class_row = {
        "id": class_id,
        "version_id": version_id,
        "name": "Order",
        "description": "Order class",
        "schema": {},
        "metadata": {"tags": ["erp"]},
        "enabled": True,
        "created_at": _NOW,
        "updated_at": None,
        "deleted_at": None,
    }
    class_property_row = {
        "id": "00000000-0000-0000-0000-000000000116",
        "class_id": class_id,
        "property_id": _PROPERTY_ID,
        "name": "status",
        "description": "status mapping",
        "data": {"type": "string"},
        "property_name": "Status",
        "property_data": {"type": "string"},
    }

    with mock_db_all() as mock_db:
        # 1) Create property
        mock_db.execute_query.side_effect = [
            [_TENANT_ROW],
            [_PROJECT_ROW],
            [],
            # 2) Create class
            [{"id": version_id}],
            # 3) Get classes with properties
            [{"id": version_id}],
            [class_row],
            [class_property_row],
        ]
        mock_db.execute_mutation.side_effect = [
            _PROPERTY_ROW,
            class_row,
        ]

        created_property = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/properties",
            json={
                "project_id": _PROJECT_ID,
                "name": "Status",
                "description": "Workflow status",
                "data": {"type": "string"},
            },
        )
        created_class = client.post(
            f"/v1/versions/{version_id}/classes",
            json={"name": "Order", "description": "Order class"},
        )
        listed = client.get(f"/v1/versions/{version_id}/classes/with-properties-tags")

    assert created_property.status_code == 201
    assert created_class.status_code == 201
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Order"
    assert rows[0]["tags"] == ["erp"]
    assert len(rows[0]["properties"]) == 1
    assert rows[0]["properties"][0]["property_id"] == _PROPERTY_ID

