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


def test_access_log_is_json_when_configured(client):
    """HTTP access logs include request id, trace id, and http block when formatted as JSON."""
    import logging

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
