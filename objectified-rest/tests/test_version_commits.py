"""Tests for version commit REST endpoints (commit, push, pull, merge)."""

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
_TARGET_VERSION_ID = "00000000-0000-0000-0000-000000000031"
_SOURCE_VERSION_ID = "00000000-0000-0000-0000-000000000032"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040"
_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000060"
_CLASS_ID = "00000000-0000-0000-0000-000000000070"
_PROPERTY_ID = "00000000-0000-0000-0000-000000000080"
_CP_ID = "00000000-0000-0000-0000-000000000090"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}
_MEMBER_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_SCOPE_ROW: dict[str, Any] = {"tenant_id": _TENANT_ID, "project_id": _PROJECT_ID}

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

_TARGET_VERSION_ROW: dict[str, Any] = {
    **_VERSION_ROW,
    "id": _TARGET_VERSION_ID,
    "name": "v2",
    "description": "Target version",
}

_SOURCE_VERSION_ROW: dict[str, Any] = {
    **_VERSION_ROW,
    "id": _SOURCE_VERSION_ID,
    "name": "v3",
    "description": "Source version",
}

_SNAPSHOT_ROW: dict[str, Any] = {
    "id": _SNAPSHOT_ID,
    "version_id": _VERSION_ID,
    "project_id": _PROJECT_ID,
    "committed_by": _ACCOUNT_ID,
    "revision": 1,
    "label": "commit",
    "description": "Committed",
    "snapshot": {"classes": []},
    "created_at": _NOW,
}


def _version_lookup_row(version_row: dict[str, Any] | None = None) -> dict[str, Any]:
    """Version lookup row."""
    row = version_row or _VERSION_ROW
    return {**row, "project_deleted_at": None}


_PROJECT_HOOK = {"id": _PROJECT_ID, "tenant_id": _TENANT_ID, "name": "proj", "slug": "test-proj"}


def _version_row_for_webhook(
    row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Columns matching load_version_row (schema webhook payload)."""
    v = row or _VERSION_ROW
    return {
        "id": v["id"],
        "project_id": v["project_id"],
        "name": v.get("name"),
        "description": v.get("description"),
        "published": v.get("published"),
        "visibility": v.get("visibility"),
        "published_at": v.get("published_at"),
        "code_generation_tag": v.get("code_generation_tag"),
        "source_version_id": v.get("source_version_id"),
    }


def _webhook_followup(
    *,
    version_row: dict[str, Any] | None = None,
    snapshot_lookup_row: list[dict[str, Any]] | None = None,
) -> list[Any]:
    """Extra execute_query results after successful commit/push/branch (project, version, …)."""
    tail: list[Any] = [
        [_PROJECT_HOOK],
        [_version_row_for_webhook(version_row)],
    ]
    if snapshot_lookup_row is not None:
        tail.append(snapshot_lookup_row)
    tail.append([])  # no webhooks configured
    return tail


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


# ---------------------------------------------------------------------------
# POST /versions/{version_id}/commit
# ---------------------------------------------------------------------------


class TestCommitVersion:
    """Tests for POST /v1/versions/{version_id}/commit."""

    def test_commit_empty_payload_returns_201(self, client):
        """Commit with no classes still creates a snapshot."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # _assert_version_exists
                [],  # _capture_version_state: no classes
                [{"metadata": {}}],  # _create_snapshot: version metadata for canvas_metadata
                *_webhook_followup(),
            ]
            mock_db.execute_mutation.side_effect = [_SNAPSHOT_ROW, None]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/commit",
                json={"classes": [], "label": "empty-commit"},
            )
        assert r.status_code == 201
        body = r.json()
        assert body["revision"] == 1
        assert body["version_id"] == _VERSION_ID
        assert "snapshot_id" in body
        assert "committed_at" in body

    def test_commit_with_classes_returns_201(self, client):
        """Commit with classes upserts them and creates a snapshot."""
        payload = {
            "classes": [
                {
                    "name": "Person",
                    "description": "A person",
                    "schema": {"type": "object"},
                    "properties": [
                        {
                            "name": "first_name",
                            "description": "First name",
                            "data": {"type": "string"},
                        }
                    ],
                }
            ],
            "label": "initial",
            "message": "First commit",
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # _assert_version_exists
                [],  # _upsert_class: class not found (will create)
                [],  # _upsert_class_properties: property not found (will create)
                [],  # _upsert_class_properties: cp not found (will create)
                [],  # _capture_version_state: class query
                [{"metadata": {}}],  # _create_snapshot: version metadata for canvas_metadata
                *_webhook_followup(),
            ]
            mock_db.execute_mutation.side_effect = [
                {"id": _CLASS_ID},  # INSERT class
                {"id": _PROPERTY_ID},  # INSERT property
                {"id": _CP_ID},  # INSERT class_property
                _SNAPSHOT_ROW,  # INSERT snapshot
                None,  # _record_history
            ]
            r = client.post(f"/v1/versions/{_VERSION_ID}/commit", json=payload)
        assert r.status_code == 201

    def test_commit_with_canvas_metadata_updates_version(self, client):
        """Commit with canvas_metadata writes to version metadata."""
        payload = {
            "classes": [],
            "canvas_metadata": {"layout": "grid"},
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # _assert_version_exists
                [],  # _capture_version_state: no classes
                [{"metadata": {"canvas_metadata": {"layout": "grid"}}}],  # _create_snapshot
                *_webhook_followup(),
            ]
            mock_db.execute_mutation.side_effect = [
                None,  # UPDATE version metadata (returning=False)
                _SNAPSHOT_ROW,  # INSERT snapshot
                None,  # _record_history
            ]
            r = client.post(f"/v1/versions/{_VERSION_ID}/commit", json=payload)
        assert r.status_code == 201

    def test_commit_version_not_found_returns_404(self, client):
        """Commit returns 404 if version does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/commit",
                json={"classes": []},
            )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /versions/{version_id}/push
# ---------------------------------------------------------------------------


class TestPushVersion:
    """Tests for POST /v1/versions/{version_id}/push."""

    def test_push_success_returns_201(self, client):
        """Push to target version creates snapshot on target."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # source _assert_version_exists
                [_version_lookup_row(_TARGET_VERSION_ROW)],  # target _assert_version_exists
                [  # revision check: source and target, target not newer
                    {"version_id": _VERSION_ID, "max_revision": 2},
                    {"version_id": _TARGET_VERSION_ID, "max_revision": 1},
                ],
                [],  # _capture_version_state: no classes
                [{"metadata": {}}],  # _create_snapshot: version metadata for canvas_metadata
                *_webhook_followup(version_row=_TARGET_VERSION_ROW),
            ]
            mock_db.execute_mutation.side_effect = [_SNAPSHOT_ROW, None]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/push?target_version_id={_TARGET_VERSION_ID}",
                json={"classes": [], "label": "push-test"},
            )
        assert r.status_code == 201
        body = r.json()
        assert body["version_id"] == _TARGET_VERSION_ID

    def test_push_target_newer_returns_409(self, client):
        """Push returns 409 when target version has newer revision than source."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # source _assert_version_exists
                [_version_lookup_row(_TARGET_VERSION_ROW)],  # target _assert_version_exists
                [  # revision check: target has newer revision
                    {"version_id": _VERSION_ID, "max_revision": 1},
                    {"version_id": _TARGET_VERSION_ID, "max_revision": 3},
                ],
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/push?target_version_id={_TARGET_VERSION_ID}",
                json={"classes": [], "label": "push-test"},
            )
        assert r.status_code == 409
        assert "newer" in r.json()["detail"].lower()
        assert "pull" in r.json()["detail"].lower()

    def test_push_different_project_returns_400(self, client):
        """Push returns 400 when versions belong to different projects."""
        other_project_version = {
            **_TARGET_VERSION_ROW,
            "project_id": "00000000-0000-0000-0000-000000000099",
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [_version_lookup_row(other_project_version)],
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/push?target_version_id={_TARGET_VERSION_ID}",
                json={"classes": []},
            )
        assert r.status_code == 400
        assert "same project" in r.json()["detail"].lower()

    def test_push_source_not_found_returns_404(self, client):
        """Push returns 404 when source version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/push?target_version_id={_TARGET_VERSION_ID}",
                json={"classes": []},
            )
        assert r.status_code == 404

    def test_push_target_not_found_returns_404(self, client):
        """Push returns 404 when target version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],  # target not found
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/push?target_version_id={_TARGET_VERSION_ID}",
                json={"classes": []},
            )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /versions/{version_id}/pull
# ---------------------------------------------------------------------------


class TestPullVersion:
    """Tests for GET /v1/versions/{version_id}/pull."""

    def test_pull_returns_full_state(self, client):
        """Pull returns full version state with classes."""
        class_row = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "A person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # _assert_version_exists
                [class_row],  # _capture_version_state: class query
                [],  # _capture_version_state: properties query
                [{"max_revision": 3}],  # MAX(revision) query
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull")
        assert r.status_code == 200
        assert r.headers.get("ETag")
        body = r.json()
        assert body["version_id"] == _VERSION_ID
        assert body["revision"] == 3
        assert len(body["classes"]) == 1
        assert body["classes"][0]["name"] == "Person"
        assert "pulled_at" in body
        assert body["latest_revision"] == 3

    def test_pull_empty_version_returns_empty_classes(self, client):
        """Pull on version with no classes returns empty list."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],  # no classes
                [{"max_revision": None}],  # no snapshots
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull")
        assert r.status_code == 200
        body = r.json()
        assert body["classes"] == []
        assert body["revision"] is None
        assert body["latest_revision"] is None

    def test_pull_includes_canvas_metadata(self, client):
        """Pull returns canvas_metadata from version metadata."""
        version_with_canvas = {
            **_version_lookup_row(),
            "metadata": {"canvas_metadata": {"layout": "grid"}},
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [version_with_canvas],
                [],  # no classes
                [{"max_revision": 1}],
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull")
        assert r.status_code == 200
        body = r.json()
        assert body["canvas_metadata"] == {"layout": "grid"}
        assert body["latest_revision"] == 1

    def test_pull_version_not_found_returns_404(self, client):
        """Pull returns 404 when version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull")
        assert r.status_code == 404

    def test_pull_by_revision_returns_state_at_revision(self, client):
        """Pull with revision query param returns state at that snapshot revision."""
        snapshot_at_2 = {
            **_SNAPSHOT_ROW,
            "revision": 2,
            "snapshot": {
                "classes": [
                    {
                        "id": _CLASS_ID,
                        "name": "Person",
                        "description": "At rev 2",
                        "schema": {},
                        "metadata": {},
                        "properties": [],
                    }
                ],
                "canvas_metadata": {"layout": "at-rev-2"},
            },
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [snapshot_at_2],
                [{"max_revision": 5}],
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull?revision=2")
        assert r.status_code == 200
        body = r.json()
        assert body["revision"] == 2
        assert len(body["classes"]) == 1
        assert body["classes"][0]["name"] == "Person"
        assert body["classes"][0]["description"] == "At rev 2"
        assert body["canvas_metadata"] == {"layout": "at-rev-2"}
        assert body["latest_revision"] == 5
        assert body["snapshot_label"] == "commit"
        assert body["snapshot_description"] == "Committed"
        assert "snapshot_committed_at" in body

    def test_pull_by_revision_not_found_returns_404(self, client):
        """Pull with revision returns 404 when that snapshot does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],  # no snapshot at revision 99
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull?revision=99")
        assert r.status_code == 404
        assert "revision" in r.json()["detail"].lower()

    def test_pull_with_since_revision_includes_diff(self, client):
        """Pull with since_revision returns diff of changes since that revision."""
        class_row = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "A person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
        }
        prop_row = {
            "id": _CP_ID,
            "class_id": _CLASS_ID,
            "property_id": _PROPERTY_ID,
            "name": "email",
            "description": "Email",
            "data": {"type": "string"},
            "property_name": "email",
            "property_description": "Email",
            "property_data": {"type": "string"},
            "property_enabled": True,
        }
        old_snapshot = {
            "snapshot": {
                "classes": [
                    {
                        "id": _CLASS_ID,
                        "name": "Person",
                        "description": "A person",
                        "schema": {},
                        "metadata": {},
                        "properties": [],  # no props at rev 1
                    }
                ]
            }
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [class_row],  # _capture_version_state: class query
                [prop_row],  # _capture_version_state: properties query
                [{"max_revision": 3}],
                [old_snapshot],
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull?since_revision=1")
        assert r.status_code == 200
        body = r.json()
        assert body["diff_since_revision"] == 1
        assert body["diff"] is not None
        assert body["diff"]["added_class_names"] == []
        assert body["diff"]["removed_class_names"] == []
        assert len(body["diff"]["modified_classes"]) == 1
        assert body["diff"]["modified_classes"][0]["class_name"] == "Person"
        assert "email" in body["diff"]["modified_classes"][0]["added_property_names"]
        assert body["latest_revision"] == 3

    def test_pull_since_revision_not_found_returns_404(self, client):
        """Pull with since_revision returns 404 when that snapshot does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],
                [{"max_revision": 5}],
                [],  # no snapshot at since_revision=99
            ]
            r = client.get(f"/v1/versions/{_VERSION_ID}/pull?since_revision=99")
        assert r.status_code == 404
        assert "since_revision" in r.json()["detail"].lower()

    def test_pull_returns_304_when_if_none_match_matches_etag(self, client):
        """Conditional GET returns 304 with empty body when ETag matches."""
        class_row = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "A person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
        }
        seq = [
            [_version_lookup_row()],
            [class_row],
            [],
            [{"max_revision": 3}],
        ]
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = seq + seq
            r1 = client.get(f"/v1/versions/{_VERSION_ID}/pull")
            etag = r1.headers.get("ETag")
            assert r1.status_code == 200
            assert etag
            assert r1.json().get("latest_revision") == 3
            r2 = client.get(
                f"/v1/versions/{_VERSION_ID}/pull",
                headers={"If-None-Match": etag},
            )
        assert r2.status_code == 304
        assert r2.headers.get("ETag") == etag
        assert r2.content == b""


# ---------------------------------------------------------------------------
# POST /versions/{version_id}/rollback
# ---------------------------------------------------------------------------


class TestRollbackVersion:
    """Tests for POST /v1/versions/{version_id}/rollback."""

    def test_rollback_returns_201_and_creates_snapshot(self, client):
        """Rollback to revision 1 sets version state and appends new snapshot."""
        snapshot_at_1 = {
            **_SNAPSHOT_ROW,
            "revision": 1,
            "snapshot": {
                "classes": [
                    {
                        "name": "Person",
                        "description": "Rolled back",
                        "schema": {},
                        "metadata": {},
                        "properties": [],
                    }
                ],
                "canvas_metadata": None,
            },
        }
        class_row = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Rolled back",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
        }
        rollback_snapshot_row = {
            **_SNAPSHOT_ROW,
            "revision": 2,
            "label": "rollback",
            "description": "Rollback to revision 1",
            "created_at": _NOW,
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [snapshot_at_1],
                [],  # current classes (empty)
                [],  # _upsert_class: find by name (not found)
                [class_row],  # _capture_version_state: classes
                [],  # _capture_version_state: properties
                [{"metadata": {}}],  # _create_snapshot: version metadata
            ]
            mock_db.execute_mutation.side_effect = [
                {"id": _CLASS_ID},  # INSERT class
                None,  # DELETE class_property (empty list branch)
                None,  # UPDATE version: clear canvas_metadata (snapshot has canvas_metadata=None)
                rollback_snapshot_row,  # INSERT snapshot
                None,  # _record_history
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/rollback",
                json={"revision": 1},
            )
        assert r.status_code == 201
        body = r.json()
        assert body["version_id"] == _VERSION_ID
        assert body["revision"] == 2
        assert "snapshot_id" in body
        assert "committed_at" in body

    def test_rollback_optional_message_appended_to_description(self, client):
        """Rollback request may include a message appended to the snapshot description."""
        snapshot_at_1 = {
            **_SNAPSHOT_ROW,
            "revision": 1,
            "snapshot": {
                "classes": [
                    {
                        "name": "Person",
                        "description": "Rolled back",
                        "schema": {},
                        "metadata": {},
                        "properties": [],
                    }
                ],
                "canvas_metadata": None,
            },
        }
        class_row = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Rolled back",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": _NOW,
            "updated_at": None,
        }
        rollback_snapshot_row = {
            **_SNAPSHOT_ROW,
            "revision": 2,
            "label": "rollback",
            "description": "Rollback to revision 1\n\nRestore before bad deploy",
            "created_at": _NOW,
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [snapshot_at_1],
                [],
                [],
                [class_row],
                [],
                [{"metadata": {}}],
            ]
            mock_db.execute_mutation.side_effect = [
                {"id": _CLASS_ID},
                None,
                None,
                rollback_snapshot_row,
                None,
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/rollback",
                json={"revision": 1, "message": "Restore before bad deploy"},
            )
        assert r.status_code == 201
        insert_calls = [
            c
            for c in mock_db.execute_mutation.call_args_list
            if c.args and "INSERT INTO objectified.version_snapshot" in str(c.args[0])
        ]
        assert len(insert_calls) >= 1
        bind = insert_calls[0].args[1]
        assert "Restore before bad deploy" in str(bind)

    def test_rollback_version_not_found_returns_404(self, client):
        """Rollback returns 404 when version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/rollback",
                json={"revision": 1},
            )
        assert r.status_code == 404

    def test_rollback_snapshot_not_found_returns_404(self, client):
        """Rollback returns 404 when snapshot revision does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],  # no snapshot at revision 99
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/rollback",
                json={"revision": 99},
            )
        assert r.status_code == 404
        assert "revision" in r.json()["detail"].lower() or "snapshot" in r.json()["detail"].lower()

    def test_rollback_api_key_caller_returns_403(self):
        """Rollback returns 403 when caller is an API-key user without a user_id."""
        # In production, API keys are treated as internal/admin by auth._resolve_caller.
        # The handler still requires a JWT user_id, so the endpoint returns 403.
        api_key_caller = {"auth_method": "api_key", "account_id": _ACCOUNT_ID, "is_admin": True}
        app.dependency_overrides[require_authenticated] = lambda: api_key_caller
        try:
            with mock_db_all() as mock_db:
                mock_db.execute_query.return_value = [_version_lookup_row()]
                r = TestClient(app).post(
                    f"/v1/versions/{_VERSION_ID}/rollback",
                    json={"revision": 1},
                )
        finally:
            app.dependency_overrides.clear()
        assert r.status_code == 403
        assert "jwt" in r.json()["detail"].lower() or "user" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /tenants/{tid}/projects/{pid}/versions/from-revision
# ---------------------------------------------------------------------------

_NEW_VERSION_ID = "00000000-0000-0000-0000-0000000000a1"

_NEW_VERSION_ROW: dict[str, Any] = {
    **_VERSION_ROW,
    "id": _NEW_VERSION_ID,
    "source_version_id": _SOURCE_VERSION_ID,
    "name": "v1-branch",
    "description": "Branch from revision 1",
}


class TestCreateVersionFromRevision:
    """Tests for POST /v1/tenants/{tid}/projects/{pid}/versions/from-revision."""

    def test_create_version_from_revision_returns_201(self, client):
        """Create version from source revision returns 201 and new version."""
        snapshot_at_1 = {
            **_SNAPSHOT_ROW,
            "version_id": _SOURCE_VERSION_ID,
            "revision": 1,
            "snapshot": {"classes": [], "canvas_metadata": None},
        }
        new_snapshot_row = {
            **_SNAPSHOT_ROW,
            "id": "00000000-0000-0000-0000-0000000000a2",
            "version_id": _NEW_VERSION_ID,
            "revision": 1,
            "label": "branch",
            "description": f"Branch from {_SOURCE_VERSION_ID} @ revision 1",
            "snapshot": {"classes": [], "canvas_metadata": None},
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],  # _assert_tenant_exists
                [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],  # _assert_project_exists
                [_version_lookup_row(_SOURCE_VERSION_ROW)],  # _assert_version_exists
                [snapshot_at_1],  # get snapshot by version + revision
                [],  # _apply_snapshot_state: current classes (none)
                [],  # _create_snapshot / _capture_version_state: classes (none)
                [{"metadata": {}}],  # _create_snapshot: version metadata
                *_webhook_followup(
                    version_row=_NEW_VERSION_ROW,
                    snapshot_lookup_row=[
                        {
                            "id": "00000000-0000-0000-0000-0000000000a2",
                            "revision": 1,
                            "label": "branch",
                            "created_at": _NOW,
                        }
                    ],
                ),
            ]
            mock_db.execute_mutation.side_effect = [
                _NEW_VERSION_ROW,  # _insert_version_row
                None,  # _record_history
                None,  # _apply_snapshot_state: UPDATE version canvas_metadata (or no-op)
                new_snapshot_row,  # _create_snapshot
            ]
            r = client.post(
                f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions/from-revision",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "source_revision": 1,
                    "name": "v1-branch",
                    "description": "Branch from revision 1",
                },
            )
        assert r.status_code == 201
        body = r.json()
        assert body["id"] == _NEW_VERSION_ID
        assert body["name"] == "v1-branch"
        assert body["project_id"] == _PROJECT_ID
        assert body["source_version_id"] == _SOURCE_VERSION_ID

    def test_create_version_from_revision_requires_auth(self):
        """Create version from revision returns 403 when not authenticated with JWT."""
        app.dependency_overrides[require_authenticated] = lambda: None
        try:
            with mock_db_all() as mock_db:
                mock_db.execute_query.side_effect = [
                    [{"id": _TENANT_ID}],
                    [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
                ]
                r = TestClient(app).post(
                    f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions/from-revision",
                    json={
                        "source_version_id": _SOURCE_VERSION_ID,
                        "source_revision": 1,
                        "name": "v1-branch",
                    },
                )
        finally:
            app.dependency_overrides.clear()
        assert r.status_code == 401

    def test_create_version_from_revision_snapshot_not_found_returns_404(self, client):
        """Create version from revision returns 404 when snapshot revision does not exist."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [{"id": _TENANT_ID}],
                [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
                [_version_lookup_row(_SOURCE_VERSION_ROW)],
                [],  # no snapshot at revision 99
            ]
            r = client.post(
                f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/versions/from-revision",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "source_revision": 99,
                    "name": "v1-branch",
                },
            )
        assert r.status_code == 404
        assert "revision" in r.json()["detail"].lower() or "snapshot" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /versions/{version_id}/merge
# ---------------------------------------------------------------------------


class TestMergeVersion:
    """Tests for POST /v1/versions/{version_id}/merge."""

    def test_merge_additive_adds_remote_only_classes(self, client):
        """Additive merge adds remote-only classes without changing local."""
        local_class = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "A person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        remote_class = {
            "id": "00000000-0000-0000-0000-0000000000a0",
            "version_id": _SOURCE_VERSION_ID,
            "name": "Address",
            "description": "An address",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        merge_snapshot = {
            **_SNAPSHOT_ROW,
            "label": "merge",
            "description": f"Merged from {_SOURCE_VERSION_ID}",
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],  # local _assert_version_exists
                [_version_lookup_row(_SOURCE_VERSION_ROW)],  # remote _assert_version_exists
                [local_class],  # _capture_version_state (local): classes
                [],  # _capture_version_state (local): properties
                [remote_class],  # _capture_version_state (remote): classes
                [],  # _capture_version_state (remote): properties
                [{"id": _CLASS_ID}],  # _upsert_class (Person): found
                [],  # _upsert_class (Address): not found → create
                [],  # _capture_version_state for snapshot: classes
                [{"metadata": {}}],  # _create_snapshot: version metadata for canvas_metadata
            ]
            mock_db.execute_mutation.side_effect = [
                None,  # UPDATE class (Person, returning=False)
                {"id": "00000000-0000-0000-0000-0000000000b0"},  # INSERT class (Address)
                merge_snapshot,  # INSERT snapshot
                None,  # _record_history
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "additive",
                },
            )
        assert r.status_code == 200
        body = r.json()
        assert body["version_id"] == _VERSION_ID
        assert "Person" in body["merged_classes"]
        assert "Address" in body["merged_classes"]
        assert body["revision"] == 1

    def test_merge_different_project_returns_400(self, client):
        """Merge returns 400 when versions belong to different projects."""
        other_project = {
            **_SOURCE_VERSION_ROW,
            "project_id": "00000000-0000-0000-0000-000000000099",
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [_version_lookup_row(other_project)],
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "additive",
                },
            )
        assert r.status_code == 400
        assert "same project" in r.json()["detail"].lower()

    def test_merge_source_not_found_returns_404(self, client):
        """Merge returns 404 when source version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [],  # source not found
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "additive",
                },
            )
        assert r.status_code == 404

    def test_merge_version_not_found_returns_404(self, client):
        """Merge returns 404 when local version not found."""
        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = []
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "override",
                },
            )
        assert r.status_code == 404

    def test_merge_override_reports_conflicts(self, client):
        """Override merge reports conflicts when both sides differ."""
        local_class = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Local person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [
                {
                    "name": "age",
                    "description": "Age",
                    "data": {"type": "integer", "minimum": 0, "maximum": 150},
                }
            ],
        }
        remote_class = {
            "id": "00000000-0000-0000-0000-0000000000a0",
            "version_id": _SOURCE_VERSION_ID,
            "name": "Person",
            "description": "Remote person",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [
                {
                    "name": "age",
                    "description": "Age in years",
                    "data": {"type": "integer", "minimum": 1, "maximum": 200},
                }
            ],
        }
        merge_snapshot = {**_SNAPSHOT_ROW, "label": "merge", "revision": 2}
        with mock_db_all() as mock_db:
            # Trace the exact execute_query call sequence:
            # 1. _assert_version_exists (local)
            # 2. _assert_version_exists (remote/source)
            # 3. _capture_version_state (local) — class query
            # 4. _capture_version_state (local) — class_property query (inline props already set but query still runs)
            # 5. _capture_version_state (remote) — class query
            # 6. _capture_version_state (remote) — class_property query
            # 7. _upsert_class (Person) — SELECT by name
            # 8. _upsert_class_properties (age) — SELECT property by name
            # 9. _upsert_class_properties (age) — SELECT class_property by name
            # 10. _capture_version_state (snapshot) — class query
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],                        # 1
                [_version_lookup_row(_SOURCE_VERSION_ROW)],     # 2
                [local_class],                                  # 3 local classes
                [],                                             # 4 local class_properties
                [remote_class],                                 # 5 remote classes
                [],                                             # 6 remote class_properties
                [{"id": _CLASS_ID}],                            # 7 _upsert_class: found
                # No property/cp queries because _capture_version_state
                # resets properties to [] and prop query returns []
                [],                                             # 8 _capture_version_state for snapshot
                [{"metadata": {}}],                             # 9 _create_snapshot: version metadata
            ]
            # Trace execute_mutation calls:
            # 1. UPDATE class (returning=False)
            # 2. INSERT snapshot (RETURNING)
            # 3. _record_history (returning=False via execute_mutation)
            mock_db.execute_mutation.side_effect = [
                None,           # 1 UPDATE class
                merge_snapshot, # 2 INSERT snapshot
                None,           # 3 _record_history
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "override",
                    "message": "Override merge",
                },
            )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:500]}"
        body = r.json()
        assert "conflicts" in body
        # Class-level description conflict is detected (Local person vs Remote person)
        assert len(body["conflicts"]) >= 1
        assert "merged_classes" in body
        assert "Person" in body["merged_classes"]
        assert body["revision"] == 2
        assert "merged_state" in body
        assert "classes" in body["merged_state"]
        if body["conflicts"]:
            c = body["conflicts"][0]
            assert "path" in c
            assert "description" in body["conflicts"][0]

    def test_merge_preview_returns_merged_state_and_conflicts_without_persisting(self, client):
        """POST /v1/versions/{id}/merge/preview returns merged state and conflicts, no snapshot."""
        local_class = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Local",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        remote_class = {
            "id": "00000000-0000-0000-0000-0000000000a0",
            "version_id": _SOURCE_VERSION_ID,
            "name": "Address",
            "description": "An address",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [_version_lookup_row(_SOURCE_VERSION_ROW)],
                [local_class],
                [],
                [remote_class],
                [],
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge/preview",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "additive",
                },
            )
            assert r.status_code == 200
            body = r.json()
            assert "merged_state" in body
            assert "classes" in body["merged_state"]
            assert len(body["merged_state"]["classes"]) == 2
            assert "conflicts" in body
            mock_db.execute_mutation.assert_not_called()

    def test_merge_resolve_without_apply_returns_merged_state_only(self, client):
        """POST /v1/versions/{id}/merge/resolve with apply=false returns merged_state only."""
        local_class = {
            "id": _CLASS_ID,
            "version_id": _VERSION_ID,
            "name": "Person",
            "description": "Ours",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        remote_class = {
            "id": "00000000-0000-0000-0000-0000000000a0",
            "version_id": _SOURCE_VERSION_ID,
            "name": "Person",
            "description": "Theirs",
            "schema": {},
            "metadata": {},
            "enabled": True,
            "created_at": str(_NOW),
            "updated_at": None,
            "properties": [],
        }
        with mock_db_all() as mock_db:
            mock_db.execute_query.side_effect = [
                [_version_lookup_row()],
                [_version_lookup_row(_SOURCE_VERSION_ROW)],
                [local_class],
                [],
                [remote_class],
                [],
            ]
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/merge/resolve",
                json={
                    "source_version_id": _SOURCE_VERSION_ID,
                    "strategy": "override",
                    "conflict_resolutions": [],
                    "apply": False,
                },
            )
        assert r.status_code == 200
        body = r.json()
        assert "merged_state" in body
        assert body.get("revision") is None
        assert body.get("snapshot_id") is None







# ---------------------------------------------------------------------------
# RBAC: non-admin caller permission checks
# ---------------------------------------------------------------------------


def test_commit_non_member_returns_403(member_client):
    """POST /v1/versions/{vid}/commit returns 403 when caller is not a tenant member."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_SCOPE_ROW],  # _resolve_version_scope
            [],             # _is_tenant_admin → not admin
            [],             # _is_tenant_member → not a member → 403
        ]
        r = member_client.post(
            f"/v1/versions/{_VERSION_ID}/commit",
            json={"classes": [], "label": "test"},
        )
    assert r.status_code == 403


def test_commit_member_without_write_permission_returns_403(member_client):
    """POST /v1/versions/{vid}/commit returns 403 when caller lacks schema:write permission."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_SCOPE_ROW],          # _resolve_version_scope
            [],                    # _is_tenant_admin → not admin
            [{"id": _TENANT_ID}],  # _is_tenant_member → member
            [],                    # _has_rbac_permission → no schema:write → 403
        ]
        r = member_client.post(
            f"/v1/versions/{_VERSION_ID}/commit",
            json={"classes": [], "label": "test"},
        )
    assert r.status_code == 403
