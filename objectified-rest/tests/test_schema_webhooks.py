"""Tests for schema webhook REST endpoints (GH-135)."""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import require_authenticated
from app.main import app
from tests.conftest import mock_db_all

_NOW = datetime.now(timezone.utc)
_TENANT_ID = "00000000-0000-0000-0000-000000000010"
_PROJECT_ID = "00000000-0000-0000-0000-000000000020"
_WEBHOOK_ID = "00000000-0000-0000-0000-000000000021"
_ACCOUNT_ID = "00000000-0000-0000-0000-000000000040"

_CALLER = {"auth_method": "jwt", "user_id": _ACCOUNT_ID, "is_admin": True}


@pytest.fixture
def client():
    app.dependency_overrides[require_authenticated] = lambda: _CALLER
    yield TestClient(app)
    app.dependency_overrides.clear()


def _webhook_row() -> dict[str, Any]:
    return {
        "id": _WEBHOOK_ID,
        "project_id": _PROJECT_ID,
        "url": "https://example.com/hook",
        "events": ["schema.committed"],
        "enabled": True,
        "description": "d",
        "metadata": {},
        "created_at": _NOW,
        "updated_at": None,
        "deleted_at": None,
        "has_secret": True,
    }


def test_list_schema_webhooks_empty(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
            [],
        ]
        r = client.get(f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhooks")
        assert r.status_code == 200
        assert r.json() == []


def test_create_schema_webhook_invalid_url(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhooks",
            json={"url": "ftp://bad/example"},
        )
        assert r.status_code == 400


def test_create_schema_webhook_private_ip_rejected(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
        ]
        import socket
        private_addr = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.168.1.1", 0)),
        ]
        with patch("app.routes.schema_webhooks.socket.getaddrinfo", return_value=private_addr):
            r = client.post(
                f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhooks",
                json={"url": "https://internal.example.com/hook"},
            )
        assert r.status_code == 400
        assert "private" in r.json()["detail"].lower() or "reserved" in r.json()["detail"].lower()


def test_create_schema_webhook_credentials_in_url_rejected(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
        ]
        r = client.post(
            f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhooks",
            json={"url": "https://user:pass@example.com/hook"},
        )
        assert r.status_code == 400
        assert "credential" in r.json()["detail"].lower()


def test_create_schema_webhook_201(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
        ]
        mock_db.execute_mutation.return_value = _webhook_row()
        # Simulate DNS resolution returning a public IP (SSRF guard).
        import socket
        public_addr = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0)),
        ]
        with patch("app.routes.schema_webhooks.socket.getaddrinfo", return_value=public_addr):
            r = client.post(
                f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhooks",
                json={"url": "https://example.com/hook", "events": ["schema.committed"], "secret": "mysecret"},
            )
        assert r.status_code == 201
        body = r.json()
        assert body["url"] == "https://example.com/hook"
        assert body["has_secret"] is True
        assert body["events"] == ["schema.committed"]


def test_process_deliveries_returns_counts(client):
    with mock_db_all() as mock_db:
        mock_db.execute_query.side_effect = [
            [{"id": _TENANT_ID}],
            [{"id": _PROJECT_ID, "tenant_id": _TENANT_ID}],
        ]
        with patch(
            "app.routes.schema_webhooks.process_pending_schema_webhook_deliveries",
            return_value={"attempted": 2, "delivered": 1, "failed": 1},
        ):
            r = client.post(
                f"/v1/tenants/{_TENANT_ID}/projects/{_PROJECT_ID}/schema-webhook-deliveries/process",
                json={"limit": 10},
            )
        assert r.status_code == 200
        assert r.json() == {"attempted": 2, "delivered": 1, "failed": 1}


def test_sign_webhook_body_stable():
    from app.schema_webhook_service import sign_webhook_body

    sig = sign_webhook_body(b'{"a":1}', "secret")
    assert sig.startswith("sha256=")
    assert len(sig) > 10
