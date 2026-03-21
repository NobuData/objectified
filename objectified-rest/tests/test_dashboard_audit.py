"""Tests for optional dashboard page-visit audit (GitHub #188)."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app


_MEMBER_CALLER = {
    "auth_method": "jwt",
    "user_id": "member-uid",
    "account_id": "member-uid",
    "is_admin": False,
}


@pytest.fixture
def member_client():
    app.dependency_overrides[require_authenticated] = lambda: _MEMBER_CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_record_dashboard_page_visit_noop_when_disabled(member_client):
    from app.config import settings

    with patch.object(settings, "dashboard_page_visit_audit_enabled", False):
        r = member_client.post(
            "/v1/me/dashboard/page-visits",
            json={"route": "/dashboard/projects/p1/versions/v1"},
        )
    assert r.status_code == 204


def test_record_dashboard_page_visit_inserts_when_enabled(member_client):
    from app.config import settings
    from app.routes import dashboard_audit as da

    with patch.object(settings, "dashboard_page_visit_audit_enabled", True):
        with patch.object(da.db, "execute_mutation", return_value=None) as mut:
            r = member_client.post(
                "/v1/me/dashboard/page-visits",
                json={"route": "/dashboard/foo"},
            )
    assert r.status_code == 204
    mut.assert_called_once()


def test_record_dashboard_page_visit_403_when_not_tenant_member(member_client):
    from app.config import settings

    with patch.object(settings, "dashboard_page_visit_audit_enabled", True):
        with patch(
            "app.routes.dashboard_audit._is_tenant_member",
            return_value=False,
        ):
            r = member_client.post(
                "/v1/me/dashboard/page-visits",
                json={
                    "route": "/dashboard/foo",
                    "tenant_id": "00000000-0000-0000-0000-000000000002",
                },
            )
    assert r.status_code == 403


def test_record_dashboard_page_visit_422_invalid_route(member_client):
    from app.config import settings

    with patch.object(settings, "dashboard_page_visit_audit_enabled", True):
        r = member_client.post(
            "/v1/me/dashboard/page-visits",
            json={"route": "not-a-path"},
        )
    assert r.status_code == 422
