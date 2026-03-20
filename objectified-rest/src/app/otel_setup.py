"""Optional OpenTelemetry instrumentation (install ``otel`` dependency group)."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.config import settings

_log = logging.getLogger(__name__)


def instrument_app(app: FastAPI) -> None:
    """
    If ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set and packages are installed,
    export traces for this service via OTLP.
    """
    if not settings.otel_exporter_otlp_endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        _log.warning(
            "OTEL_EXPORTER_OTLP_ENDPOINT is set but OpenTelemetry is not installed. "
            "Run: uv sync --group otel"
        )
        return

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
        }
    )
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    _log.info("OpenTelemetry FastAPI instrumentation enabled (OTLP HTTP)")
