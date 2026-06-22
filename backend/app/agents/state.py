"""Shared state flowing through the LangGraph agent graph."""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict, total=False):
    persona_id: str
    scene: str | None
    # Conversation history: {"role": "user"|"assistant", "content": str}.
    # `operator.add` reducer => each turn's messages are *appended* to the
    # checkpointed history (server-side session memory), not overwritten.
    messages: Annotated[list[dict[str, str]], operator.add]
    response: str
