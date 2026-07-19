"""Unit tests for session-memory configuration and cleanup behavior."""

import asyncio

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.config import Settings
from app.session_memory import run_cleanup_loop


class FlakyCleanupBackend:
    def __init__(self) -> None:
        self.checkpointer = MemorySaver()
        self.calls = 0

    def open(self) -> None:
        pass

    def close(self) -> None:
        pass

    def refresh(self, session_id: str) -> bool:
        return False

    def cleanup_expired(self) -> int:
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError("temporary database error")
        return 2


def test_session_memory_defaults_and_psycopg_conninfo() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql://app:secret@db.example:5432/empress",
    )

    assert settings.session_memory_ttl_seconds == 1800
    assert settings.session_cleanup_interval_seconds == 60
    assert settings.session_cleanup_batch_size == 100
    assert settings.psycopg_conninfo == "postgresql://app:secret@db.example:5432/empress"


@pytest.mark.parametrize(
    "field",
    [
        "session_memory_ttl_seconds",
        "session_cleanup_interval_seconds",
        "session_cleanup_batch_size",
    ],
)
def test_session_memory_settings_must_be_positive(field: str) -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, **{field: 0})


def test_cleanup_loop_continues_after_failed_batch() -> None:
    backend = FlakyCleanupBackend()
    sleeps = 0

    async def immediate_sleep(_seconds: float) -> None:
        nonlocal sleeps
        sleeps += 1
        if sleeps == 3:
            raise asyncio.CancelledError

    async def run() -> None:
        with pytest.raises(asyncio.CancelledError):
            await run_cleanup_loop(backend, 60, sleep=immediate_sleep)

    asyncio.run(run())
    assert backend.calls == 2
