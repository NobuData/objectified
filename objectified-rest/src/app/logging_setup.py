"""Configure application logging (optional JSON lines for production)."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from app.config import Settings
from app.request_context import snapshot_context_for_log


class JsonContextFormatter(logging.Formatter):
    """JSON log lines with request context merged from contextvars."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        ctx = snapshot_context_for_log()
        for key, val in ctx.items():
            if val is not None:
                payload[key] = val
        http_payload: dict[str, Any] = {}
        for attr, short in (
            ("http_method", "method"),
            ("http_path", "path"),
            ("http_status_code", "status_code"),
            ("duration_ms", "duration_ms"),
        ):
            if hasattr(record, attr):
                http_payload[short] = getattr(record, attr)
        if http_payload:
            payload["http"] = http_payload
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(settings: Settings) -> None:
    """Attach handlers to the root logger for the API process."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format == "json":
        handler.setFormatter(JsonContextFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S%z",
            )
        )
    root.addHandler(handler)
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Quiet third-party noise at INFO unless debugging
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
