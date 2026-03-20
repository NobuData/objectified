"""Tests for schema promotions workflow (GH-137)."""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc).replace(microsecond=0)

_TENANT_ID = "00000000-0000-0000-0000-000000000010"
_PROJECT_ID = "00000000-0000-0000-0000-000000000020"
_VERSION_ID = "00000000-0000-0000-0000-000000000030"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000050"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "account_id": _ACCOUNT_ID, "is_admin": True}


@pytest.fixture
def client():
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def _version_row() -> dict[str, Any]:
    return {
        "id": _VERSION_ID,
        "project_id": _PROJECT_ID,
        "creator_id": _ACCOUNT_ID,
        "name": "v1.0",
        "description": "desc",
        "enabled": True,
        "published": True,
        "visibility": "public",
        "metadata": {},
        "created_at": _NOW,
        "updated_at": None,
        "deleted_at": None,
        "published_at": _NOW,
        "code_generation_tag": "v1.0.0",
        "source_version_id": None,
    }


def _project_row() -> dict[str, Any]:
    return {
        "id": _PROJECT_ID,
        "tenant_id": _TENANT_ID,
        "name": "Main Project",
        "slug": "main-project",
    }


def _live_row() -> dict[str, Any]:
    return {
        "project_id": _PROJECT_ID,
        "environment": "dev",
        "version_id": _VERSION_ID,
        "promoted_by": _ACCOUNT_ID,
        "promoted_at": _NOW.replace(microsecond=0),
        "metadata": {},
    }


def _promotion_row() -> dict[str, Any]:
    return {
        "id": "00000000-0000-0000-0000-000000000099",
        "project_id": _PROJECT_ID,
        "environment": "dev",
        "from_version_id": None,
        "to_version_id": _VERSION_ID,
        "promoted_by": _ACCOUNT_ID,
        "created_at": _NOW,
        "metadata": {},
    }


def test_promote_version_creates_live_mapping_and_emits_webhook(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [_version_row()],  # load version
            [],  # previous live mapping
            [_project_row()],  # project for webhook
        ]
        mock_db.execute_mutation.side_effect = [
            _live_row(),  # upsert live mapping
            _promotion_row(),  # insert promotion history
        ]

        with patch("app.routes.schema_promotions.try_emit_schema_webhook") as mock_emit:
            r = client.post(
                f"/v1/versions/{_VERSION_ID}/promote?environment=dev",
                json={"metadata": {"k": "v"}},
            )
            assert r.status_code == 200
            body = r.json()
            assert body["live_version"]["environment"] == "dev"
            assert body["live_version"]["version_id"] == _VERSION_ID
            assert body["promotion"]["to_version_id"] == _VERSION_ID
            assert mock_emit.called


def test_get_live_version_returns_null_when_unpromoted(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/environments/dev/live-version"
        )
        assert r.status_code == 200
        body = r.json()
        assert body["live_version"]["version_id"] is None
        assert body["version"] is None


def test_get_live_version_returns_version_payload_when_present(client):
    with mock_db_all() as mock_db:
        vr = _version_row()
        mock_db.execute_query.return_value = [
            {
                "project_id": _PROJECT_ID,
                "environment": "dev",
                "version_id": _VERSION_ID,
                "promoted_by": _ACCOUNT_ID,
                "promoted_at": _NOW,
                "metadata": {},
                "v_id": _VERSION_ID,
                "v_project_id": _PROJECT_ID,
                "creator_id": _ACCOUNT_ID,
                "v_name": vr["name"],
                "v_description": vr["description"],
                "enabled": vr["enabled"],
                "published": vr["published"],
                "visibility": vr["visibility"],
                "v_metadata": vr["metadata"],
                "v_created_at": vr["created_at"].isoformat(),
                "v_updated_at": vr["updated_at"],
                "v_deleted_at": vr["deleted_at"],
                "v_published_at": vr["published_at"].isoformat(),
                "change_log": vr["change_log"] if "change_log" in vr else None,
                "code_generation_tag": vr["code_generation_tag"],
                "source_version_id": vr["source_version_id"],
            }
        ]

        r = client.get(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/environments/dev/live-version"
        )
        assert r.status_code == 200
        body = r.json()
        assert body["live_version"]["version_id"] == _VERSION_ID
        assert body["version"]["id"] == _VERSION_ID
        assert body["version"]["name"] == vr["name"]

