"""Tests for /v1/tenants/{tenant_id}/projects REST endpoints."""

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_authenticated
from tests.conftest import mock_db_all

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_NOW = datetime.now(timezone.utc)

_TENANT_ID = "00000000-0000-0000-0000-000000000010"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000011"
_PROJECT_ID = "00000000-0000-0000-0000-000000000012"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}
_MEMBER_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": False}

_TENANT_ROW: dict[str, Any] = {
    "id": _TENANT_ID,
}

_PROJECT_ROW: dict[str, Any] = {
    "id": _PROJECT_ID,
    "tenant_id": _TENANT_ID,
    "creator_id": _ACCOUNT_ID,
    "name": "My Project",
    "description": "A test project",
    "slug": "my-project",
    "enabled": True,
    "metadata": {},
    "created_at": _NOW,
    "updated_at": None,
    "deleted_at": None,
}

_HISTORY_ROW: dict[str, Any] = {
    "id": "00000000-0000-0000-0000-000000000099",
    "project_id": _PROJECT_ID,
    "tenant_id": _TENANT_ID,
    "changed_by": _ACCOUNT_ID,
    "operation": "INSERT",
    "old_data": None,
    "new_data": _PROJECT_ROW,
    "changed_at": _NOW,
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    """FastAPI test client with require_authenticated overridden."""
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client():
    """FastAPI test client with no auth override."""
    app.dependency_overrides.clear()
    return TestClient(app)


@pytest.fixture
def member_client():
    """FastAPI test client with non-admin tenant-member caller."""
    app.dependency_overrides[require_authenticated] = lambda: _MEMBER_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# List projects
# ---------------------------------------------------------------------------


def test_list_projects_returns_list(client):
    """GET /v1/tenants/{id}/projects returns a list of projects."""
    with mock_db_all() as mock_db:
        # First call: _assert_tenant_exists, second: list query
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],  # tenant exists
            [_PROJECT_ROW],        # project list
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert data[0]["id"] == _PROJECT_ID
    assert data[0]["slug"] == "my-project"


def test_list_projects_include_deleted(client):
    """GET /v1/tenants/{id}/projects?include_deleted=true returns soft-deleted projects."""
    deleted_row = {**_PROJECT_ROW, "deleted_at": _NOW.isoformat()}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW, deleted_row],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects?include_deleted=true")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_list_projects_tenant_not_found(client):
    """GET /v1/tenants/{id}/projects returns 404 when tenant does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects")
    assert r.status_code == 404


def test_list_projects_empty(client):
    """GET /v1/tenants/{id}/projects returns empty list when no projects exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# Get project
# ---------------------------------------------------------------------------


def test_get_project_returns_project(client):
    """GET /v1/tenants/{id}/projects/{pid} returns the project."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 200
    assert r.json()["id"] == _PROJECT_ID


def test_get_project_not_found(client):
    """GET /v1/tenants/{id}/projects/{pid} returns 404 when project does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 404


def test_get_project_tenant_not_found(client):
    """GET /v1/tenants/{id}/projects/{pid} returns 404 when tenant does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Create project
# ---------------------------------------------------------------------------


def test_create_project_returns_201(client):
    """POST /v1/tenants/{id}/projects creates a project and returns 201."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],  # tenant exists
            [],                    # slug uniqueness check
        ]
        mock_db.execute_mutation.return_value = _PROJECT_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "description": "A test project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 201
    assert r.json()["slug"] == "my-project"


def test_create_project_with_matching_tenant_id_returns_201(client):
    """POST /v1/tenants/{id}/projects succeeds when payload tenant_id matches path."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        mock_db.execute_mutation.return_value = _PROJECT_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "tenant_id": _TENANT_ID,  # matches path — OK
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 201


def test_create_project_with_matching_creator_id_returns_201(client):
    """POST /v1/tenants/{id}/projects succeeds when payload creator_id matches caller."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        mock_db.execute_mutation.return_value = _PROJECT_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "creator_id": _ACCOUNT_ID,  # matches authenticated caller — OK
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 201


def test_create_project_tenant_id_mismatch_returns_400(client):
    """POST /v1/tenants/{id}/projects returns 400 when payload tenant_id differs from path."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"id": _TENANT_ID}]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "tenant_id": "00000000-0000-0000-0000-000000000099",  # wrong tenant
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 400
    assert "tenant_id" in r.json()["detail"]


def test_create_project_creator_id_mismatch_returns_400(client):
    """POST /v1/tenants/{id}/projects returns 400 when payload creator_id differs from caller."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "creator_id": "00000000-0000-0000-0000-000000000099",  # not the caller
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 400
    assert "creator_id" in r.json()["detail"]


def test_create_project_slug_conflict_returns_409(client):
    """POST /v1/tenants/{id}/projects returns 409 when slug already exists."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],      # tenant exists
            [{"id": _PROJECT_ID}],     # slug already taken
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 409


def test_create_project_slug_uniqueness_checks_only_active_rows(client):
    """POST /v1/tenants/{id}/projects checks slug conflicts only among active rows."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],
        ]
        mock_db.execute_mutation.return_value = _PROJECT_ROW
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 201
    slug_query = mock_db.execute_query.call_args_list[1].args[0]
    assert "deleted_at IS NULL" in slug_query


def test_create_project_missing_name_returns_400(client):
    """POST /v1/tenants/{id}/projects returns 400 when name is empty."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"id": _TENANT_ID}]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "   ",
                "slug": "my-project",
            },
        )
    assert r.status_code == 400


def test_create_project_invalid_slug_returns_400(client):
    """POST /v1/tenants/{id}/projects returns 400 for invalid slug characters."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"id": _TENANT_ID}]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "slug": "My Project!!",
            },
        )
    assert r.status_code == 400


def test_create_project_slug_too_short_returns_400(client):
    """POST /v1/tenants/{id}/projects returns 400 when slug is too short."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = [{"id": _TENANT_ID}]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "slug": "a",
            },
        )
    assert r.status_code == 400


def test_create_project_tenant_not_found_returns_404(client):
    """POST /v1/tenants/{id}/projects returns 404 when tenant does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={
                "name": "My Project",
                "slug": "my-project",
            },
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Clone project
# ---------------------------------------------------------------------------


def test_clone_project_without_schema_copy_returns_201(client):
    """POST .../projects/{id}/clone creates a project when no version is copied."""
    new_row = {
        **_PROJECT_ROW,
        "id": "00000000-0000-0000-0000-000000000013",
        "slug": "cloned-slug",
        "name": "Cloned",
    }
    with mock_db_all() as mock_db:
        # Note: ensure_project_quota_allows_create uses app.quotas.db (not patched here),
        # so its tenant quota query does not consume execute_query side_effect entries.
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            [_PROJECT_ROW],
            [],
            [],
        ]
        mock_db.execute_mutation.return_value = new_row
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/clone",
            json={
                "name": "Cloned",
                "slug": "cloned-slug",
                "copy_latest_version": False,
            },
        )
    assert r.status_code == 201
    data = r.json()
    assert data["project"]["slug"] == "cloned-slug"
    assert data["cloned_version_id"] is None


def test_clone_project_slug_conflict_returns_409(client):
    """POST .../clone returns 409 when the new slug is already taken."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            [_PROJECT_ROW],
            [{"id": "other-id"}],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/clone",
            json={
                "name": "Cloned",
                "slug": "taken-slug",
                "copy_latest_version": False,
            },
        )
    assert r.status_code == 409


def test_clone_project_with_schema_copy_creates_version_and_returns_cloned_version_id(client):
    """POST .../clone with copy_latest_version=True creates a new version and returns its id."""
    cloned_project_id = "00000000-0000-0000-0000-000000000013"
    source_version_id = "00000000-0000-0000-0000-000000000020"
    cloned_version_id = "00000000-0000-0000-0000-000000000014"

    new_project_row = {
        **_PROJECT_ROW,
        "id": cloned_project_id,
        "name": "Cloned Project",
        "slug": "my-project-clone",
    }

    source_ver_row = {
        "id": source_version_id,
        "project_id": _PROJECT_ID,
        "source_version_id": None,
        "creator_id": _ACCOUNT_ID,
        "name": "Version 1",
        "code_generation_tag": None,
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

    ver_row = {
        "id": cloned_version_id,
        "project_id": cloned_project_id,
        "source_version_id": source_version_id,
        "creator_id": _ACCOUNT_ID,
        "name": "Version 1 (copy)",
        "code_generation_tag": None,
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

    snapshot_row = {
        "id": "00000000-0000-0000-0000-000000000021",
        "version_id": cloned_version_id,
        "project_id": cloned_project_id,
        "committed_by": _ACCOUNT_ID,
        "revision": 1,
        "label": "clone",
        "description": f"Cloned from project {_PROJECT_ID} version {source_version_id}",
        "snapshot": {},
        "created_at": _NOW,
    }

    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],                           # 1. tenant exists check
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}], # 2. project exists check
            [_PROJECT_ROW],                                  # 3. source project row
            [],                                              # 4. slug conflict check
            [source_ver_row],                                # 5. latest version fetch
            [],                                              # 6. _capture_version_state (source): class rows
            [],                                              # 7. _apply_snapshot_state: current class rows
            [],                                              # 8. _create_snapshot -> _capture_version_state (new): class rows
            [{"metadata": {}}],                              # 9. _create_snapshot: version metadata
        ]
        mock_db.execute_mutation.side_effect = [
            new_project_row,  # 1. INSERT project
            None,             # 2. INSERT project_history (returning=False)
            ver_row,          # 3. INSERT version
            None,             # 4. INSERT version_history (returning=False)
            None,             # 5. UPDATE version canvas_metadata (returning=False)
            snapshot_row,     # 6. INSERT version_snapshot
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/clone",
            json={
                "name": "Cloned Project",
                "slug": "my-project-clone",
                "copy_latest_version": True,
            },
        )
    assert r.status_code == 201
    body = r.json()
    assert body["project"]["id"] == cloned_project_id
    assert body["project"]["id"] != _PROJECT_ID
    assert body["cloned_version_id"] == cloned_version_id

    # Verify version and snapshot mutations were exercised
    mutation_sql = " ".join(str(c.args[0]).lower() for c in mock_db.execute_mutation.mock_calls)
    assert "objectified.version" in mutation_sql
    assert "objectified.version_snapshot" in mutation_sql


# ---------------------------------------------------------------------------
# Update project
# ---------------------------------------------------------------------------


def test_update_project_returns_updated_project(client):
    """PUT /v1/tenants/{id}/projects/{pid} updates and returns the project."""
    updated_row = {**_PROJECT_ROW, "name": "Renamed Project"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],   # tenant exists
            [_PROJECT_ROW],          # assert_project_exists
            [_PROJECT_ROW],          # old_row fetch for history
        ]
        mock_db.execute_mutation.return_value = updated_row
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={"name": "Renamed Project"},
        )
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed Project"


def test_update_project_empty_name_returns_400(client):
    """PUT /v1/tenants/{id}/projects/{pid} returns 400 for empty name."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_PROJECT_ROW],          # old_row fetch for history
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={"name": ""},
        )
    assert r.status_code == 400


def test_update_project_slug_conflict_returns_409(client):
    """PUT /v1/tenants/{id}/projects/{pid} returns 409 when new slug conflicts."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_PROJECT_ROW],          # old_row fetch for history
            [{"id": "other-project-id"}],  # slug conflict check
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={"slug": "existing-slug"},
        )
    assert r.status_code == 409


def test_update_project_slug_uniqueness_checks_only_active_rows(client):
    """PUT /v1/tenants/{id}/projects/{pid} checks slug conflicts only among active rows."""
    updated_row = {**_PROJECT_ROW, "slug": "reused-slug"}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_PROJECT_ROW],          # old_row fetch for history
            [],
        ]
        mock_db.execute_mutation.return_value = updated_row
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={"slug": "reused-slug"},
        )
    assert r.status_code == 200
    slug_query = mock_db.execute_query.call_args_list[3].args[0]
    assert "deleted_at IS NULL" in slug_query


def test_update_project_not_found_returns_404(client):
    """PUT /v1/tenants/{id}/projects/{pid} returns 404 when project does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],  # project not found
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={"name": "Whatever"},
        )
    assert r.status_code == 404


def test_update_project_no_fields_returns_current(client):
    """PUT /v1/tenants/{id}/projects/{pid} with no fields returns the existing project."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_PROJECT_ROW],  # old_row fetch for history
            [_PROJECT_ROW],  # re-fetch for no-op
        ]
        r = client.put(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}",
            json={},
        )
    assert r.status_code == 200
    assert r.json()["id"] == _PROJECT_ID


# ---------------------------------------------------------------------------
# Delete project
# ---------------------------------------------------------------------------


def test_delete_project_returns_204(client):
    """DELETE /v1/tenants/{id}/projects/{pid} soft-deletes and returns 204."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [_PROJECT_ROW],  # old_row fetch for history
        ]
        deleted_row = {**_PROJECT_ROW, "deleted_at": _NOW.isoformat()}
        mock_db.execute_mutation.return_value = deleted_row
        r = client.delete(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 204


def test_delete_project_not_found_returns_404(client):
    """DELETE /v1/tenants/{id}/projects/{pid} returns 404 when project does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],  # project not found
        ]
        r = client.delete(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 404


def test_delete_project_tenant_not_found_returns_404(client):
    """DELETE /v1/tenants/{id}/projects/{pid} returns 404 when tenant does not exist."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.return_value = []
        r = client.delete(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Project history
# ---------------------------------------------------------------------------


def test_get_project_history_returns_list(client):
    """GET /v1/tenants/{id}/projects/{pid}/history returns history list."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],    # tenant exists
            [_PROJECT_ROW],           # project exists
            [_HISTORY_ROW],           # history query
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert data[0]["project_id"] == _PROJECT_ID
    assert data[0]["operation"] == "INSERT"


def test_get_project_history_empty(client):
    """GET /v1/tenants/{id}/projects/{pid}/history returns empty list when no history."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [_PROJECT_ROW],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/history")
    assert r.status_code == 200
    assert r.json() == []


def test_get_project_history_project_not_found_returns_404(client):
    """GET /v1/tenants/{id}/projects/{pid}/history returns 404 when project not found."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [],  # project not found
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/history")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# List deleted projects
# ---------------------------------------------------------------------------


def test_list_deleted_projects_returns_only_deleted(client):
    """GET /v1/tenants/{id}/projects/deleted returns only soft-deleted projects."""
    deleted_row = {**_PROJECT_ROW, "deleted_at": _NOW.isoformat()}
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [deleted_row],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/deleted")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == _PROJECT_ID
    assert data[0]["deleted_at"] is not None


# ---------------------------------------------------------------------------
# RBAC: non-admin caller permission checks
# ---------------------------------------------------------------------------


def test_list_projects_non_member_returns_403(member_client):
    """GET /v1/tenants/{id}/projects returns 403 when caller is not a tenant member."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],  # _is_tenant_admin → not admin
            [],  # _is_tenant_member → not a member → 403
        ]
        r = member_client.get(f"/v1/tenants/{_TENANT_ID}/projects")
    assert r.status_code == 403


def test_list_projects_member_returns_200(member_client):
    """GET /v1/tenants/{id}/projects returns 200 for a non-admin tenant member (project:read is implicit)."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],                    # _is_tenant_admin → not admin
            [{"id": _TENANT_ID}],  # _is_tenant_member → member; project:read is implicit → allowed
            [{"id": _TENANT_ID}],  # _assert_tenant_exists
            [_PROJECT_ROW],        # list projects
        ]
        r = member_client.get(f"/v1/tenants/{_TENANT_ID}/projects")
    assert r.status_code == 200


def test_create_project_member_without_write_permission_returns_403(member_client):
    """POST /v1/tenants/{id}/projects returns 403 when caller lacks project:write permission."""
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [],                    # _is_tenant_admin → not admin
            [{"id": _TENANT_ID}],  # _is_tenant_member → member
            [],                    # _has_rbac_permission → no project:write → 403
        ]
        r = member_client.post(
            f"/v1/tenants/{_TENANT_ID}/projects",
            json={"name": "New Project", "slug": "new-project"},
        )
    assert r.status_code == 403

