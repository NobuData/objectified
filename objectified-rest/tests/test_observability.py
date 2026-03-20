"""Tests for structured logging, request/trace headers, and rate limiting."""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    return TestClient(app)


def test_health_returns_x_request_id(client):
    """Each response includes a correlation id for operators and downstream logs."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.headers.get("x-request-id")


def test_traceparent_sets_x_trace_id(client):
    """W3C traceparent header supplies trace id for logs and echo in X-Trace-ID."""
    tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    r = client.get("/health", headers={"traceparent": tp})
    assert r.status_code == 200
    assert r.headers.get("x-trace-id") == "4bf92f3577b34da6a3ce929d0e0e4736"


def test_x_request_id_preserved_when_provided(client):
    """Callers can pass X-Request-ID for end-to-end tracing."""
    rid = "custom-req-abc"
    r = client.get("/health", headers={"x-request-id": rid})
    assert r.headers.get("x-request-id") == rid


def test_rate_limit_returns_429(client):
    """Optional sliding-window limit returns 429 with Retry-After."""
    from app.config import settings

    with (
        patch.object(settings, "rate_limit_enabled", True),
        patch.object(settings, "rate_limit_per_minute", 2),
    ):
        assert client.get("/").status_code == 200
        assert client.get("/").status_code == 200
        r3 = client.get("/")
        assert r3.status_code == 429
        assert "Retry-After" in r3.headers
        body = r3.json()
        assert "detail" in body


def test_rate_limit_429_includes_correlation_headers(client):
    """429 responses include X-Request-ID and X-Trace-ID from RequestLoggingMiddleware."""
    from app.config import settings

    with (
        patch.object(settings, "rate_limit_enabled", True),
        patch.object(settings, "rate_limit_per_minute", 1),
    ):
        client.get("/")
        r = client.get("/")
        assert r.status_code == 429
        assert r.headers.get("x-request-id"), "429 must carry X-Request-ID"
        assert r.headers.get("x-trace-id"), "429 must carry X-Trace-ID"


def test_rate_limit_retry_after_is_numeric(client):
    """Retry-After header contains a positive integer, not a hard-coded value."""
    from app.config import settings

    with (
        patch.object(settings, "rate_limit_enabled", True),
        patch.object(settings, "rate_limit_per_minute", 1),
    ):
        client.get("/")
        r = client.get("/")
        assert r.status_code == 429
        retry_after = int(r.headers["Retry-After"])
        assert 1 <= retry_after <= 60


def test_invalid_request_id_header_replaced(client):
    """An X-Request-ID with unsafe characters is rejected and a fresh UUID is generated."""
    r = client.get("/health", headers={"x-request-id": "bad<value>injection"})
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid
    assert rid != "bad<value>injection"


def test_oversized_request_id_header_replaced(client):
    """An X-Request-ID longer than 128 characters is rejected and a UUID is generated."""
    long_id = "a" * 200
    r = client.get("/health", headers={"x-request-id": long_id})
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid
    assert rid != long_id


def test_access_log_is_json_when_configured(client):
    """HTTP access logs include request id, trace id, and http block when formatted as JSON."""
    from app.logging_setup import JsonContextFormatter

    log = logging.getLogger("app.http")
    saved_handlers = list(log.handlers)
    saved_propagate = log.propagate
    lines: list[str] = []

    class CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(self.format(record))

    try:
        log.handlers.clear()
        log.setLevel(logging.INFO)
        log.propagate = False
        handler = CaptureHandler()
        handler.setFormatter(JsonContextFormatter())
        log.addHandler(handler)
        r = client.get("/")
        assert r.status_code == 200
        rid = r.headers.get("x-request-id")
        assert rid
        assert lines, "expected one formatted access log line"
        payload = json.loads(lines[-1])
        assert payload["message"] == "request_completed"
        assert payload["request_id"] == rid
        assert payload["trace_id"] == r.headers.get("x-trace-id")
        assert payload["http"]["path"] == "/"
        assert payload["http"]["status_code"] == 200
        assert "duration_ms" in payload["http"]
    finally:
        log.handlers.clear()
        log.handlers.extend(saved_handlers)
        log.propagate = saved_propagate
