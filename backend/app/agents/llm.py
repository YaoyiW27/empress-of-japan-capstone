"""Pluggable chat model — mirrors ``app.ingest.embed`` (CLAUDE.md: Bedrock-first).

``BedrockChatModel`` is the real path (Claude Sonnet 4.6 via Bedrock, through the
US cross-Region inference profile ``us.anthropic.claude-sonnet-4-6``);
``StubChatModel`` is a deterministic local stand-in so the agent graph runs and is
testable without AWS creds. Selected by ``settings.chat_model``.

A ``message`` is a ``{"role": "user"|"assistant", "content": str}`` dict.
"""

from __future__ import annotations

from typing import Protocol

from opentelemetry import trace

tracer = trace.get_tracer(__name__)


class ChatModel(Protocol):
    model_id: str

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str: ...


class StubChatModel:
    """Deterministic, creds-free reply for local dev/tests. No real generation."""

    def __init__(self) -> None:
        self.model_id = "stub-chat-v1"

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        with tracer.start_as_current_span("llm.invoke") as span:
            span.set_attribute("llm.provider", "stub")
            span.set_attribute("llm.model_id", self.model_id)
            span.set_attribute("llm.message_count", len(messages))
            last_user = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"),
                "",
            )
            # First sentence of the system prompt identifies the persona ("You are …").
            identity = system.strip().split(".")[0] if system else "An agent"
            return f"[stub reply] {identity}. You asked: {last_user!r}"


class BedrockChatModel:
    """Claude via AWS Bedrock (real). Requires sandbox chat IAM + model access."""

    def __init__(self, model_id: str, region: str) -> None:
        # Imported lazily so stub/local runs need no langchain-aws/AWS wiring.
        from langchain_aws import ChatBedrockConverse

        self.model_id = model_id
        self._client = ChatBedrockConverse(model=model_id, region_name=region)

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        with tracer.start_as_current_span("llm.invoke") as span:
            span.set_attribute("llm.provider", "bedrock")
            span.set_attribute("llm.model_id", self.model_id)
            span.set_attribute("llm.message_count", len(messages))
            lc_messages: list[tuple[str, str]] = [("system", system)]
            for m in messages:
                role = "human" if m.get("role") == "user" else "ai"
                lc_messages.append((role, m["content"]))
            result = self._client.invoke(lc_messages)
            return result.content if isinstance(result.content, str) else str(result.content)


def make_chat_model(kind: str, *, model_id: str, region: str) -> ChatModel:
    """Factory selecting the chat model by config (settings.chat_model)."""
    if kind == "bedrock":
        return BedrockChatModel(model_id=model_id, region=region)
    if kind == "stub":
        return StubChatModel()
    raise ValueError(f"unknown chat_model kind: {kind!r} (expected 'bedrock' or 'stub')")
