"""Smoke test for the health endpoint (no database required)."""

from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
