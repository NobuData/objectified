"""Tests for import endpoints:
  POST /v1/versions/{version_id}/import/openapi
  POST /v1/versions/{version_id}/import/jsonschema
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock

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
_CLASS_ID = "00000000-0000-0000-0000-000000000050"
_PROP_ID = "00000000-0000-0000-0000-000000000060"
_CP_ID = "00000000-0000-0000-0000-000000000070"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_VERSION_ROW: dict[str, Any] = {
    "id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "source_version_id": None,
    "creator_id": _ACCOUNT_ID,
    "name": "v1",
    "description": "Initial version",
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

_CLASS_ROW: dict[str, Any] = {
    "id": _CLASS_ID,
    "version_id": _VERSION_ID,
    "name": "Person",
    "description": "A person entity",
    "schema": {"type": "object"},
    "metadata": {},
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

_PROP_ROW: dict[str, Any] = {
    "id": _PROP_ID,
    "project_id": _PROJECT_ID,
    "name": "name",
    "description": "Full name",
    "data": {"type": "string"},
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

_CP_ROW: dict[str, Any] = {
    "id": _CP_ID,
    "class_id": _CLASS_ID,
    "property_id": _PROP_ID,
    "parent_id": None,
    "name": "name",
    "description": "Full name",
    "data": {"type": "string"},
    "created_at": _NOW,
    "updated_at": None,
}

# ---------------------------------------------------------------------------
# Minimal OpenAPI and JSON Schema documents for testing
# ---------------------------------------------------------------------------

_OPENAPI_DOC: dict[str, Any] = {
    "openapi": "3.2.0",
    "info": {"title": "Test API", "version": "1.0.0"},
    "components": {
        "schemas": {
            "Person": {
                "type": "object",
                "description": "A person entity",
                "properties": {
                    "name": {"type": "string", "description": "Full name"},
                    "age": {"type": "integer", "description": "Age in years"},
                },
            }
        }
    },
    "paths": {},
}

_JSONSCHEMA_MULTI_DOC: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://example.com/test.json",
    "title": "Test Schema",
    "$defs": {
        "Person": {
            "type": "object",
            "description": "A person entity",
            "properties": {
                "name": {"type": "string", "description": "Full name"},
            },
        }
    },
}

_JSONSCHEMA_SINGLE_DOC: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Order",
    "type": "object",
    "description": "An order entity",
    "properties": {
        "order_id": {"type": "string", "description": "Order ID"},
    },
}


@pytest.fixture
def client():
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers to build side_effect sequences for the mock db
# ---------------------------------------------------------------------------


def _new_class_side_effects(num_properties: int = 1) -> list:
    """Side effects for importing a brand-new class with num_properties properties.

    Query sequence per property:
      1. _assert_version_exists         → [_VERSION_ROW]
      2. _find_or_create_class: SELECT  → []  (not found)
      3. _find_or_create_class: INSERT  → _CLASS_ROW  (via execute_mutation)
      For each property:
      4. _find_or_create_property: SELECT → [] (not found)
      5. _find_or_create_property: INSERT → _PROP_ROW (via execute_mutation)
      6. _create_class_property: SELECT  → [] (not found)
      7. _create_class_property: INSERT  → _CP_ROW  (via execute_mutation)

    execute_query calls: [VERSION], [class SELECT], [prop SELECT * n], [cp SELECT * n]
    execute_mutation calls: [class INSERT], [prop INSERT * n], [cp INSERT * n]
    """
    return None  # handled inline per test for clarity


# ---------------------------------------------------------------------------
# OpenAPI import tests
# ---------------------------------------------------------------------------


def test_import_openapi_returns_200(client):
    """POST /v1/versions/{id}/import/openapi returns 200 for valid document."""
    with mock_db_all() as mock_db:
        # execute_query: version, class-find (miss), prop-find x2 (miss x2), cp-find x2 (miss x2)
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],  # _assert_version_exists
            [],              # _find_or_create_class: SELECT (not found)
            [],              # _find_or_create_property 'name': SELECT (not found)
            [],              # _create_class_property 'name': SELECT (not found)
            [],              # _find_or_create_property 'age': SELECT (not found)
            [],              # _create_class_property 'age': SELECT (not found)
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,    # _find_or_create_class INSERT
            _PROP_ROW,     # _find_or_create_property 'name' INSERT
            _CP_ROW,       # _create_class_property 'name' INSERT
            age_prop_row,  # _find_or_create_property 'age' INSERT
            age_cp_row,    # _create_class_property 'age' INSERT
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    assert r.status_code == 200


def test_import_openapi_creates_class_and_properties(client):
    """Import creates one class and two properties for a fresh import."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],  # class not found
            [],  # 'name' prop not found
            [],  # 'name' cp not found
            [],  # 'age' prop not found
            [],  # 'age' cp not found
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _PROP_ROW,
            _CP_ROW,
            age_prop_row,
            age_cp_row,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    body = r.json()
    assert body["classes_created"] == 1
    assert body["classes_updated"] == 0
    assert body["properties_created"] == 2
    assert body["properties_reused"] == 0
    assert body["class_properties_created"] == 2
    assert body["class_properties_skipped"] == 0


def test_import_openapi_updates_existing_class(client):
    """Import updates an existing class (matched by name) instead of creating."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],  # class found — triggers UPDATE
            [],  # 'name' prop not found
            [],  # 'name' cp not found
            [],  # 'age' prop not found
            [],  # 'age' cp not found
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,    # UPDATE class
            _PROP_ROW,
            _CP_ROW,
            age_prop_row,
            age_cp_row,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    body = r.json()
    assert body["classes_created"] == 0
    assert body["classes_updated"] == 1


def test_import_openapi_reuses_existing_property(client):
    """Import reuses an existing property (matched by name within project)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],            # class not found
            [_PROP_ROW],   # 'name' property already exists — reuse
            [],            # 'name' cp not found
            [],            # 'age' prop not found
            [],            # 'age' cp not found
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _CP_ROW,
            age_prop_row,
            age_cp_row,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    body = r.json()
    assert body["properties_reused"] == 1
    assert body["properties_created"] == 1


def test_import_openapi_skips_existing_class_property(client):
    """Import skips creating a class_property when one already exists."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],           # class not found
            [],           # 'name' prop not found
            [_CP_ROW],    # 'name' class_property already exists — skip
            [],           # 'age' prop not found
            [],           # 'age' cp not found
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _PROP_ROW,
            age_prop_row,
            age_cp_row,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    body = r.json()
    assert body["class_properties_skipped"] == 1
    assert body["class_properties_created"] == 1


def test_import_openapi_version_not_found_returns_404(client):
    """POST /import/openapi returns 404 when version does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    assert r.status_code == 404


def test_import_openapi_missing_openapi_field_returns_400(client):
    """POST /import/openapi returns 400 when 'openapi' field is absent/wrong."""
    bad_doc = {"info": {"title": "Bad"}, "components": {}}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_VERSION_ROW]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=bad_doc)
    assert r.status_code == 400
    assert "openapi" in r.json()["detail"].lower()


def test_import_openapi_empty_schemas_returns_zero_counts(client):
    """POST /import/openapi with no schemas returns all-zero result."""
    empty_doc = {"openapi": "3.2.0", "info": {"title": "Empty"}, "components": {"schemas": {}}, "paths": {}}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],  # _assert_version_exists
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=empty_doc)
    assert r.status_code == 200
    body = r.json()
    assert body["classes_created"] == 0
    assert body["properties_created"] == 0


def test_import_openapi_response_has_detail_list(client):
    """Import response detail list mentions the created class name."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
            [],
            [],
            [],
            [],
        ]
        age_prop_row = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000061", "name": "age"}
        age_cp_row = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000071", "name": "age"}
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _PROP_ROW,
            _CP_ROW,
            age_prop_row,
            age_cp_row,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=_OPENAPI_DOC)
    body = r.json()
    assert isinstance(body["detail"], list)
    assert any("Person" in d for d in body["detail"])


# ---------------------------------------------------------------------------
# JSON Schema import tests (multi-schema with $defs)
# ---------------------------------------------------------------------------


def test_import_jsonschema_multi_returns_200(client):
    """POST /import/jsonschema returns 200 for a valid multi-schema document."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],   # class not found
            [],   # 'name' prop not found
            [],   # 'name' cp not found
        ]
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _PROP_ROW,
            _CP_ROW,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/jsonschema", json=_JSONSCHEMA_MULTI_DOC)
    assert r.status_code == 200


def test_import_jsonschema_multi_creates_class_from_defs(client):
    """JSON Schema multi-doc: one class created per $defs entry."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
            [],
            [],
        ]
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,
            _PROP_ROW,
            _CP_ROW,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/jsonschema", json=_JSONSCHEMA_MULTI_DOC)
    body = r.json()
    assert body["classes_created"] == 1
    assert body["properties_created"] == 1
    assert body["class_properties_created"] == 1


def test_import_jsonschema_single_creates_class_from_title(client):
    """JSON Schema single-schema doc: class name comes from 'title' field."""
    with mock_db_all() as mock_db:
        order_class_row = {**_CLASS_ROW, "name": "Order"}
        order_prop_row = {**_PROP_ROW, "name": "order_id"}
        order_cp_row = {**_CP_ROW, "name": "order_id"}
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],   # class not found
            [],   # prop not found
            [],   # cp not found
        ]
        mock_db.execute_mutation.side_effect = [
            order_class_row,
            order_prop_row,
            order_cp_row,
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/import/jsonschema",
            json=_JSONSCHEMA_SINGLE_DOC,
        )
    body = r.json()
    assert r.status_code == 200
    assert body["classes_created"] == 1
    assert body["properties_created"] == 1


def test_import_jsonschema_single_no_title_uses_fallback(client):
    """JSON Schema single-schema without 'title' uses 'Schema' as class name."""
    no_title_doc = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "id": {"type": "string"},
        },
    }
    schema_class_row = {**_CLASS_ROW, "name": "Schema"}
    schema_prop_row = {**_PROP_ROW, "name": "id"}
    schema_cp_row = {**_CP_ROW, "name": "id"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
            [],
            [],
        ]
        mock_db.execute_mutation.side_effect = [
            schema_class_row,
            schema_prop_row,
            schema_cp_row,
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/import/jsonschema",
            json=no_title_doc,
        )
    assert r.status_code == 200
    body = r.json()
    assert body["classes_created"] == 1


def test_import_jsonschema_version_not_found_returns_404(client):
    """POST /import/jsonschema returns 404 when version does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/import/jsonschema",
            json=_JSONSCHEMA_MULTI_DOC,
        )
    assert r.status_code == 404


def test_import_jsonschema_empty_defs_returns_zero_counts(client):
    """POST /import/jsonschema with empty $defs returns all-zero result."""
    empty_doc = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$defs": {},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/jsonschema", json=empty_doc)
    assert r.status_code == 200
    body = r.json()
    assert body["classes_created"] == 0
    assert body["properties_created"] == 0


def test_import_jsonschema_updates_existing_class(client):
    """JSON Schema import updates an existing class matched by name."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],  # class found — UPDATE
            [],            # prop not found
            [],            # cp not found
        ]
        mock_db.execute_mutation.side_effect = [
            _CLASS_ROW,   # UPDATE
            _PROP_ROW,
            _CP_ROW,
        ]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/import/jsonschema",
            json=_JSONSCHEMA_MULTI_DOC,
        )
    body = r.json()
    assert body["classes_updated"] == 1
    assert body["classes_created"] == 0


# ---------------------------------------------------------------------------
# Nested property tests
# ---------------------------------------------------------------------------


def test_import_openapi_nested_properties(client):
    """Import correctly links nested (child) properties to their parent class_property."""
    nested_doc: dict = {
        "openapi": "3.2.0",
        "info": {"title": "Nested API", "version": "1.0.0"},
        "components": {
            "schemas": {
                "Address": {
                    "type": "object",
                    "description": "An address",
                    "properties": {
                        "street": {
                            "type": "object",
                            "description": "Street info",
                            "properties": {
                                "line1": {"type": "string", "description": "Line 1"},
                            },
                        }
                    },
                }
            }
        },
        "paths": {},
    }

    addr_class = {**_CLASS_ROW, "name": "Address"}
    street_prop = {**_PROP_ROW, "name": "street"}
    street_cp = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000080", "name": "street"}
    line1_prop = {**_PROP_ROW, "id": "00000000-0000-0000-0000-000000000090", "name": "line1"}
    line1_cp = {**_CP_ROW, "id": "00000000-0000-0000-0000-000000000091", "name": "line1",
                "parent_id": "00000000-0000-0000-0000-000000000080"}

    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],           # Address class not found
            [],           # 'street' prop not found
            [],           # 'street' cp not found
            [],           # 'line1' prop not found
            [],           # 'line1' cp not found
        ]
        mock_db.execute_mutation.side_effect = [
            addr_class,
            street_prop,
            street_cp,
            line1_prop,
            line1_cp,
        ]
        r = client.post(f"/v1/versions/{_VERSION_ID}/import/openapi", json=nested_doc)

    assert r.status_code == 200
    body = r.json()
    assert body["classes_created"] == 1
    assert body["properties_created"] == 2
    assert body["class_properties_created"] == 2

