"""Shared state flowing through the LangGraph agent graph."""

from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict, total=False):
    persona_id: str
    scene: str | None
    # Conversation history: {"role": "user"|"assistant", "content": str}.
    messages: list[dict[str, str]]
    response: str
