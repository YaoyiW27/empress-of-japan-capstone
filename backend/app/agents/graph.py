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

from app.agents.llm import ChatModel
from app.agents.personas import Persona, load_personas
from app.agents.state import AgentState


def _persona_node(persona: Persona, chat_model: ChatModel) -> Callable[[AgentState], AgentState]:
    def run(state: AgentState) -> AgentState:
        messages = state.get("messages", [])
        response = chat_model.invoke(persona.system_prompt, messages)
        return {"persona_id": persona.id, "response": response}

    return run


def build_graph(chat_model: ChatModel):
    """Compile the agent graph for the given chat model. One node per persona."""
    personas = load_personas()
    builder = StateGraph(AgentState)

    builder.add_node("dispatch", lambda state: state)
    for persona in personas.values():
        builder.add_node(persona.id, _persona_node(persona, chat_model))
        builder.add_edge(persona.id, END)

    builder.set_entry_point("dispatch")
    builder.add_conditional_edges(
        "dispatch",
        lambda state: state["persona_id"],
        {pid: pid for pid in personas},
    )
    return builder.compile()
