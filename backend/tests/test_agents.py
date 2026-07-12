"""Unit tests for the LangGraph persona agents (no DB, no AWS — stub chat model)."""

from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from app.agents.graph import build_graph, truncate_response
from app.agents.llm import StubChatModel
from app.agents.personas import load_personas, scene_to_personas
from app.main import app


class LongResponseChatModel:
    model_id = "long-response-test"

    def __init__(self, response: str) -> None:
        self.response = response
        self.system_prompt = ""

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        self.system_prompt = system
        return self.response


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


def test_response_within_limit_is_unchanged() -> None:
    assert truncate_response("A short response.", 1000) == "A short response."


def test_overlong_response_truncates_at_latest_english_period() -> None:
    text = "First sentence. Second sentence continues beyond the limit."
    assert truncate_response(text, 30) == "First sentence."


def test_overlong_response_truncates_at_latest_chinese_period() -> None:
    text = "这是第一句。这是第二句并且会超过限制。"
    assert truncate_response(text, 10) == "这是第一句。"


def test_overlong_response_uses_other_punctuation_before_whitespace() -> None:
    text = "alpha beta, gamma delta continues"
    assert truncate_response(text, 20) == "alpha beta,"


def test_overlong_response_uses_whitespace_without_punctuation() -> None:
    text = "alpha beta gamma delta"
    assert truncate_response(text, 12) == "alpha beta"


def test_overlong_response_hard_truncates_without_boundary() -> None:
    assert truncate_response("abcdefghijk", 5) == "abcde"


def test_graph_applies_soft_prompt_and_stores_truncated_response() -> None:
    model = LongResponseChatModel("First sentence. Second sentence is too long.")
    graph = build_graph(model, max_response_length=25)

    result = graph.invoke(
        {
            "persona_id": "captain_sinclair",
            "scene": None,
            "messages": [{"role": "user", "content": "Tell me more."}],
        }
    )

    assert "within 800 characters" in model.system_prompt
    assert result["response"] == "First sentence."
    assert result["messages"][-1] == {
        "role": "assistant",
        "content": result["response"],
    }


def test_session_memory_accumulates() -> None:
    graph = build_graph(StubChatModel(), checkpointer=MemorySaver())
    cfg = {"configurable": {"thread_id": "s1"}}
    graph.invoke(
        {"persona_id": "ming_chen", "messages": [{"role": "user", "content": "Q1"}]}, cfg
    )
    result = graph.invoke(
        {"persona_id": "ming_chen", "messages": [{"role": "user", "content": "Q2"}]}, cfg
    )
    contents = [m["content"] for m in result["messages"]]
    # Turn 2 still sees turn 1 — server-side session memory.
    assert "Q1" in contents and "Q2" in contents


def test_chat_endpoint_session_id_disabled_by_default() -> None:
    # Server-side memory is off by default (in-process MemorySaver isn't shared
    # across Fargate tasks; tracked in #34). A session_id request returns 501.
    client = TestClient(app)
    resp = client.post(
        "/chat", json={"persona_id": "captain_sinclair", "session_id": "demo-1", "message": "Hi?"}
    )
    assert resp.status_code == 501


def test_chat_endpoint_session_id_path_when_enabled() -> None:
    # With the flag on, the session_id memory path works end to end.
    from app.config import Settings, get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app_with_memory = create_app(Settings(enable_session_memory=True))
    client = TestClient(app_with_memory)
    body = {"persona_id": "captain_sinclair", "session_id": "demo-1"}
    r1 = client.post("/chat", json={**body, "message": "First question?"})
    r2 = client.post("/chat", json={**body, "message": "Second question?"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["persona_id"] == "captain_sinclair"


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
