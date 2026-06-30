"""OpenTelemetry setup and propagation tests."""

from fastapi.testclient import TestClient
from opentelemetry import context, trace
from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState

from app.config import Settings
from app.main import create_app
from app.tracing.sqs import extract_trace_context, inject_trace_context


def test_app_creation_with_otel_disabled() -> None:
    app = create_app(Settings(otel_enabled=False))
    client = TestClient(app)
    assert client.get("/health").status_code == 200


def test_app_creation_with_otel_enabled_without_export_credentials() -> None:
    app = create_app(
        Settings(
            otel_enabled=True,
            otel_exporter_otlp_endpoint="https://api.honeycomb.io/v1/traces",
            honeycomb_api_key=None,
        )
    )
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}


def test_sqs_trace_context_round_trip() -> None:
    span_context = SpanContext(
        trace_id=0x1234567890ABCDEF1234567890ABCDEF,
        span_id=0x1234567890ABCDEF,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
        trace_state=TraceState(),
    )
    token = context.attach(trace.set_span_in_context(NonRecordingSpan(span_context)))
    try:
        attrs: dict[str, dict[str, str]] = {}
        result = inject_trace_context(attrs)
    finally:
        context.detach(token)

    assert result is attrs
    assert "traceparent" in attrs
    assert attrs["traceparent"]["DataType"] == "String"
    assert attrs["traceparent"]["StringValue"].startswith("00-")

    extracted = extract_trace_context(attrs)
    span_context = trace.get_current_span(extracted).get_span_context()
    assert span_context.is_valid
