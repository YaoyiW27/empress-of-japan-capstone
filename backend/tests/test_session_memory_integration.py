"""Postgres integration tests for shared, expiring agent session memory."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.agents.graph import build_graph
from app.agents.llm import GroundedChatResult
from app.config import Settings, get_settings
from app.main import create_app
from app.retrieval import RetrievalResponse
from app.session_memory import PostgresSessionMemory


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


class MessageCountChatModel:
    model_id = "message-count-test"

    def invoke(self, system: str, messages: list[dict[str, str]]) -> str:
        return f"messages:{len(messages)}"

    def invoke_grounded(self, system: str, messages: list[dict[str, str]]) -> GroundedChatResult:
        return GroundedChatResult(
            answer_mode="conversational",
            response=self.invoke(system, messages),
            used_source_ids=[],
        )


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_engine(
        get_settings().sqlalchemy_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 2},
    )
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT 1"))
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS agent_sessions (
                        session_id TEXT PRIMARY KEY,
                        last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_agent_sessions_expires_at "
                    "ON agent_sessions (expires_at)"
                )
            )
    except Exception:
        engine.dispose()
        pytest.skip("no Postgres database reachable at DATABASE_URL")
    yield engine
    engine.dispose()


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url=get_settings().psycopg_conninfo,
        enable_session_memory=True,
        session_cleanup_interval_seconds=3600,
    )


def _app(settings: Settings, memory: PostgresSessionMemory):
    return create_app(
        settings,
        retriever=EmptyRetriever(),
        agent_chat_model=MessageCountChatModel(),
        session_memory_backend=memory,
    )


def _chat(client: TestClient, session_id: str, message: str):
    return client.post(
        "/chat",
        json={
            "persona_id": "captain_sinclair",
            "session_id": session_id,
            "message": message,
        },
    )


def _purge(engine, session_id: str) -> None:
    memory = PostgresSessionMemory(_settings(), engine)
    memory.open()
    try:
        memory.checkpointer.delete_thread(session_id)
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM agent_sessions WHERE session_id = :session_id"),
                {"session_id": session_id},
            )
    finally:
        memory.close()


def test_two_instances_and_restart_share_one_thread(pg_engine) -> None:
    settings = _settings()
    session_id = f"integration-{uuid4()}"
    first = PostgresSessionMemory(settings, pg_engine)
    second = PostgresSessionMemory(settings, pg_engine)
    try:
        with (
            TestClient(_app(settings, first)) as first_client,
            TestClient(_app(settings, second)) as second_client,
        ):
            assert _chat(first_client, session_id, "first").json()["response"] == "messages:1"
            assert _chat(second_client, session_id, "second").json()["response"] == "messages:3"

        restarted = PostgresSessionMemory(settings, pg_engine)
        with TestClient(_app(settings, restarted)) as restarted_client:
            assert _chat(restarted_client, session_id, "third").json()["response"] == "messages:5"
    finally:
        _purge(pg_engine, session_id)


def test_expired_id_starts_a_fresh_conversation(pg_engine) -> None:
    settings = _settings()
    session_id = f"expired-{uuid4()}"
    memory = PostgresSessionMemory(settings, pg_engine)
    try:
        with TestClient(_app(settings, memory)) as client:
            assert _chat(client, session_id, "old").json()["response"] == "messages:1"
            with pg_engine.begin() as conn:
                conn.execute(
                    text(
                        "UPDATE agent_sessions SET expires_at = now() - interval '1 second' "
                        "WHERE session_id = :session_id"
                    ),
                    {"session_id": session_id},
                )
            assert _chat(client, session_id, "new").json()["response"] == "messages:1"
    finally:
        _purge(pg_engine, session_id)


def test_concurrent_cleaners_safely_delete_only_expired_threads(pg_engine) -> None:
    settings = _settings()
    session_id = f"cleanup-{uuid4()}"
    active_id = f"active-{uuid4()}"
    first = PostgresSessionMemory(settings, pg_engine)
    second = PostgresSessionMemory(settings, pg_engine)
    first.open()
    second.open()
    try:
        first.refresh(session_id)
        first.refresh(active_id)
        graph = build_graph(
            MessageCountChatModel(),
            checkpointer=first.checkpointer,
            retrieve_candidates=lambda _query: RetrievalResponse(results=[]),
        )
        graph.invoke(
            {
                "persona_id": "captain_sinclair",
                "messages": [{"role": "user", "content": "remember this"}],
            },
            {"configurable": {"thread_id": session_id}},
        )
        with pg_engine.connect() as conn:
            assert (
                conn.execute(
                    text("SELECT count(*) FROM checkpoints WHERE thread_id = :session_id"),
                    {"session_id": session_id},
                ).scalar_one()
                > 0
            )
        with pg_engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE agent_sessions SET expires_at = now() - interval '1 second' "
                    "WHERE session_id = :session_id"
                ),
                {"session_id": session_id},
            )
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda memory: memory.cleanup_expired(), [first, second]))
        assert sum(results) >= 1

        with pg_engine.connect() as conn:
            assert (
                conn.execute(
                    text("SELECT count(*) FROM agent_sessions WHERE session_id = :session_id"),
                    {"session_id": session_id},
                ).scalar_one()
                == 0
            )
            assert (
                conn.execute(
                    text("SELECT count(*) FROM agent_sessions WHERE session_id = :session_id"),
                    {"session_id": active_id},
                ).scalar_one()
                == 1
            )
            for table in ("checkpoints", "checkpoint_blobs", "checkpoint_writes"):
                assert (
                    conn.execute(
                        text(f"SELECT count(*) FROM {table} WHERE thread_id = :session_id"),
                        {"session_id": session_id},
                    ).scalar_one()
                    == 0
                )
    finally:
        first.close()
        second.close()
        _purge(pg_engine, session_id)
        _purge(pg_engine, active_id)
