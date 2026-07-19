"""Postgres-backed LangGraph session memory and sliding-expiry cleanup."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from langgraph.checkpoint.postgres import PostgresSaver
from opentelemetry import trace
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from sqlalchemy import Engine, text

from app.config import Settings

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

_SETUP_LOCK_NAME = "empress-langgraph-checkpointer-setup"


class SessionMemoryBackend(Protocol):
    """Lifecycle and expiry operations required by the chat application."""

    @property
    def checkpointer(self): ...

    def open(self) -> None: ...

    def close(self) -> None: ...

    def refresh(self, session_id: str) -> bool:
        """Refresh a session and return whether expired memory was removed."""
        ...

    def cleanup_expired(self) -> int: ...


class PostgresSessionMemory:
    """Own a pooled PostgresSaver plus session expiry metadata."""

    def __init__(self, settings: Settings, engine: Engine) -> None:
        self._engine = engine
        self._ttl_seconds = settings.session_memory_ttl_seconds
        self._cleanup_batch_size = settings.session_cleanup_batch_size
        self._pool = ConnectionPool(
            conninfo=settings.psycopg_conninfo,
            min_size=1,
            max_size=10,
            open=False,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
        )
        self._checkpointer = PostgresSaver(self._pool)

    @property
    def checkpointer(self) -> PostgresSaver:
        return self._checkpointer

    def open(self) -> None:
        self._pool.open(wait=True)
        # All API instances use the same advisory lock so package-owned migrations
        # cannot race during a rolling deployment.
        with self._engine.begin() as conn:
            # The application-owned expiry migration must be present before the
            # service accepts traffic; do not silently start with partial memory.
            conn.execute(text("SELECT 1 FROM agent_sessions LIMIT 1"))
            conn.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
                {"lock_name": _SETUP_LOCK_NAME},
            )
            self._checkpointer.setup()

    def close(self) -> None:
        self._pool.close()

    def refresh(self, session_id: str) -> bool:
        """Apply sliding TTL, clearing old checkpoints before an expired ID is reused."""
        expired = False
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                    SELECT expires_at <= now() AS expired
                    FROM agent_sessions
                    WHERE session_id = :session_id
                    FOR UPDATE
                    """
                    ),
                    {"session_id": session_id},
                )
                .mappings()
                .one_or_none()
            )
            if row is not None and row["expired"]:
                self._checkpointer.delete_thread(session_id)
                expired = True
            conn.execute(
                text(
                    """
                    INSERT INTO agent_sessions (session_id, last_active_at, expires_at)
                    VALUES (
                        :session_id,
                        now(),
                        now() + make_interval(secs => :ttl_seconds)
                    )
                    ON CONFLICT (session_id) DO UPDATE
                    SET last_active_at = EXCLUDED.last_active_at,
                        expires_at = EXCLUDED.expires_at
                    """
                ),
                {"session_id": session_id, "ttl_seconds": self._ttl_seconds},
            )
        return expired

    def cleanup_expired(self) -> int:
        """Delete one locked batch of expired threads and their metadata."""
        with self._engine.begin() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                    SELECT session_id
                    FROM agent_sessions
                    WHERE expires_at <= now()
                    ORDER BY expires_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT :batch_size
                    """
                    ),
                    {"batch_size": self._cleanup_batch_size},
                )
                .scalars()
                .all()
            )
            for session_id in rows:
                self._checkpointer.delete_thread(session_id)
            if rows:
                conn.execute(
                    text("DELETE FROM agent_sessions WHERE session_id = ANY(:session_ids)"),
                    {"session_ids": rows},
                )
        return len(rows)


async def run_cleanup_loop(
    backend: SessionMemoryBackend,
    interval_seconds: int,
    *,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Continuously clean expired sessions without exposing visitor identifiers."""
    while True:
        await sleep(interval_seconds)
        try:
            with tracer.start_as_current_span("session_memory.cleanup") as span:
                deleted = await asyncio.to_thread(backend.cleanup_expired)
                span.set_attribute("session_memory.deleted_count", deleted)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("session memory cleanup batch failed")
