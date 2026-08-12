"""Smoke tests for the health endpoints (no database required)."""

from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.main import app


def test_health() -> None:
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


class StubEngine:
    """Minimal stand-in for the module-level SQLAlchemy engine.

    /health/db reaches for `app.main.engine` directly rather than through a
    dependency, so it is monkeypatched rather than overridden.
    """

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    @contextmanager
    def connect(self):
        if self.error is not None:
            raise self.error
        yield self

    def execute(self, *args, **kwargs):
        return None


def test_health_db_reports_reachable(monkeypatch) -> None:
    monkeypatch.setattr("app.main.engine", StubEngine())

    resp = TestClient(app).get("/health/db")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "reachable"}


def test_health_db_returns_503_when_the_database_is_down(monkeypatch) -> None:
    """A dead database is a 503 with a detail, not a 500 traceback."""
    error = OperationalError("SELECT 1", {}, Exception("connection refused"))
    monkeypatch.setattr("app.main.engine", StubEngine(error))

    resp = TestClient(app).get("/health/db")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unavailable"
    assert body["database"] == "unreachable"
    assert "connection refused" in body["detail"]
