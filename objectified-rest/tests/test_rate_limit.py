"""Tests for RateLimitMiddleware (GH-132)."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware import rate_limit as rl_mod


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_rate_windows():
    rl_mod._windows.clear()
    yield
    rl_mod._windows.clear()


def test_rate_limit_disabled_allows_traffic(client):
    """When RATE_LIMIT_ENABLED is false, middleware does not return 429."""
    from app.config import settings

    rl_mod._windows.clear()
    with patch.object(settings, "rate_limit_enabled", False):
        for _ in range(5):
            r = client.get("/v1/tenants")
            assert r.status_code != 429


def test_health_exempt_when_rate_limit_enabled(client):
    from app.config import settings

    with patch.object(settings, "rate_limit_enabled", True), patch.object(
        settings, "rate_limit_per_minute", 1
    ):
        for _ in range(5):
            assert client.get("/health").status_code == 200


def test_ip_bucket_returns_429(client):
    from app.config import settings

    rl_mod._windows.clear()
    with patch.object(settings, "rate_limit_enabled", True), patch.object(
        settings, "rate_limit_per_minute", 2
    ):
        assert client.get("/v1/tenants").status_code == 200
        assert client.get("/v1/tenants").status_code == 200
        r = client.get("/v1/tenants")
        assert r.status_code == 429
        assert "Retry-After" in r.headers


def test_api_key_identity_bucket(client):
    """Authenticated API-key traffic uses per-key limits, not shared IP bucket."""
    from app.config import settings

    fake = {
        "key_id": "00000000-0000-0000-0000-000000000099",
        "rate_limit_requests_per_minute": 2,
    }
    rl_mod._windows.clear()
    hdrs = {"X-API-Key": "ok_" + "x" * 40}
    with patch.object(settings, "rate_limit_enabled", True), patch.object(
        settings, "rate_limit_per_minute", 1
    ), patch.object(rl_mod.db, "validate_api_key", return_value=fake):
        assert client.get("/v1/tenants", headers=hdrs).status_code == 200
        assert client.get("/v1/tenants", headers=hdrs).status_code == 200
        r = client.get("/v1/tenants", headers=hdrs)
        assert r.status_code == 429
