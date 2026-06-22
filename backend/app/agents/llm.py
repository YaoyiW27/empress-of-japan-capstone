"""Pluggable chat model — mirrors ``app.ingest.embed`` (CLAUDE.md: Bedrock-first).

``BedrockChatModel`` is the real path (Claude via Bedrock, ``anthropic.``-prefixed
id); ``StubChatModel`` is a deterministic local stand-in so the agent graph runs and
is testable before Bedrock *chat* IAM is provisioned (coordinate with Yaoyi — PR #49
covered embeddings only). Selected by ``settings.chat_model``.

A ``message`` is a ``{"role": "user"|"assistant", "content": str}`` dict.
"""

from __future__ import annotations

from typing import Protocol


class ChatModel(Protocol):
    model_id: str

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str: ...


class StubChatModel:
    """Deterministic, creds-free reply for local dev/tests. No real generation."""

    def __init__(self) -> None:
        self.model_id = "stub-chat-v1"

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
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
        lc_messages: list[tuple[str, str]] = [("system", system)]
        for m in messages:
            role = "human" if m.get("role") == "user" else "ai"
            lc_messages.append((role, m["content"]))
        result = self._client.invoke(lc_messages)
        return result.content if isinstance(result.content, str) else str(result.content)


class GeminiChatModel:
    """Google Gemini — LOCAL DEV ONLY.

    A free-tier convenience for testing real generation before Bedrock chat IAM
    is ready. NOT the production path: CLAUDE.md mandates Bedrock-first, so don't
    commit this as the default `chat_model`. Reads the key from GEMINI_API_KEY
    (or GOOGLE_API_KEY); never commit the key. Requires `pip install google-genai`.
    """

    def __init__(self, model_id: str, api_key: str | None = None) -> None:
        from google import genai  # lazy: only local-dev gemini runs need this

        self.model_id = model_id
        # Explicit key (from settings/.env) wins; else fall back to the
        # GEMINI_API_KEY / GOOGLE_API_KEY env var.
        self._client = genai.Client(api_key=api_key) if api_key else genai.Client()

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        from google.genai import types

        contents = [
            types.Content(
                role="user" if m.get("role") == "user" else "model",
                parts=[types.Part(text=m["content"])],
            )
            for m in messages
        ]
        result = self._client.models.generate_content(
            model=self.model_id,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=system),
        )
        return result.text or ""


def make_chat_model(
    kind: str, *, model_id: str, region: str, api_key: str | None = None
) -> ChatModel:
    """Factory selecting the chat model by config (settings.chat_model)."""
    if kind == "bedrock":
        return BedrockChatModel(model_id=model_id, region=region)
    if kind == "gemini":
        return GeminiChatModel(model_id=model_id, api_key=api_key)
    if kind == "stub":
        return StubChatModel()
    raise ValueError(
        f"unknown chat_model kind: {kind!r} (expected 'bedrock', 'gemini', or 'stub')"
    )
