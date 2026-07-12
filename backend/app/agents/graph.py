"""LangGraph topology — orchestrator dispatch + one node per persona (issue #31).

    dispatch ──(persona_id)──▶ <persona node> ──▶ END

The dispatch node is a no-op entry point; a conditional edge routes to the persona
node named by ``state["persona_id"]``. Each persona node loads its system prompt and
calls the chat model. There is **no retrieval step yet** — the persona node is exactly
where the future RAG ``retrieve`` step will plug in (deferred to a follow-up issue).
"""

from __future__ import annotations

from collections.abc import Callable

from langgraph.graph import END, StateGraph
from opentelemetry import trace

from app.agents.llm import ChatModel
from app.agents.personas import Persona, load_personas
from app.agents.state import AgentState

tracer = trace.get_tracer(__name__)

NARRATOR_SOFT_RESPONSE_LENGTH = 800
_TRUNCATION_PUNCTUATION = ".!?;:,。！？；：，、…"


def truncate_response(text: str, max_length: int) -> str:
    """Keep a model response within the voice limit at a natural boundary."""
    if len(text) <= max_length:
        return text

    punctuation_index = max(
        (text.rfind(mark, 0, max_length) for mark in _TRUNCATION_PUNCTUATION),
        default=-1,
    )
    if punctuation_index >= 0:
        return text[: punctuation_index + 1]

    space_index = text.rfind(" ", 0, max_length)
    if space_index > 0:
        return text[:space_index].rstrip()

    return text[:max_length]


def _persona_node(
    persona: Persona,
    chat_model: ChatModel,
    max_response_length: int,
) -> Callable[[AgentState], AgentState]:
    def run(state: AgentState) -> AgentState:
        with tracer.start_as_current_span("agent.persona") as span:
            span.set_attribute("agent.persona_id", persona.id)
            span.set_attribute("agent.scene_count", len(persona.scenes))
            messages = state.get("messages", [])
            span.set_attribute("agent.message_count", len(messages))
            voice_prompt = (
                f"{persona.system_prompt}\n\n"
                "Keep each response natural for spoken narration and aim to stay "
                f"within {NARRATOR_SOFT_RESPONSE_LENGTH} characters."
            )
            response = truncate_response(
                chat_model.invoke(voice_prompt, messages),
                max_response_length,
            )
        # Return only deltas: the assistant turn is appended to history (via the
        # `messages` reducer) so the next turn in this session sees it.
        return {
            "persona_id": persona.id,
            "response": response,
            "messages": [{"role": "assistant", "content": response}],
        }

    return run


def build_graph(chat_model: ChatModel, checkpointer=None, *, max_response_length: int = 1000):
    """Compile the agent graph for the given chat model. One node per persona.

    Pass a ``checkpointer`` (e.g. ``MemorySaver``) to enable server-side session
    memory: invoke with ``config={"configurable": {"thread_id": session_id}}`` and
    each turn's messages accumulate per thread. Without one, the graph is stateless.
    """
    personas = load_personas()
    builder = StateGraph(AgentState)

    # dispatch is a no-op entry point; returning {} avoids re-appending messages.
    builder.add_node("dispatch", lambda state: {})
    for persona in personas.values():
        builder.add_node(
            persona.id,
            _persona_node(persona, chat_model, max_response_length),
        )
        builder.add_edge(persona.id, END)

    builder.set_entry_point("dispatch")
    builder.add_conditional_edges(
        "dispatch",
        lambda state: state["persona_id"],
        {pid: pid for pid in personas},
    )
    return builder.compile(checkpointer=checkpointer)
