"""Trace-context propagation helpers for future SQS producers and workers."""

from __future__ import annotations

from collections.abc import Iterator, MutableMapping
from contextlib import contextmanager
from typing import Any

from opentelemetry import context, propagate

MessageAttributes = MutableMapping[str, dict[str, str]]


def inject_trace_context(
    message_attributes: MessageAttributes | None = None,
) -> MessageAttributes:
    """Inject W3C trace context into SQS MessageAttributes."""
    attrs: MessageAttributes = message_attributes or {}
    carrier: dict[str, str] = {}
    propagate.inject(carrier)
    for key, value in carrier.items():
        attrs[key] = {"DataType": "String", "StringValue": value}
    return attrs


def extract_trace_context(message_attributes: MutableMapping[str, Any] | None):
    """Extract OpenTelemetry context from SQS MessageAttributes."""
    return propagate.extract(_carrier_from_message_attributes(message_attributes))


@contextmanager
def use_extracted_trace_context(
    message_attributes: MutableMapping[str, Any] | None,
) -> Iterator[None]:
    """Attach SQS trace context while processing one received message."""
    token = context.attach(extract_trace_context(message_attributes))
    try:
        yield
    finally:
        context.detach(token)


def _carrier_from_message_attributes(
    message_attributes: MutableMapping[str, Any] | None,
) -> dict[str, str]:
    carrier: dict[str, str] = {}
    for key, attr in (message_attributes or {}).items():
        if isinstance(attr, dict):
            value = attr.get("StringValue")
            if value is not None:
                carrier[key] = str(value)
    return carrier
