"""Tests for issue #30 retrieval service and endpoint."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.main import create_app
from app.retrieval import RETRIEVAL_SQL, Citation, RetrievalResponse, build_citation


def test_build_citation_for_vmm_source() -> None:
    citation = build_citation(
        {
            "source_type": "vmm_catalogue",
            "title": "Dinner menu",
            "source_field": "composed",
            "object_identifier": "1999.001",
            "public_url": "https://vmmcollections.com/Detail/objects/1",
            "author_publisher": None,
            "source_url": None,
            "license": None,
        }
    )

    assert citation == Citation(
        source_type="vmm_catalogue",
        title="Dinner menu",
        source_field="composed",
        object_identifier="1999.001",
        public_url="https://vmmcollections.com/Detail/objects/1",
    )


def test_build_citation_for_external_source() -> None:
    citation = build_citation(
        {
            "source_type": "external_historical",
            "title": "Empress history",
            "source_field": "body",
            "object_identifier": None,
            "public_url": None,
            "author_publisher": "Wikipedia contributors",
            "source_url": "https://en.wikipedia.org/wiki/Empress_of_Japan_(1929)",
            "license": "CC BY-SA 4.0",
        }
    )

    assert citation == Citation(
        source_type="external_historical",
        title="Empress history",
        source_field="body",
        author_publisher="Wikipedia contributors",
        source_url="https://en.wikipedia.org/wiki/Empress_of_Japan_(1929)",
        license="CC BY-SA 4.0",
    )


def test_retrieval_sql_only_reads_retrievable_chunks_view() -> None:
    normalized = " ".join(RETRIEVAL_SQL.lower().split())

    assert "from retrievable_chunks" in normalized
    assert "join documents" not in normalized
    assert "from documents" not in normalized
    assert "join chunks" not in normalized
    assert "from chunks" not in normalized
    # PostgreSQL cannot infer the type of a nullable bind used first in
    # ``:value IS NULL``. Keep both optional filters explicitly typed so the
    # deployed psycopg path works when no filters are supplied.
    assert "cast(:ship as ship_enum) is null" in normalized
    assert "cast(:material_type as text) is null" in normalized


class StubRetriever:
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


def _retrieval_test_client() -> TestClient:
    app = create_app(Settings(), retriever=StubRetriever())
    app.dependency_overrides[get_db] = lambda: object()
    return TestClient(app)


def test_retrieve_endpoint_rejects_blank_query() -> None:
    client = _retrieval_test_client()

    resp = client.post("/retrieve", json={"query": "   "})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "query must not be blank"


def test_retrieve_endpoint_rejects_invalid_top_k() -> None:
    client = _retrieval_test_client()

    resp = client.post("/retrieve", json={"query": "menus", "top_k": 21})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "top_k must be between 1 and 20"


def test_retrieve_endpoint_returns_response_shape() -> None:
    client = _retrieval_test_client()

    resp = client.post(
        "/retrieve",
        json={"query": "menus", "top_k": 3, "ship": "ship_ii", "material_type": "menu"},
    )

    assert resp.status_code == 200
    body: dict[str, Any] = resp.json()
    assert body == {"results": []}
