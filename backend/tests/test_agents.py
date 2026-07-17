"""Unit tests for the LangGraph persona agents (no DB, no AWS — stub chat model)."""

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.orm import Session

from app.agents.graph import (
    InvalidGroundedResponseError,
    RetrievalUnavailableError,
    build_graph,
    truncate_response,
)
from app.agents.llm import GroundedChatResult, StubChatModel
from app.agents.personas import load_personas, scene_to_personas
from app.agents.scenes import load_scenes
from app.config import Settings
from app.main import create_app
from app.retrieval import Citation, RetrievalResponse, RetrievedChunk


class EmptyRetriever:
    def retrieve(
        self,
        session: Session,
        query: str,
        *,
        top_k: int = 5,
        ship: str | None = None,
        material_type: str | None = None,
    ) -> RetrievalResponse:
        return RetrievalResponse(results=[])


class StaticRetriever(EmptyRetriever):
    def __init__(self, response: RetrievalResponse) -> None:
        self.response = response
        self.queries: list[str] = []

    def retrieve(
        self,
        session: Session,
        query: str,
        *,
        top_k: int = 5,
        ship: str | None = None,
        material_type: str | None = None,
    ) -> RetrievalResponse:
        self.queries.append(query)
        return self.response


class FailingRetriever(EmptyRetriever):
    def retrieve(
        self,
        session: Session,
        query: str,
        *,
        top_k: int = 5,
        ship: str | None = None,
        material_type: str | None = None,
    ) -> RetrievalResponse:
        raise RuntimeError("database unavailable")


def _agent_test_client(**settings_overrides: object) -> TestClient:
    return TestClient(create_app(Settings(**settings_overrides), retriever=EmptyRetriever()))


class LongResponseChatModel:
    model_id = "long-response-test"

    def __init__(self, response: str) -> None:
        self.response = response
        self.system_prompt = ""

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        self.system_prompt = system
        return self.response

    def invoke_grounded(self, system: str, messages: list[dict[str, str]]) -> GroundedChatResult:
        return GroundedChatResult(
            answer_mode="conversational",
            response=self.invoke(system, messages),
            used_source_ids=[],
        )


class ScriptedChatModel:
    model_id = "scripted-test"

    def __init__(self, results: list[GroundedChatResult | Exception]) -> None:
        self.results = results
        self.calls = 0
        self.system_prompt = ""

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        raise AssertionError("grounded graph must use structured invocation")

    def invoke_grounded(self, system: str, messages: list[dict[str, str]]) -> GroundedChatResult:
        self.system_prompt = system
        result = self.results[self.calls]
        self.calls += 1
        if isinstance(result, Exception):
            raise result
        return result


def _retrieved_chunk(
    *,
    document_id: int,
    chunk_id: int,
    title: str,
    content: str,
    source_type: str = "vmm_catalogue",
) -> RetrievedChunk:
    citation = (
        Citation(
            source_type=source_type,
            title=title,
            source_field="body",
            author_publisher="Wikipedia contributors",
            source_url="https://example.test/source",
            license="CC BY-SA 4.0",
        )
        if source_type == "external_historical"
        else Citation(
            source_type=source_type,
            title=title,
            source_field="composed",
            object_identifier=f"VMM-{document_id}",
            public_url=f"https://example.test/objects/{document_id}",
        )
    )
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id=document_id,
        content=content,
        score=0.8,
        metadata={"title": title, "source_type": source_type},
        citation=citation,
    )


def _candidate_response() -> RetrievalResponse:
    return RetrievalResponse(
        results=[
            _retrieved_chunk(
                document_id=10,
                chunk_id=1,
                title="Dinner menu",
                content="Dinner was served in the dining saloon.",
            ),
            _retrieved_chunk(
                document_id=10,
                chunk_id=2,
                title="Dinner menu",
                content="The menu lists several courses.",
            ),
            _retrieved_chunk(
                document_id=20,
                chunk_id=3,
                title="Ship history",
                content="The ship entered service in 1930.",
                source_type="external_historical",
            ),
        ]
    )


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


def test_scenes_load_with_context_prompts() -> None:
    scenes = load_scenes()
    assert {"bridge", "engine_room", "first_class_suite"} <= set(scenes)
    for scene in scenes.values():
        assert scene.name
        assert scene.context_prompt.startswith("The current location is")


def test_every_persona_scene_has_a_context_prompt() -> None:
    scenes = load_scenes()
    for persona in load_personas().values():
        assert set(persona.scenes) <= set(scenes)


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
    text = "alpha\tbeta\ngamma delta"
    assert truncate_response(text, 12) == "alpha\tbeta"


def test_overlong_response_hard_truncates_without_boundary() -> None:
    assert truncate_response("abcdefghijk", 5) == "abcde"


def test_graph_applies_soft_prompt_and_stores_truncated_response() -> None:
    model = LongResponseChatModel("  First sentence. Second sentence is too long.  ")
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


def test_graph_composes_persona_then_scene_then_grounding_policy() -> None:
    model = LongResponseChatModel("On the bridge.")
    graph = build_graph(model)

    graph.invoke(
        {
            "persona_id": "captain_sinclair",
            "scene": "bridge",
            "messages": [{"role": "user", "content": "Where are we?"}],
        }
    )

    persona_text = load_personas()["captain_sinclair"].system_prompt
    scene_text = load_scenes()["bridge"].context_prompt
    assert persona_text in model.system_prompt
    assert scene_text in model.system_prompt
    assert model.system_prompt.index(persona_text) < model.system_prompt.index(scene_text)
    assert model.system_prompt.index(scene_text) < model.system_prompt.index("GROUNDING POLICY")


def test_switching_scenes_changes_scene_context() -> None:
    bridge_model = LongResponseChatModel("On the bridge.")
    dock_model = LongResponseChatModel("At the dock.")

    build_graph(bridge_model).invoke(
        {
            "persona_id": "captain_sinclair",
            "scene": "bridge",
            "messages": [{"role": "user", "content": "Where are we?"}],
        }
    )
    build_graph(dock_model).invoke(
        {
            "persona_id": "captain_sinclair",
            "scene": "loading_dock",
            "messages": [{"role": "user", "content": "Where are we?"}],
        }
    )

    assert load_scenes()["bridge"].context_prompt in bridge_model.system_prompt
    assert load_scenes()["loading_dock"].context_prompt not in bridge_model.system_prompt
    assert load_scenes()["loading_dock"].context_prompt in dock_model.system_prompt
    assert load_scenes()["bridge"].context_prompt not in dock_model.system_prompt


def test_grounded_answer_returns_only_selected_deduplicated_citations() -> None:
    model = ScriptedChatModel(
        [
            GroundedChatResult(
                answer_mode="grounded",
                response="I remember dinners being served in the saloon.",
                used_source_ids=["document-10", "document-10"],
            )
        ]
    )
    graph = build_graph(model, retrieve_candidates=lambda _: _candidate_response())

    result = graph.invoke(
        {
            "persona_id": "eleanor_whitmore",
            "messages": [{"role": "user", "content": "What was dinner like?"}],
        }
    )

    assert result["answer_mode"] == "grounded"
    assert [citation.title for citation in result["citations"]] == ["Dinner menu"]
    assert "document-10" not in result["response"]
    assert "candidate_sources=" in model.system_prompt


def test_graph_retrieves_with_latest_user_turn_only() -> None:
    queries: list[str] = []

    def retrieve(query: str) -> RetrievalResponse:
        queries.append(query)
        return RetrievalResponse(results=[])

    graph = build_graph(StubChatModel(), retrieve_candidates=retrieve)
    graph.invoke(
        {
            "persona_id": "ming_chen",
            "messages": [
                {"role": "user", "content": "Earlier question"},
                {"role": "assistant", "content": "Earlier answer"},
                {"role": "user", "content": "Current question"},
            ],
        }
    )

    assert queries == ["Current question"]


@pytest.mark.parametrize("mode", ["conversational", "insufficient_evidence"])
def test_non_grounded_modes_return_no_citations(mode: str) -> None:
    response = (
        "Good day to you."
        if mode == "conversational"
        else "I cannot say from the records I have. Please ask the museum staff."
    )
    model = ScriptedChatModel(
        [GroundedChatResult(answer_mode=mode, response=response, used_source_ids=[])]
    )
    graph = build_graph(model, retrieve_candidates=lambda _: _candidate_response())

    result = graph.invoke(
        {
            "persona_id": "captain_sinclair",
            "messages": [{"role": "user", "content": "Hello"}],
        }
    )

    assert result["answer_mode"] == mode
    assert result["citations"] == []


def test_invalid_source_id_retries_once_then_accepts_valid_result() -> None:
    model = ScriptedChatModel(
        [
            GroundedChatResult(
                answer_mode="grounded",
                response="An unsupported answer.",
                used_source_ids=["document-999"],
            ),
            GroundedChatResult(
                answer_mode="grounded",
                response="A supported answer.",
                used_source_ids=["document-20"],
            ),
        ]
    )
    graph = build_graph(model, retrieve_candidates=lambda _: _candidate_response())

    result = graph.invoke(
        {
            "persona_id": "captain_sinclair",
            "messages": [{"role": "user", "content": "When did she enter service?"}],
        }
    )

    assert model.calls == 2
    assert [citation.title for citation in result["citations"]] == ["Ship history"]


def test_invalid_structured_output_twice_fails_closed() -> None:
    invalid = GroundedChatResult(
        answer_mode="conversational",
        response="Hello 【1】",
        used_source_ids=[],
    )
    model = ScriptedChatModel([invalid, invalid])
    graph = build_graph(model, retrieve_candidates=lambda _: _candidate_response())

    with pytest.raises(InvalidGroundedResponseError):
        graph.invoke(
            {
                "persona_id": "captain_sinclair",
                "messages": [{"role": "user", "content": "Hello"}],
            }
        )


def test_retrieval_failure_does_not_call_chat_model() -> None:
    model = ScriptedChatModel(
        [GroundedChatResult(answer_mode="conversational", response="Hello", used_source_ids=[])]
    )

    def unavailable(_: str) -> RetrievalResponse:
        raise RuntimeError("database unavailable")

    graph = build_graph(model, retrieve_candidates=unavailable)
    with pytest.raises(RetrievalUnavailableError):
        graph.invoke(
            {
                "persona_id": "captain_sinclair",
                "messages": [{"role": "user", "content": "Hello"}],
            }
        )
    assert model.calls == 0


def test_session_memory_accumulates() -> None:
    graph = build_graph(StubChatModel(), checkpointer=MemorySaver())
    cfg = {"configurable": {"thread_id": "s1"}}
    graph.invoke({"persona_id": "ming_chen", "messages": [{"role": "user", "content": "Q1"}]}, cfg)
    result = graph.invoke(
        {"persona_id": "ming_chen", "messages": [{"role": "user", "content": "Q2"}]}, cfg
    )
    contents = [m["content"] for m in result["messages"]]
    # Turn 2 still sees turn 1 — server-side session memory.
    assert "Q1" in contents and "Q2" in contents


def test_chat_endpoint_session_id_disabled_by_default() -> None:
    # Server-side memory is off by default (in-process MemorySaver isn't shared
    # across Fargate tasks; tracked in #34). A session_id request returns 501.
    client = _agent_test_client()
    resp = client.post(
        "/chat", json={"persona_id": "captain_sinclair", "session_id": "demo-1", "message": "Hi?"}
    )
    assert resp.status_code == 501


def test_chat_endpoint_session_id_path_when_enabled() -> None:
    # With the flag on, the session_id memory path works end to end.
    from app.config import Settings, get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app_with_memory = create_app(Settings(enable_session_memory=True), retriever=EmptyRetriever())
    client = TestClient(app_with_memory)
    body = {"persona_id": "captain_sinclair", "session_id": "demo-1"}
    r1 = client.post("/chat", json={**body, "message": "First question?"})
    r2 = client.post("/chat", json={**body, "message": "Second question?"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["persona_id"] == "captain_sinclair"


def test_chat_endpoint_happy_path() -> None:
    client = _agent_test_client()
    resp = client.post(
        "/chat",
        json={"persona_id": "captain_sinclair", "message": "Are we on schedule?"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["persona_id"] == "captain_sinclair"
    assert body["response"]
    assert body["citations"] == []


def test_chat_endpoint_returns_selected_citations_separately() -> None:
    retriever = StaticRetriever(_candidate_response())
    model = ScriptedChatModel(
        [
            GroundedChatResult(
                answer_mode="grounded",
                response="I remember dinners being served in the saloon.",
                used_source_ids=["document-10"],
            )
        ]
    )
    client = TestClient(create_app(Settings(), retriever=retriever, agent_chat_model=model))

    response = client.post(
        "/chat",
        json={"persona_id": "eleanor_whitmore", "message": "What was dinner like?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["response"] == "I remember dinners being served in the saloon."
    assert [citation["title"] for citation in body["citations"]] == ["Dinner menu"]
    assert retriever.queries == ["What was dinner like?"]


def test_chat_endpoint_returns_503_when_retrieval_is_unavailable() -> None:
    client = TestClient(create_app(Settings(), retriever=FailingRetriever()))

    response = client.post("/chat", json={"persona_id": "captain_sinclair", "message": "Hello"})

    assert response.status_code == 503
    assert response.json()["detail"] == "grounding retrieval is unavailable"


def test_chat_endpoint_returns_502_after_two_invalid_model_results() -> None:
    invalid = GroundedChatResult(
        answer_mode="grounded",
        response="This answer has no selected evidence.",
        used_source_ids=[],
    )
    client = TestClient(
        create_app(
            Settings(),
            retriever=StaticRetriever(_candidate_response()),
            agent_chat_model=ScriptedChatModel([invalid, invalid]),
        )
    )

    response = client.post(
        "/chat",
        json={"persona_id": "captain_sinclair", "message": "When did she enter service?"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "chat model returned an invalid response"


def test_chat_endpoint_ambiguous_scene() -> None:
    client = _agent_test_client()
    resp = client.post("/chat", json={"scene": "loading_dock", "message": "hi"})
    assert resp.status_code == 400


def test_chat_endpoint_unknown_persona() -> None:
    client = _agent_test_client()
    resp = client.post("/chat", json={"persona_id": "nope", "message": "hi"})
    assert resp.status_code == 404


def test_chat_endpoint_unknown_scene_with_explicit_persona() -> None:
    client = _agent_test_client()
    resp = client.post(
        "/chat",
        json={"persona_id": "captain_sinclair", "scene": "nope", "message": "hi"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "unknown scene: 'nope'"


def test_chat_endpoint_rejects_persona_unavailable_in_scene() -> None:
    client = _agent_test_client()
    resp = client.post(
        "/chat",
        json={"persona_id": "captain_sinclair", "scene": "engine_room", "message": "hi"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "persona 'captain_sinclair' is not available in scene 'engine_room'"
    )
