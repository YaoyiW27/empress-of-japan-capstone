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
from app.db_credentials import DbCredentialProvider, conninfo_factory

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

    def __init__(
        self,
        settings: Settings,
        engine: Engine,
        credential_provider: DbCredentialProvider | None = None,
    ) -> None:
        self._engine = engine
        self._ttl_seconds = settings.session_memory_ttl_seconds
        self._cleanup_batch_size = settings.session_cleanup_batch_size
        # This pool is a second, independent credential path: it does not go
        # through app.db's engine, so the do_connect hook there does not cover
        # it. psycopg-pool >= 3.3 resolves a callable conninfo on every new
        # physical connection, so a rotated password is picked up without a
        # restart (#198). Falls back to the plain string when no secret ARN is
        # configured.
        conninfo = (
            conninfo_factory(settings, credential_provider)
            if credential_provider is not None
            else settings.psycopg_conninfo
        )
        self._pool = ConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=10,
            open=False,
            # The pool keeps a long-lived idle connection (min_size=1). A NAT/firewall
            # idle timeout (AWS NAT Gateway drops idle TCP after 350s) or an RDS
            # stop/start silently kills it without an RST, so the next checkpoint
            # write reuses a dead socket. Without the guards below that reuse hangs on
            # TCP retransmission for minutes before failing (observed ~4m /chat, then a
            # 503) instead of surfacing quickly. So:
            #   - connect_timeout caps every (re)connect the way app.db already does;
            #   - check validates a connection before it leaves the pool, recycling
            #     dead ones instead of handing them out;
            #   - max_idle/max_lifetime retire connections before NAT can reap them,
            #     removing the trigger at the source;
            #   - timeout bounds how long a caller waits for a connection so an
            #     exhausted or unreachable pool fails fast (main.chat maps PoolTimeout
            #     to a 503) rather than stacking the request behind a stalled connect.
            timeout=10.0,
            max_idle=180.0,
            max_lifetime=1800.0,
            check=ConnectionPool.check_connection,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
                "connect_timeout": 5,
            },
        )
        self._checkpointer = PostgresSaver(self._pool)

    @property
    def checkpointer(self) -> PostgresSaver:
        return self._checkpointer

    def open(self) -> None:
        self._pool.open(wait=True)
        # The application-owned expiry migration must be present before the
        # service accepts traffic; do not silently start with partial memory.
        with self._engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM agent_sessions LIMIT 1"))
        self._run_checkpointer_setup()

    def _run_checkpointer_setup(self) -> None:
        # PostgresSaver.setup() issues CREATE INDEX CONCURRENTLY, which blocks
        # until every concurrent transaction finishes. It must therefore run
        # with NO long-lived transaction open on this instance — running it
        # inside a pg_advisory_xact_lock txn self-deadlocks (the index build
        # waits on the very transaction holding the lock). All API instances
        # still serialize package-owned migrations with a *session-level*
        # advisory lock on a dedicated autocommit connection so they cannot
        # race during a rolling deployment.
        conn = self._engine.connect().execution_options(isolation_level="AUTOCOMMIT")
        try:
            conn.execute(
                text("SELECT pg_advisory_lock(hashtext(:lock_name))"),
                {"lock_name": _SETUP_LOCK_NAME},
            )
            try:
                self._checkpointer.setup()
            finally:
                conn.execute(
                    text("SELECT pg_advisory_unlock(hashtext(:lock_name))"),
                    {"lock_name": _SETUP_LOCK_NAME},
                )
        finally:
            conn.close()

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
