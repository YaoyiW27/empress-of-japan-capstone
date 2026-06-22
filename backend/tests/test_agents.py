"""Unit tests for the LangGraph persona agents (no DB, no AWS — stub chat model)."""

from fastapi.testclient import TestClient

from app.agents.graph import build_graph
from app.agents.llm import StubChatModel
from app.agents.personas import load_personas, scene_to_personas
from app.main import app


def test_personas_load_with_prompts() -> None:
    personas = load_personas()
    assert {"captain_sinclair", "ming_chen", "eleanor_whitmore"} <= set(personas)
    for persona in personas.values():
        assert persona.name
        assert persona.scenes
        assert persona.system_prompt.startswith("You are")


def test_scene_index_disambiguation() -> None:
    index = scene_to_personas()
    # bridge belongs to Sinclair alone; loading_dock is shared.
    assert index["bridge"] == ("captain_sinclair",)
    assert set(index["loading_dock"]) == {"captain_sinclair", "ming_chen"}


def test_graph_dispatches_to_named_persona() -> None:
    graph = build_graph(StubChatModel())
    result = graph.invoke(
        {
            "persona_id": "ming_chen",
            "scene": None,
            "messages": [{"role": "user", "content": "How hot is the engine room?"}],
        }
    )
    assert result["persona_id"] == "ming_chen"
    assert "How hot is the engine room?" in result["response"]


def test_chat_endpoint_happy_path() -> None:
    client = TestClient(app)
    resp = client.post(
        "/chat",
        json={"persona_id": "captain_sinclair", "message": "Are we on schedule?"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["persona_id"] == "captain_sinclair"
    assert body["response"]


def test_chat_endpoint_ambiguous_scene() -> None:
    client = TestClient(app)
    resp = client.post("/chat", json={"scene": "loading_dock", "message": "hi"})
    assert resp.status_code == 400


def test_chat_endpoint_unknown_persona() -> None:
    client = TestClient(app)
    resp = client.post("/chat", json={"persona_id": "nope", "message": "hi"})
    assert resp.status_code == 404
