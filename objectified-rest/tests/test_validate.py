"""Tests for the schema validation endpoint (/v1/validate/json-schema)."""

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app


_CALLER = {"auth_method": "jwt", "user_id": "00000000-0000-0000-0000-000000000001", "is_admin": False}


@pytest.fixture()
def client():
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_validate_valid_schema_returns_valid_true(client):
    """POST /v1/validate/json-schema returns valid=true for a well-formed schema."""
    r = client.post(
        "/v1/validate/json-schema",
        json={"schema": {"type": "object", "properties": {"name": {"type": "string"}}}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["errors"] == []


def test_validate_empty_schema_returns_valid_true(client):
    """POST /v1/validate/json-schema returns valid=true for an empty schema (bare {} is valid)."""
    r = client.post("/v1/validate/json-schema", json={"schema": {}})
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["errors"] == []


def test_validate_invalid_schema_returns_valid_false_with_errors(client):
    """POST /v1/validate/json-schema returns valid=false and error details for bad schema."""
    r = client.post(
        "/v1/validate/json-schema",
        json={"schema": {"type": 123}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert len(body["errors"]) >= 1
    for error in body["errors"]:
        assert error["standard"] == "json-schema-2020-12"
        assert "message" in error
        assert "path" in error
        assert "schema_path" in error


def test_validate_returns_only_json_schema_standard(client):
    """POST /v1/validate/json-schema only reports json-schema-2020-12, not openapi-3.2.0-schema-object."""
    r = client.post(
        "/v1/validate/json-schema",
        json={"schema": {"type": 999, "minLength": "not-a-number"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    standards = {error["standard"] for error in body["errors"]}
    assert standards == {"json-schema-2020-12"}
    assert "openapi-3.2.0-schema-object" not in standards


def test_validate_missing_schema_field_defaults_to_empty(client):
    """POST /v1/validate/json-schema with no schema field defaults to empty dict (valid)."""
    r = client.post("/v1/validate/json-schema", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True


# ---------------------------------------------------------------------------
# OpenAPI document validation tests
# ---------------------------------------------------------------------------


def test_validate_openapi_valid_document(client):
    """POST /v1/validate/openapi-document returns valid=true for a well-formed OpenAPI doc."""
    doc = {
        "openapi": "3.2.0",
        "info": {"title": "My API", "version": "1.0.0"},
        "components": {
            "schemas": {
                "Person": {"type": "object", "properties": {"name": {"type": "string"}}},
            }
        },
        "paths": {"/test": {"get": {"summary": "Test"}}},
    }
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["openapi_version"] == "3.2.0"
    assert body["title"] == "My API"
    assert body["errors"] == []
    assert body["warnings"] == []


def test_validate_openapi_missing_openapi_version(client):
    """POST /v1/validate/openapi-document reports error when 'openapi' field is missing."""
    doc = {"info": {"title": "No Version", "version": "1.0.0"}}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("openapi" in e.lower() for e in body["errors"])


def test_validate_openapi_unsupported_version(client):
    """POST /v1/validate/openapi-document reports error for non-3.x version."""
    doc = {"openapi": "2.0", "info": {"title": "Old API", "version": "1.0.0"}}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("3.x" in e or "Unsupported" in e for e in body["errors"])


def test_validate_openapi_missing_info(client):
    """POST /v1/validate/openapi-document reports error when 'info' is missing."""
    doc = {"openapi": "3.1.0"}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("info" in e.lower() for e in body["errors"])


def test_validate_openapi_missing_info_title(client):
    """POST /v1/validate/openapi-document reports error when 'info.title' is missing."""
    doc = {"openapi": "3.1.0", "info": {"version": "1.0.0"}}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("title" in e.lower() for e in body["errors"])


def test_validate_openapi_missing_info_version(client):
    """POST /v1/validate/openapi-document reports error when 'info.version' is missing."""
    doc = {"openapi": "3.1.0", "info": {"title": "My API"}}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("version" in e.lower() for e in body["errors"])


def test_validate_openapi_warns_no_components(client):
    """POST /v1/validate/openapi-document warns when 'components' is missing."""
    doc = {"openapi": "3.1.0", "info": {"title": "My API", "version": "1.0.0"}}
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert any("components" in w.lower() for w in body["warnings"])


def test_validate_openapi_warns_empty_schemas(client):
    """POST /v1/validate/openapi-document warns when 'components.schemas' is empty."""
    doc = {
        "openapi": "3.1.0",
        "info": {"title": "My API", "version": "1.0.0"},
        "components": {"schemas": {}},
    }
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert any("schemas" in w.lower() for w in body["warnings"])


def test_validate_openapi_warns_no_paths(client):
    """POST /v1/validate/openapi-document warns when 'paths' section is absent."""
    doc = {
        "openapi": "3.1.0",
        "info": {"title": "My API", "version": "1.0.0"},
        "components": {"schemas": {"Foo": {"type": "object"}}},
    }
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert any("paths" in w.lower() for w in body["warnings"])


def test_validate_openapi_warns_empty_paths(client):
    """POST /v1/validate/openapi-document warns when 'paths' section is empty."""
    doc = {
        "openapi": "3.1.0",
        "info": {"title": "My API", "version": "1.0.0"},
        "components": {"schemas": {"Foo": {"type": "object"}}},
        "paths": {},
    }
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert any("paths" in w.lower() and "empty" in w.lower() for w in body["warnings"])


def test_validate_openapi_multiple_errors(client):
    """POST /v1/validate/openapi-document accumulates multiple errors."""
    doc = {}  # Missing everything
    r = client.post("/v1/validate/openapi-document", json=doc)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert len(body["errors"]) >= 2  # at least 'openapi' and 'info'

