"""OpenTelemetry setup and tracing helpers for the backend."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import DEPLOYMENT_ENVIRONMENT, SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import Settings

log = logging.getLogger(__name__)

_provider_configured = False
_sqlalchemy_instrumented = False
_botocore_instrumented = False
_psycopg_instrumented = False


def get_tracer(name: str):
    """Return a tracer scoped to an app module."""
    return trace.get_tracer(name)


def setup_observability(app: FastAPI, settings: Settings, engine=None) -> None:
    """Configure OpenTelemetry once and instrument the app.

    Local dev keeps tracing enabled but does not export spans unless an OTLP
    endpoint is configured. Deployed environments can point the standard
    OTEL_EXPORTER_OTLP_ENDPOINT env var at the team collector.
    """
    if not settings.otel_enabled:
        return

    _configure_provider(settings)
    _instrument_dependencies(engine)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=trace.get_tracer_provider())


def _configure_provider(settings: Settings) -> None:
    global _provider_configured
    if _provider_configured:
        return

    resource = Resource.create(
        {
            SERVICE_NAME: settings.otel_service_name,
            DEPLOYMENT_ENVIRONMENT: settings.app_env,
        }
    )
    provider = TracerProvider(resource=resource)
    if settings.otel_exporter_otlp_endpoint:
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))

    try:
        trace.set_tracer_provider(provider)
    except Exception as exc:
        log.debug("OpenTelemetry tracer provider was already configured: %s", exc)
    _provider_configured = True


def _instrument_dependencies(engine=None) -> None:
    global _botocore_instrumented, _psycopg_instrumented, _sqlalchemy_instrumented

    if not _botocore_instrumented:
        BotocoreInstrumentor().instrument()
        _botocore_instrumented = True

    if not _psycopg_instrumented:
        PsycopgInstrumentor().instrument()
        _psycopg_instrumented = True

    if engine is not None and not _sqlalchemy_instrumented:
        SQLAlchemyInstrumentor().instrument(engine=engine)
        _sqlalchemy_instrumented = True
