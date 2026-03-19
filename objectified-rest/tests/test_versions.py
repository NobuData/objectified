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

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}
_MEMBER_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_PROJECT_ROW: dict[str, Any] = {"id": _PROJECT_ID, "tenant_id": _TENANT_ID}
_VERSION_ROW: dict[str, Any] = {
    "id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "source_version_id": None,
    "creator_id": _ACCOUNT_ID,
    "name": "v1",
    "code_generation_tag": None,
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


@pytest.fixture
def member_client():
    """FastAPI test client with non-admin tenant-member caller."""
    app.dependency_overrides[require_authenticated] = lambda: _MEMBER_CALLER
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


def test_list_tags_for_version_returns_aggregated_tags(client):
    """GET /v1/versions/{id}/tags returns all tag names from classes (GitHub #103)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [
                {"metadata": {"tags": ["tag-a", "tag-b"]}},
                {"metadata": {"tags": ["tag-b", "tag-c"]}},
                {"metadata": {}},
            ],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/tags")
    assert r.status_code == 200
    assert r.json() == ["tag-a", "tag-b", "tag-c"]


def test_list_tags_for_version_empty(client):
    """GET .../tags returns [] when no classes have tags."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()], []]
        r = client.get(f"/v1/versions/{_VERSION_ID}/tags")
    assert r.status_code == 200
    assert r.json() == []


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


def test_update_version_code_generation_tag_only(client):
    """PUT with only code_generation_tag updates tag (GH-121)."""
    updated = {**_VERSION_ROW, "code_generation_tag": "api-v2"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()]]
        mock_db.execute_mutation.side_effect = [updated, None]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}",
            json={"code_generation_tag": "api-v2"},
        )
    assert r.status_code == 200
    assert r.json()["code_generation_tag"] == "api-v2"


def test_update_version_invalid_code_generation_tag_returns_400(client):
    """PUT rejects invalid code_generation_tag pattern."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()]]
        r = client.put(
            f"/v1/versions/{_VERSION_ID}",
            json={"code_generation_tag": "bad tag!"},
        )
    assert r.status_code == 400


def test_update_version_duplicate_code_generation_tag_returns_409(client):
    """PUT returns 409 when unique index on code_generation_tag is violated."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [[_version_lookup_row()]]
        mock_db.execute_mutation.side_effect = Exception(
            "23505 duplicate key value violates unique constraint"
        )
        r = client.put(
            f"/v1/versions/{_VERSION_ID}",
            json={"code_generation_tag": "api-v1"},
        )
    assert r.status_code == 409


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


# ---------------------------------------------------------------------------
# Version Snapshot endpoints
# ---------------------------------------------------------------------------

_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000060"

_SNAPSHOT_ROW: dict[str, Any] = {
    "id": _SNAPSHOT_ID,
    "version_id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "committed_by": _ACCOUNT_ID,
    "revision": 1,
    "label": "initial-commit",
    "description": "First snapshot",
    "snapshot": {"classes": []},
    "created_at": _NOW,
}


def test_commit_version_snapshot_returns_201(client):
    """POST /v1/versions/{id}/snapshots commits a snapshot and returns 201."""
    with mock_db_all() as mock_db:
        # 1. _assert_version_exists (execute_query)
        # 2. _capture_version_state – class query (execute_query)
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],  # no classes yet
        ]
        mock_db.execute_mutation.return_value = _SNAPSHOT_ROW
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/snapshots",
            json={"label": "initial-commit", "description": "First snapshot"},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["revision"] == 1
    assert body["label"] == "initial-commit"
    assert body["snapshot"] == {"classes": []}


def test_commit_version_snapshot_captures_classes_and_properties(client):
    """POST /v1/versions/{id}/snapshots captures classes and their properties."""
    class_id = "00000000-0000-0000-0000-000000000070"
    class_row = {
        "id": class_id,
        "version_id": _VERSION_ID,
        "name": "Person",
        "description": "A person class",
        "schema": {},
        "metadata": {},
        "enabled": True,
        "created_at": _NOW,
        "updated_at": None,
    }
    prop_row = {
        "id": "00000000-0000-0000-0000-000000000080",
        "class_id": class_id,
        "property_id": "00000000-0000-0000-0000-000000000090",
        "name": "first_name",
        "description": "First name",
        "data": {"type": "string"},
        "property_name": "first_name",
        "property_description": "First name",
        "property_data": {"type": "string"},
        "property_enabled": True,
    }
    snapshot_with_data = {
        **_SNAPSHOT_ROW,
        "snapshot": {"classes": [{**class_row, "properties": [prop_row]}]},
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # _assert_version_exists
            [class_row],              # class query in _capture_version_state
            [prop_row],               # property query for the class
        ]
        mock_db.execute_mutation.return_value = snapshot_with_data
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/snapshots",
            json={"label": "with-data"},
        )
    assert r.status_code == 201
    snapshot = r.json()["snapshot"]
    assert len(snapshot["classes"]) == 1
    assert snapshot["classes"][0]["name"] == "Person"
    assert len(snapshot["classes"][0]["properties"]) == 1
    assert snapshot["classes"][0]["properties"][0]["name"] == "first_name"


def test_commit_version_snapshot_deleted_version_returns_404(client):
    """POST /v1/versions/{id}/snapshots returns 404 for deleted version."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/snapshots",
            json={},
        )
    assert r.status_code == 404


def test_list_version_snapshots_returns_list(client):
    """GET /v1/versions/{id}/snapshots returns list of snapshots."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_SNAPSHOT_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["revision"] == 1


def test_list_version_snapshots_empty(client):
    """GET /v1/versions/{id}/snapshots returns empty list when no snapshots."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots")
    assert r.status_code == 200
    assert r.json() == []


_SNAPSHOT_METADATA_ROW: dict[str, Any] = {
    "id": _SNAPSHOT_ID,
    "version_id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "committed_by": _ACCOUNT_ID,
    "revision": 1,
    "label": "initial-commit",
    "description": "First snapshot",
    "created_at": _NOW,
}


def test_list_version_snapshots_metadata_returns_list(client):
    """GET /v1/versions/{id}/snapshots/metadata returns metadata without snapshot payload."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_SNAPSHOT_METADATA_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/metadata")
    assert r.status_code == 200
    assert len(r.json()) == 1
    body = r.json()[0]
    assert body["revision"] == 1
    assert body["version_id"] == _VERSION_ID
    assert "snapshot" not in body


def test_list_version_snapshots_metadata_empty(client):
    """GET /v1/versions/{id}/snapshots/metadata returns empty list when no snapshots."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/metadata")
    assert r.status_code == 200
    assert r.json() == []


def test_list_version_snapshots_schema_changes_returns_diff_summary(client):
    """GET /v1/versions/{id}/snapshots/schema-changes returns per-snapshot schema diffs."""

    snapshot_1 = {
        **_SNAPSHOT_METADATA_ROW,
        "snapshot": {"classes": []},
    }
    snapshot_2_classes = [
        {
            "id": "class-1",
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Person class",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
            "properties": [
                {
                    "id": "cp-1",
                    "class_id": "class-1",
                    "property_id": "prop-1",
                    "parent_id": None,
                    "name": "first_name",
                    "description": "First name",
                    "data": {"type": "string"},
                    "property_name": "first_name",
                    "property_description": "First name",
                    "property_data": {"type": "string"},
                    "property_enabled": True,
                }
            ],
        }
    ]
    snapshot_2 = {
        **_SNAPSHOT_METADATA_ROW,
        "id": "snap-2",
        "revision": 2,
        "label": "second",
        "description": "Second snapshot",
        "snapshot": {"classes": snapshot_2_classes},
        "created_at": _NOW,
    }

    with mock_db_all() as mock_db:
        # 1) _assert_version_exists
        # 2) SELECT id, ..., snapshot, created_at FROM objectified.version_snapshot ORDER BY revision ASC
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [snapshot_1, snapshot_2],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/schema-changes")

    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert body[0]["revision"] == 2
    assert body[0]["diff"]["added_class_names"] == ["Person"]
    assert body[0]["diff"]["removed_class_names"] == []
    assert body[0]["diff"]["modified_classes"] == []


def test_list_version_snapshots_schema_changes_property_level_diff(client):
    """schema-changes endpoint detects added/removed/modified properties within a class."""

    def _make_prop(cp_id: str, prop_id: str, name: str, data: dict) -> dict:
        return {
            "id": cp_id,
            "class_id": "class-1",
            "property_id": prop_id,
            "parent_id": None,
            "name": name,
            "description": None,
            "data": data,
            "property_name": name,
            "property_description": None,
            "property_data": data,
            "property_enabled": True,
        }

    base_class = {
        "id": "class-1",
        "version_id": _VERSION_ID,
        "name": "Order",
        "description": None,
        "schema": {},
        "metadata": {},
        "enabled": True,
        "created_at": _NOW,
        "updated_at": None,
    }

    snapshot_1 = {
        **_SNAPSHOT_METADATA_ROW,
        "revision": 1,
        "snapshot": {
            "classes": [
                {
                    **base_class,
                    "properties": [
                        _make_prop("cp-1", "prop-1", "amount", {"type": "number"}),
                        _make_prop("cp-2", "prop-2", "currency", {"type": "string"}),
                    ],
                }
            ]
        },
    }
    snapshot_2 = {
        **_SNAPSHOT_METADATA_ROW,
        "id": "snap-2",
        "revision": 2,
        "label": "second",
        "description": "Second snapshot",
        "created_at": _NOW,
        "snapshot": {
            "classes": [
                {
                    **base_class,
                    "properties": [
                        # amount modified (type changed), currency removed, status added
                        _make_prop("cp-1", "prop-1", "amount", {"type": "integer"}),
                        _make_prop("cp-3", "prop-3", "status", {"type": "string"}),
                    ],
                }
            ]
        },
    }

    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [snapshot_1, snapshot_2],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/schema-changes")

    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    diff = body[0]["diff"]
    assert diff["added_class_names"] == []
    assert diff["removed_class_names"] == []
    assert len(diff["modified_classes"]) == 1
    mod = diff["modified_classes"][0]
    assert mod["class_name"] == "Order"
    assert mod["added_property_names"] == ["status"]
    assert mod["removed_property_names"] == ["currency"]
    assert mod["modified_property_names"] == ["amount"]


def test_list_version_snapshots_schema_changes_duplicate_property_names(client):
    """Duplicate normalized property names within a class are handled correctly.

    Two properties sharing the same name but with different property_ids must
    each get a unique composite key so neither silently overwrites the other.
    """

    def _make_prop(cp_id: str, prop_id: str, name: str) -> dict:
        return {
            "id": cp_id,
            "class_id": "class-1",
            "property_id": prop_id,
            "parent_id": None,
            "name": name,
            "description": None,
            "data": {"type": "string"},
            "property_name": name,
            "property_description": None,
            "property_data": {"type": "string"},
            "property_enabled": True,
        }

    base_class = {
        "id": "class-1",
        "version_id": _VERSION_ID,
        "name": "Item",
        "description": None,
        "schema": {},
        "metadata": {},
        "enabled": True,
        "created_at": _NOW,
        "updated_at": None,
    }

    # Snapshot 1: two properties with normalized name "tag" but different property_ids
    snapshot_1 = {
        **_SNAPSHOT_METADATA_ROW,
        "revision": 1,
        "snapshot": {
            "classes": [
                {
                    **base_class,
                    "properties": [
                        _make_prop("cp-1", "prop-1", "tag"),
                        _make_prop("cp-2", "prop-2", "tag"),
                    ],
                }
            ]
        },
    }
    # Snapshot 2: only one "tag" property (prop-2 remains, prop-1 removed)
    snapshot_2 = {
        **_SNAPSHOT_METADATA_ROW,
        "id": "snap-2",
        "revision": 2,
        "label": "second",
        "description": "Second snapshot",
        "created_at": _NOW,
        "snapshot": {
            "classes": [
                {
                    **base_class,
                    "properties": [
                        _make_prop("cp-2", "prop-2", "tag"),
                    ],
                }
            ]
        },
    }

    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [snapshot_1, snapshot_2],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/schema-changes")

    assert r.status_code == 200
    body = r.json()
    diff = body[0]["diff"]
    # The removal of prop-1 (tag) should be reflected as a modification
    assert len(diff["modified_classes"]) == 1
    mod = diff["modified_classes"][0]
    assert mod["class_name"] == "Item"
    # prop-1 "tag" was removed; prop-2 "tag" persisted unchanged
    assert mod["removed_property_names"] == ["tag"]
    assert mod["added_property_names"] == []
    assert mod["modified_property_names"] == []


def test_get_version_snapshot_by_revision_returns_snapshot(client):
    """GET /v1/versions/{id}/snapshots/{revision} returns snapshot."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [_SNAPSHOT_ROW],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/1")
    assert r.status_code == 200
    body = r.json()
    assert body["revision"] == 1
    assert body["version_id"] == _VERSION_ID


def test_get_version_snapshot_by_revision_not_found_returns_404(client):
    """GET /v1/versions/{id}/snapshots/{revision} returns 404 when missing."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
            [],
        ]
        r = client.get(f"/v1/versions/{_VERSION_ID}/snapshots/99")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Publish / Unpublish / Freeze-schema endpoints
# ---------------------------------------------------------------------------


def test_publish_version_returns_200(client):
    """POST /v1/versions/{id}/publish publishes the version."""
    published_row = {**_VERSION_ROW, "published": True, "published_at": _NOW, "visibility": "private"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
        ]
        mock_db.execute_mutation.side_effect = [published_row, None]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/publish",
            json={"visibility": "private"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["published"] is True
    assert body["visibility"] == "private"


def test_publish_version_with_public_visibility(client):
    """POST /v1/versions/{id}/publish publishes the version as public."""
    published_row = {**_VERSION_ROW, "published": True, "published_at": _NOW, "visibility": "public"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
        ]
        mock_db.execute_mutation.side_effect = [published_row, None]
        r = client.post(
            f"/v1/versions/{_VERSION_ID}/publish",
            json={"visibility": "public"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["published"] is True
    assert body["visibility"] == "public"


def test_publish_version_already_published_returns_400(client):
    """POST /v1/versions/{id}/publish returns 400 if already published."""
    already_published = {**_version_lookup_row(), "published": True, "published_at": _NOW, "visibility": "private"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [already_published]
        r = client.post(f"/v1/versions/{_VERSION_ID}/publish")
    assert r.status_code == 400
    assert "already published" in r.json()["detail"].lower()


def test_publish_version_not_found_returns_404(client):
    """POST /v1/versions/{id}/publish returns 404 when version not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(f"/v1/versions/{_VERSION_ID}/publish")
    assert r.status_code == 404


def test_publish_version_no_body_defaults_to_private(client):
    """POST /v1/versions/{id}/publish without body defaults to private visibility."""
    published_row = {**_VERSION_ROW, "published": True, "published_at": _NOW, "visibility": "private"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],
        ]
        mock_db.execute_mutation.side_effect = [published_row, None]
        r = client.post(f"/v1/versions/{_VERSION_ID}/publish")
    assert r.status_code == 200
    body = r.json()
    assert body["published"] is True


def test_unpublish_version_returns_200(client):
    """POST /v1/versions/{id}/unpublish unpublishes the version."""
    published_lookup = {**_version_lookup_row(), "published": True, "published_at": _NOW, "visibility": "private"}
    unpublished_row = {**_VERSION_ROW, "published": False, "published_at": None, "visibility": "private"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [published_lookup]
        mock_db.execute_mutation.side_effect = [unpublished_row, None]
        r = client.post(f"/v1/versions/{_VERSION_ID}/unpublish")
    assert r.status_code == 200
    body = r.json()
    assert body["published"] is False
    assert body["published_at"] is None


def test_unpublish_version_not_published_returns_400(client):
    """POST /v1/versions/{id}/unpublish returns 400 if version is not published."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = client.post(f"/v1/versions/{_VERSION_ID}/unpublish")
    assert r.status_code == 400
    assert "not published" in r.json()["detail"].lower()


def test_unpublish_version_not_found_returns_404(client):
    """POST /v1/versions/{id}/unpublish returns 404 when version not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(f"/v1/versions/{_VERSION_ID}/unpublish")
    assert r.status_code == 404


def test_freeze_schema_returns_201(client):
    """POST /v1/versions/{id}/freeze-schema creates a frozen snapshot and returns 201."""
    freeze_snapshot = {
        **_SNAPSHOT_ROW,
        "label": "frozen-schema",
        "description": "Schema frozen via freeze-schema endpoint",
    }
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # _assert_version_exists
            [],                       # _capture_version_state: class query
        ]
        mock_db.execute_mutation.return_value = freeze_snapshot
        r = client.post(f"/v1/versions/{_VERSION_ID}/freeze-schema")
    assert r.status_code == 201
    body = r.json()
    assert body["label"] == "frozen-schema"
    assert body["revision"] == 1


def test_freeze_schema_already_frozen_returns_400(client):
    """POST /v1/versions/{id}/freeze-schema returns 400 if snapshot already exists (INSERT blocked)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_lookup_row()],  # _assert_version_exists
            [],                       # _capture_version_state: class query
        ]
        # INSERT returns None because WHERE NOT EXISTS blocked it (snapshot already exists)
        mock_db.execute_mutation.return_value = None
        r = client.post(f"/v1/versions/{_VERSION_ID}/freeze-schema")
    assert r.status_code == 400
    assert "already frozen" in r.json()["detail"].lower()


def test_freeze_schema_version_not_found_returns_404(client):
    """POST /v1/versions/{id}/freeze-schema returns 404 when version not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(f"/v1/versions/{_VERSION_ID}/freeze-schema")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 403 tests for endpoints requiring user authentication (JWT only)
# ---------------------------------------------------------------------------

_API_KEY_CALLER = {"auth_method": "api_key", "account_id": _ACCOUNT_ID, "is_admin": True}


@pytest.fixture
def api_key_client():
    """FastAPI test client with require_authenticated returning an API-key-style caller (no user_id)."""
    app.dependency_overrides[require_authenticated] = lambda: _API_KEY_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_publish_version_api_key_caller_returns_403(api_key_client):
    """POST /v1/versions/{id}/publish returns 403 when caller has no user_id (API key auth)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = api_key_client.post(f"/v1/versions/{_VERSION_ID}/publish")
    assert r.status_code == 403
    assert "user authentication" in r.json()["detail"].lower()


def test_unpublish_version_api_key_caller_returns_403(api_key_client):
    """POST /v1/versions/{id}/unpublish returns 403 when caller has no user_id (API key auth)."""
    published_lookup = {**_version_lookup_row(), "published": True, "published_at": _NOW, "visibility": "private"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [published_lookup]
        r = api_key_client.post(f"/v1/versions/{_VERSION_ID}/unpublish")
    assert r.status_code == 403
    assert "user authentication" in r.json()["detail"].lower()


def test_freeze_schema_api_key_caller_returns_403(api_key_client):
    """POST /v1/versions/{id}/freeze-schema returns 403 when caller has no user_id (API key auth)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [_version_lookup_row()]
        r = api_key_client.post(f"/v1/versions/{_VERSION_ID}/freeze-schema")
    assert r.status_code == 403
    assert "user authentication" in r.json()["detail"].lower()





# ---------------------------------------------------------------------------
# RBAC: non-admin caller permission checks
# ---------------------------------------------------------------------------


def test_list_versions_non_member_returns_403(member_client):
    """GET /v1/tenants/{tid}/projects/{pid}/versions returns 403 when caller is not a tenant member."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],  # _is_tenant_admin → not admin
            [],  # _is_tenant_member → not a member → 403
        ]
        r = member_client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions")
    assert r.status_code == 403


def test_list_versions_member_returns_200(member_client):
    """GET /v1/tenants/{tid}/projects/{pid}/versions returns 200 for a non-admin tenant member (version:read is implicit)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],                    # _is_tenant_admin → not admin
            [{"id": _TENANT_ID}],  # _is_tenant_member → member; version:read is implicit → allowed
            [{"id": _TENANT_ID}],  # _assert_tenant_exists
            [_PROJECT_ROW],        # _assert_project_exists
            [_VERSION_ROW],        # list versions
        ]
        r = member_client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions")
    assert r.status_code == 200


def test_create_version_member_without_write_permission_returns_403(member_client):
    """POST /v1/tenants/{tid}/projects/{pid}/versions returns 403 when caller lacks version:write permission."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],                    # _is_tenant_admin → not admin
            [{"id": _TENANT_ID}],  # _is_tenant_member → member
            [],                    # _has_rbac_permission → no version:write → 403
        ]
        r = member_client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions",
            json={"name": "v2", "description": "Test", "change_log": "New version"},
        )
    assert r.status_code == 403
