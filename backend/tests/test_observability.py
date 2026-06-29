"""OpenTelemetry setup and propagation tests."""

from fastapi.testclient import TestClient
from opentelemetry import trace

from app.config import Settings
from app.main import create_app
from app.tracing.sqs import extract_trace_context, inject_trace_context


def test_app_creation_with_otel_disabled() -> None:
    app = create_app(Settings(otel_enabled=False))
    client = TestClient(app)
    assert client.get("/health").status_code == 200


def test_app_creation_with_otel_enabled_without_exporter() -> None:
    app = create_app(Settings(otel_enabled=True, otel_exporter_otlp_endpoint=None))
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}


def test_sqs_trace_context_round_trip() -> None:
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("test-parent"):
        attrs = inject_trace_context({})

    assert "traceparent" in attrs
    assert attrs["traceparent"]["DataType"] == "String"
    assert attrs["traceparent"]["StringValue"].startswith("00-")

    extracted = extract_trace_context(attrs)
    span_context = trace.get_current_span(extracted).get_span_context()
    assert span_context.is_valid
