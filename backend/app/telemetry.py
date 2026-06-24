"""Optional OpenTelemetry setup for the deployed backend.

CloudWatch gives us service-level health first. When OTEL_ENABLED=true and a
Honeycomb API key is injected at runtime, this module adds request and database
traces without requiring code changes in each endpoint.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.config import Settings
from app.db import engine

logger = logging.getLogger(__name__)
_sqlalchemy_instrumented = False


def configure_telemetry(app: FastAPI, settings: Settings) -> None:
    """Configure FastAPI + SQLAlchemy tracing when observability is enabled."""
    if not settings.otel_enabled:
        return

    direct_honeycomb = "honeycomb.io" in settings.otel_exporter_otlp_endpoint
    if direct_honeycomb and not settings.honeycomb_api_key:
        logger.warning(
            "OTEL_ENABLED=true and endpoint is Honeycomb, but HONEYCOMB_API_KEY is not set; "
            "skipping tracing"
        )
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:
        logger.warning("OpenTelemetry dependencies are unavailable; skipping tracing: %s", exc)
        return

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment": settings.app_env,
        }
    )
    provider = TracerProvider(resource=resource)
    headers = {}
    if settings.honeycomb_api_key:
        headers = {
            "x-honeycomb-team": settings.honeycomb_api_key,
            "x-honeycomb-dataset": settings.honeycomb_dataset,
        }

    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=settings.otel_exporter_otlp_endpoint,
                headers=headers,
            )
        )
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

    global _sqlalchemy_instrumented
    if not _sqlalchemy_instrumented:
        SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=provider)
        _sqlalchemy_instrumented = True

    logger.info("OpenTelemetry tracing enabled for %s", settings.otel_service_name)
