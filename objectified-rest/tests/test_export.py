"""Tests for export endpoints: /v1/versions/{version_id}/export/openapi and /jsonschema."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)

_VERSION_ID = "00000000-0000-0000-0000-000000000030"
_PROJECT_ID = "00000000-0000-0000-0000-000000000020"
_CLASS_ID = "00000000-0000-0000-0000-000000000050"
_CLASS_ID_2 = "00000000-0000-0000-0000-000000000051"
_PROP_ID = "00000000-0000-0000-0000-000000000060"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040"

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

_CLASS_ROW_2: dict[str, Any] = {
    "id": _CLASS_ID_2,
    "version_id": _VERSION_ID,
    "name": "Address",
    "description": "An address entity",
    "schema": {"type": "object"},
    "metadata": {},
    "enabled": True,
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

_PROP_ROW: dict[str, Any] = {
    "id": _PROP_ID,
    "class_id": _CLASS_ID,
    "property_id": "00000000-0000-0000-0000-000000000070",
    "parent_id": None,
    "name": "name",
    "description": "Full name",
    "data": {"type": "string"},
    "property_name": "name",
    "property_data": {"type": "string"},
}


@pytest.fixture
def client():
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# OpenAPI export tests
# ---------------------------------------------------------------------------


def test_export_openapi_returns_200(client):
    """GET /v1/versions/{id}/export/openapi returns a 200 with openapi field."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],   # _assert_version_exists
            [_CLASS_ROW],     # _load_classes_with_properties: class query
            [_PROP_ROW],      # _load_classes_with_properties: property query
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.status_code == 200
    body = r.json()
    assert body["openapi"] == "3.2.0"
    assert "info" in body
    assert "components" in body
    assert "schemas" in body["components"]


def test_export_openapi_contains_class_schema(client):
    """Exported OpenAPI spec contains Person schema in components.schemas."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.status_code == 200
    schemas = r.json()["components"]["schemas"]
    assert "Person" in schemas


def test_export_openapi_class_schema_has_properties(client):
    """Person schema in OpenAPI spec includes the 'name' property."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    schemas = r.json()["components"]["schemas"]
    person = schemas["Person"]
    assert "properties" in person
    assert "name" in person["properties"]


def test_export_openapi_uses_version_name_as_title(client):
    """OpenAPI info.title defaults to the version name."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.json()["info"]["title"] == "v1"


def test_export_openapi_overrides_project_name(client):
    """project_name query param overrides info.title."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"project_name": "My Custom API"},
        )
    assert r.json()["info"]["title"] == "My Custom API"


def test_export_openapi_overrides_version(client):
    """version query param overrides info.version."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"version": "2.5.0"},
        )
    assert r.json()["info"]["version"] == "2.5.0"


def test_export_openapi_empty_version_returns_empty_schemas(client):
    """OpenAPI export for a version with no classes returns empty schemas."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],  # no classes
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.status_code == 200
    assert r.json()["components"]["schemas"] == {}


def test_export_openapi_version_not_found_returns_404(client):
    """GET /v1/versions/{id}/export/openapi returns 404 for unknown version."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.status_code == 404


def test_export_openapi_multiple_classes(client):
    """OpenAPI export with multiple classes includes all in schemas."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW, _CLASS_ROW_2],
            [],  # no properties
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert r.status_code == 200
    schemas = r.json()["components"]["schemas"]
    assert "Person" in schemas
    assert "Address" in schemas


def test_export_openapi_includes_paths_empty(client):
    """Exported OpenAPI spec always includes an empty paths object."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert "paths" in r.json()


def test_export_openapi_has_content_disposition_header(client):
    """OpenAPI export response includes Content-Disposition attachment header."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/openapi")
    assert "content-disposition" in r.headers
    assert "attachment" in r.headers["content-disposition"]
    assert f"openapi-{_VERSION_ID}.json" in r.headers["content-disposition"]


# ---------------------------------------------------------------------------
# JSON Schema export tests (multi-schema)
# ---------------------------------------------------------------------------


def test_export_jsonschema_multi_returns_200(client):
    """GET /v1/versions/{id}/export/jsonschema returns 200 with $schema field."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    assert r.status_code == 200
    body = r.json()
    assert body["$schema"] == "https://json-schema.org/draft/2020-12/schema"


def test_export_jsonschema_multi_contains_defs(client):
    """Multi-schema JSON Schema document has $defs containing Person."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    body = r.json()
    assert "$defs" in body
    assert "Person" in body["$defs"]


def test_export_jsonschema_multi_person_has_properties(client):
    """Person $def in multi-schema document contains 'name' property."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    person = r.json()["$defs"]["Person"]
    assert "properties" in person
    assert "name" in person["properties"]


def test_export_jsonschema_multi_refs_use_defs_path(client):
    """Multi-schema JSON Schema converts $ref from #/components/schemas/ to #/$defs/."""
    class_with_ref = {
        **_CLASS_ROW,
        "name": "Order",
        "schema": {"type": "object"},
    }
    prop_with_ref = {
        **_PROP_ROW,
        "name": "person",
        "data": {"$ref": "#/components/schemas/Person"},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [class_with_ref],
            [prop_with_ref],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    order_props = r.json()["$defs"]["Order"]["properties"]
    assert order_props["person"]["$ref"] == "#/$defs/Person"


def test_export_jsonschema_multi_empty_version(client):
    """Multi-schema export for version with no classes returns empty $defs."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    assert r.status_code == 200
    assert r.json()["$defs"] == {}


def test_export_jsonschema_multi_version_not_found_returns_404(client):
    """GET /v1/versions/{id}/export/jsonschema returns 404 for unknown version."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    assert r.status_code == 404


def test_export_jsonschema_multi_has_content_disposition_header(client):
    """JSON Schema multi-export includes Content-Disposition attachment header."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/jsonschema")
    assert "content-disposition" in r.headers
    assert "attachment" in r.headers["content-disposition"]
    assert f"jsonschema-{_VERSION_ID}.json" in r.headers["content-disposition"]


def test_export_jsonschema_multi_overrides_title(client):
    """project_name query param overrides title in multi-schema document."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"project_name": "My Schema"},
        )
    assert r.json()["title"] == "My Schema"


# ---------------------------------------------------------------------------
# JSON Schema export tests (single-class)
# ---------------------------------------------------------------------------


def test_export_jsonschema_single_returns_200(client):
    """GET /v1/versions/{id}/export/jsonschema?class_id=... returns 200."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],   # _assert_version_exists
            [_CLASS_ROW],     # _load_single_class_with_properties: class query
            [_PROP_ROW],      # _load_single_class_with_properties: property query
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"class_id": _CLASS_ID},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["$schema"] == "https://json-schema.org/draft/2020-12/schema"


def test_export_jsonschema_single_has_no_defs(client):
    """Single-class JSON Schema document does not wrap schema in $defs."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"class_id": _CLASS_ID},
        )
    body = r.json()
    # Single-class export embeds the schema directly (no $defs wrapper)
    assert "$defs" not in body
    assert "properties" in body
    assert "name" in body["properties"]


def test_export_jsonschema_single_class_not_found_returns_404(client):
    """GET jsonschema with unknown class_id returns 404."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],  # class not found
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"class_id": _CLASS_ID},
        )
    assert r.status_code == 404


def test_export_jsonschema_single_has_content_disposition_header(client):
    """Single-class JSON Schema export Content-Disposition uses class_id."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"class_id": _CLASS_ID},
        )
    assert "content-disposition" in r.headers
    assert f"jsonschema-{_CLASS_ID}.json" in r.headers["content-disposition"]


def test_export_jsonschema_single_uses_version_name_as_title(client):
    """Single-class export uses the version name as the title when no project_name given."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/jsonschema",
            params={"class_id": _CLASS_ID},
        )
    # When project_name is not specified, version name ("v1") is used as fallback title
    assert r.json()["title"] == "v1"


# ---------------------------------------------------------------------------
# Generator unit tests
# ---------------------------------------------------------------------------


def test_openapi_generator_build_class_schema_simple():
    """build_class_schema returns a schema dict with type=object."""
    from app.generators.openapi_generator import build_class_schema

    cls = {
        "name": "Widget",
        "description": "A widget",
        "schema": {"type": "object"},
        "properties": [
            {
                "id": "p1",
                "class_id": "c1",
                "property_id": "pp1",
                "parent_id": None,
                "name": "label",
                "description": "Widget label",
                "data": {"type": "string"},
            }
        ],
    }
    schema = build_class_schema(cls)
    assert schema["type"] == "object"
    assert "properties" in schema
    assert "label" in schema["properties"]
    assert schema["properties"]["label"]["type"] == "string"


def test_openapi_generator_required_fields():
    """build_class_schema collects required=true properties into required array."""
    from app.generators.openapi_generator import build_class_schema

    cls = {
        "name": "Widget",
        "description": "",
        "schema": {},
        "properties": [
            {
                "id": "p1",
                "class_id": "c1",
                "property_id": "pp1",
                "parent_id": None,
                "name": "label",
                "description": "",
                "data": {"type": "string", "required": True},
            },
            {
                "id": "p2",
                "class_id": "c1",
                "property_id": "pp2",
                "parent_id": None,
                "name": "optional_field",
                "description": "",
                "data": {"type": "string"},
            },
        ],
    }
    schema = build_class_schema(cls)
    assert "required" in schema
    assert "label" in schema["required"]
    assert "optional_field" not in schema["required"]


def test_openapi_generator_nested_object_properties():
    """build_class_schema builds nested properties for type=object children."""
    from app.generators.openapi_generator import build_class_schema

    cls = {
        "name": "Order",
        "description": "",
        "schema": {},
        "properties": [
            {
                "id": "p1",
                "class_id": "c1",
                "property_id": "pp1",
                "parent_id": None,
                "name": "address",
                "description": "",
                "data": {"type": "object"},
            },
            {
                "id": "p2",
                "class_id": "c1",
                "property_id": "pp2",
                "parent_id": "p1",
                "name": "street",
                "description": "",
                "data": {"type": "string"},
            },
        ],
    }
    schema = build_class_schema(cls)
    address = schema["properties"]["address"]
    assert "properties" in address
    assert "street" in address["properties"]


def test_jsonschema_generator_convert_refs():
    """convert_refs_to_jsonschema rewrites OpenAPI refs to JSON Schema $defs refs."""
    from app.generators.jsonschema_generator import convert_refs_to_jsonschema

    obj = {"$ref": "#/components/schemas/Person"}
    result = convert_refs_to_jsonschema(obj)
    assert result["$ref"] == "#/$defs/Person"


def test_jsonschema_generator_convert_definitions_refs():
    """convert_refs_to_jsonschema rewrites Swagger 2.0 #/definitions/ refs."""
    from app.generators.jsonschema_generator import convert_refs_to_jsonschema

    obj = {"$ref": "#/definitions/Address"}
    result = convert_refs_to_jsonschema(obj)
    assert result["$ref"] == "#/$defs/Address"


def test_jsonschema_generator_multi_structure():
    """generate_jsonschema_multi returns valid 2020-12 document structure."""
    from app.generators.jsonschema_generator import generate_jsonschema_multi

    classes = [
        {
            "name": "Person",
            "description": "A person",
            "schema": {"type": "object"},
            "properties": [],
        }
    ]
    doc = generate_jsonschema_multi(classes, project_name="Test", version="1.0.0")
    assert doc["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "Person" in doc["$defs"]


def test_jsonschema_generator_single_structure():
    """generate_jsonschema_single returns a standalone 2020-12 document."""
    from app.generators.jsonschema_generator import generate_jsonschema_single

    cls = {
        "name": "Person",
        "description": "A person",
        "schema": {"type": "object"},
        "properties": [
            {
                "id": "p1",
                "class_id": "c1",
                "property_id": "pp1",
                "parent_id": None,
                "name": "age",
                "description": "",
                "data": {"type": "integer"},
            }
        ],
    }
    doc = generate_jsonschema_single(cls, project_name="Person", version="1.0.0")
    assert doc["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "properties" in doc
    assert "age" in doc["properties"]
    assert "$defs" not in doc


# ---------------------------------------------------------------------------
# Enhanced OpenAPI generator tests (servers, tags, security, etc.)
# ---------------------------------------------------------------------------


def test_openapi_generator_with_servers():
    """generate_openapi_spec includes servers when provided."""
    from app.generators.openapi_generator import generate_openapi_spec

    servers = [{"url": "https://api.example.com", "description": "Production"}]
    doc = generate_openapi_spec([], servers=servers)
    assert "servers" in doc
    assert doc["servers"] == servers


def test_openapi_generator_with_tags():
    """generate_openapi_spec includes tags when provided."""
    from app.generators.openapi_generator import generate_openapi_spec

    tags = [{"name": "Users", "description": "User operations"}]
    doc = generate_openapi_spec([], tags=tags)
    assert "tags" in doc
    assert doc["tags"] == tags


def test_openapi_generator_with_security():
    """generate_openapi_spec includes security when provided."""
    from app.generators.openapi_generator import generate_openapi_spec

    security = [{"Bearer": []}]
    doc = generate_openapi_spec([], security=security)
    assert "security" in doc
    assert doc["security"] == security


def test_openapi_generator_with_external_docs():
    """generate_openapi_spec includes externalDocs when provided."""
    from app.generators.openapi_generator import generate_openapi_spec

    external_docs = {"url": "https://docs.example.com", "description": "API docs"}
    doc = generate_openapi_spec([], external_docs=external_docs)
    assert "externalDocs" in doc
    assert doc["externalDocs"] == external_docs


def test_openapi_generator_with_metadata_contact():
    """generate_openapi_spec populates info.contact from metadata."""
    from app.generators.openapi_generator import generate_openapi_spec

    metadata = {"contact": {"name": "Support", "email": "support@example.com"}}
    doc = generate_openapi_spec([], metadata=metadata)
    assert "contact" in doc["info"]
    assert doc["info"]["contact"]["name"] == "Support"
    assert doc["info"]["contact"]["email"] == "support@example.com"


def test_openapi_generator_with_metadata_license():
    """generate_openapi_spec populates info.license from metadata."""
    from app.generators.openapi_generator import generate_openapi_spec

    metadata = {"license": {"name": "MIT", "url": "https://opensource.org/licenses/MIT"}}
    doc = generate_openapi_spec([], metadata=metadata)
    assert "license" in doc["info"]
    assert doc["info"]["license"]["name"] == "MIT"


def test_openapi_generator_with_metadata_summary():
    """generate_openapi_spec populates info.summary from metadata."""
    from app.generators.openapi_generator import generate_openapi_spec

    metadata = {"summary": "A brief summary of the API"}
    doc = generate_openapi_spec([], metadata=metadata)
    assert doc["info"]["summary"] == "A brief summary of the API"


def test_openapi_generator_with_metadata_terms_of_service():
    """generate_openapi_spec populates info.termsOfService from metadata."""
    from app.generators.openapi_generator import generate_openapi_spec

    metadata = {"terms_of_service": "https://example.com/tos"}
    doc = generate_openapi_spec([], metadata=metadata)
    assert doc["info"]["termsOfService"] == "https://example.com/tos"


def test_openapi_generator_omits_absent_optional_fields():
    """generate_openapi_spec omits servers/tags/security/externalDocs when not supplied."""
    from app.generators.openapi_generator import generate_openapi_spec

    doc = generate_openapi_spec([])
    assert "servers" not in doc
    assert "tags" not in doc
    assert "security" not in doc
    assert "externalDocs" not in doc


# ---------------------------------------------------------------------------
# Export endpoint tests with JSON query parameters
# ---------------------------------------------------------------------------


def test_export_openapi_with_servers_param(client):
    """servers JSON query param adds servers to the exported OpenAPI doc."""
    import json as _json

    servers = [{"url": "https://api.example.com", "description": "Production"}]
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],  # no classes
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"servers": _json.dumps(servers)},
        )
    assert r.status_code == 200
    assert r.json()["servers"] == servers


def test_export_openapi_with_tags_param(client):
    """tags JSON query param adds tags to the exported OpenAPI doc."""
    import json as _json

    tags = [{"name": "Users", "description": "User ops"}]
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"tags": _json.dumps(tags)},
        )
    assert r.status_code == 200
    assert r.json()["tags"] == tags


def test_export_openapi_with_metadata_param(client):
    """metadata JSON query param populates info fields in exported doc."""
    import json as _json

    metadata = {"contact": {"name": "Dev Team"}, "summary": "Test API"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"metadata": _json.dumps(metadata)},
        )
    assert r.status_code == 200
    info = r.json()["info"]
    assert info["summary"] == "Test API"
    assert info["contact"]["name"] == "Dev Team"


def test_export_openapi_invalid_json_param_returns_400(client):
    """Invalid JSON in servers param returns 400."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/openapi",
            params={"servers": "not-valid-json"},
        )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Validation rules export (GitHub #122)
# ---------------------------------------------------------------------------


def test_export_validation_rules_returns_200(client):
    """GET /v1/versions/{id}/export/validation-rules returns structured JSON."""
    prop_rich = {
        **_PROP_ROW,
        "data": {
            "type": "string",
            "format": "email",
            "minLength": 3,
            "required": True,
        },
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [prop_rich],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/validation-rules")
    assert r.status_code == 200
    body = r.json()
    assert body["exportKind"] == "objectified.validation-rules"
    assert body["schemaVersion"] == "1.0.0"
    assert body["versionId"] == _VERSION_ID
    assert len(body["classes"]) == 1
    name_rules = body["classes"][0]["properties"]["name"]
    assert name_rules["required"] is True
    assert name_rules["format"] == "email"
    assert name_rules["minLength"] == 3


def test_export_validation_rules_single_class(client):
    """class_id query limits export to one class."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_VERSION_ROW],
            [_CLASS_ROW],
            [_PROP_ROW],
        ]
        r = client.get(
            f"/v1/versions/{_VERSION_ID}/export/validation-rules",
            params={"class_id": _CLASS_ID},
        )
    assert r.status_code == 200
    assert len(r.json()["classes"]) == 1
    assert "content-disposition" in r.headers
    assert _CLASS_ID in r.headers["content-disposition"]


def test_export_validation_rules_version_not_found(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/versions/{_VERSION_ID}/export/validation-rules")
    assert r.status_code == 404


def test_validation_rules_export_module_unit():
    """Generator strips non-validation noise from resolved schema."""
    from app.generators.validation_rules_export import generate_validation_rules_export

    classes = [
        {
            "name": "Item",
            "description": "An item",
            "schema": {"type": "object"},
            "properties": [
                {
                    "id": "p1",
                    "parent_id": None,
                    "name": "qty",
                    "description": "Quantity",
                    "data": {"type": "integer", "minimum": 0, "maximum": 100},
                },
            ],
        }
    ]
    doc = generate_validation_rules_export(
        classes, version_id="abc", version_name="v1", title="T"
    )
    qty = doc["classes"][0]["properties"]["qty"]
    assert qty["type"] == "integer"
    assert qty["minimum"] == 0
    assert qty["maximum"] == 100
    assert "description" not in qty


