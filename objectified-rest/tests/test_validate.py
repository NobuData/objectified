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
