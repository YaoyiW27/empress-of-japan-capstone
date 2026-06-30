"""Optional OpenTelemetry setup for the deployed backend and worker.

CloudWatch gives us service-level health first. When OTEL_ENABLED=true and a
Honeycomb API key is injected at runtime, this module adds request and database
traces without requiring code changes in each endpoint.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from urllib.parse import urlparse

from fastapi import FastAPI

from app.config import Settings
from app.db import engine

logger = logging.getLogger(__name__)
_sqlalchemy_instrumented = False


def _is_honeycomb_endpoint(endpoint: str) -> bool:
    hostname = urlparse(endpoint).hostname
    return hostname == "api.honeycomb.io" or (
        hostname is not None and hostname.endswith(".honeycomb.io")
    )


def _configure_tracer_provider(settings: Settings):
    if not settings.otel_enabled:
        return None

    direct_honeycomb = _is_honeycomb_endpoint(settings.otel_exporter_otlp_endpoint)
    if direct_honeycomb and not settings.honeycomb_api_key:
        logger.warning(
            "OTEL_ENABLED=true and endpoint is Honeycomb, but HONEYCOMB_API_KEY is not set; "
            "skipping tracing"
        )
        return None

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
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
            **_parse_resource_attributes(settings.otel_resource_attributes),
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

    global _sqlalchemy_instrumented
    if not _sqlalchemy_instrumented:
        SQLAlchemyInstrumentor().instrument(engine=engine, tracer_provider=provider)
        _sqlalchemy_instrumented = True

    return provider


def configure_telemetry(app: FastAPI, settings: Settings) -> None:
    """Configure FastAPI + SQLAlchemy tracing when observability is enabled."""
    provider = _configure_tracer_provider(settings)
    if provider is None:
        return

    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    except ImportError as exc:
        logger.warning("FastAPI instrumentation is unavailable; skipping tracing: %s", exc)
        return

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    logger.info("OpenTelemetry tracing enabled for %s", settings.otel_service_name)


def configure_worker_telemetry(settings: Settings) -> None:
    """Configure tracing for the standalone worker process."""
    provider = _configure_tracer_provider(settings)
    if provider is not None:
        logger.info("OpenTelemetry worker tracing enabled for %s", settings.otel_service_name)


def _parse_resource_attributes(value: str | None) -> Mapping[str, str]:
    """Parse OTEL_RESOURCE_ATTRIBUTES-style key=value pairs."""
    attrs: dict[str, str] = {}
    if not value:
        return attrs

    for pair in value.split(","):
        key, sep, attr_value = pair.partition("=")
        key = key.strip()
        if sep and key:
            attrs[key] = attr_value.strip()
    return attrs
