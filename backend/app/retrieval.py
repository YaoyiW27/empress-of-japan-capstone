"""RAG retrieval over the privacy-gated ``retrievable_chunks`` view.

Issue #30 intentionally exposes retrieval as a backend capability without wiring
it into the chat graph yet. The SQL in this module must only read from
``retrievable_chunks`` so the database view remains the privacy/scope gate.
"""

from __future__ import annotations

from typing import Any, Protocol

from opentelemetry import trace
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ingest.embed import Embedder
from app.models import SourceType

tracer = trace.get_tracer(__name__)

MAX_TOP_K = 20
DEFAULT_TOP_K = 5

RETRIEVAL_SQL = """
SELECT
    chunk_id,
    document_id,
    content,
    source_field,
    source_type,
    title,
    ship,
    era,
    material_type,
    object_identifier,
    public_url,
    source_url,
    author_publisher,
    license,
    embedding <=> CAST(:query_embedding AS vector) AS distance
FROM retrievable_chunks
WHERE (CAST(:ship AS ship_enum) IS NULL OR ship = CAST(:ship AS ship_enum))
  AND (CAST(:material_type AS text) IS NULL OR material_type = CAST(:material_type AS text))
ORDER BY embedding <=> CAST(:query_embedding AS vector)
LIMIT :top_k
"""


class Citation(BaseModel):
    source_type: str
    title: str
    source_field: str
    object_identifier: str | None = None
    public_url: str | None = None
    author_publisher: str | None = None
    source_url: str | None = None
    license: str | None = None


class RetrievedChunk(BaseModel):
    chunk_id: int
    document_id: int
    content: str
    score: float
    metadata: dict[str, Any]
    citation: Citation


class RetrievalResponse(BaseModel):
    results: list[RetrievedChunk]


class Retriever(Protocol):
    def retrieve(
        self,
        session: Session,
        query: str,
        *,
        top_k: int = DEFAULT_TOP_K,
        ship: str | None = None,
        material_type: str | None = None,
    ) -> RetrievalResponse: ...


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{x:.9g}" for x in vector) + "]"


def build_citation(row: dict[str, Any]) -> Citation:
    source_type = _enum_value(row["source_type"]) or ""
    title = row["title"]
    source_field = row["source_field"]
    if source_type in {SourceType.vmm_catalogue.value, SourceType.vmm_digitized_sample.value}:
        return Citation(
            source_type=source_type,
            title=title,
            source_field=source_field,
            object_identifier=row["object_identifier"],
            public_url=row["public_url"],
        )
    return Citation(
        source_type=source_type,
        title=title,
        source_field=source_field,
        author_publisher=row["author_publisher"],
        source_url=row["source_url"],
        license=row["license"],
    )


class RetrievalService:
    def __init__(self, embedder: Embedder) -> None:
        self._embedder = embedder

    def retrieve(
        self,
        session: Session,
        query: str,
        *,
        top_k: int = DEFAULT_TOP_K,
        ship: str | None = None,
        material_type: str | None = None,
    ) -> RetrievalResponse:
        with tracer.start_as_current_span("rag.retrieve") as span:
            span.set_attribute("rag.top_k", top_k)
            span.set_attribute("rag.ship", ship or "")
            span.set_attribute("rag.material_type", material_type or "")
            span.set_attribute("embed.model_id", self._embedder.model_id)
            [query_embedding] = self._embedder.embed([query])
            rows = session.execute(
                text(RETRIEVAL_SQL),
                {
                    "query_embedding": _vector_literal(query_embedding),
                    "top_k": top_k,
                    "ship": ship,
                    "material_type": material_type,
                },
            ).mappings()
            results = [_result_from_row(dict(row)) for row in rows]
            span.set_attribute("rag.result_count", len(results))
            return RetrievalResponse(results=results)


def _result_from_row(row: dict[str, Any]) -> RetrievedChunk:
    distance = float(row["distance"])
    return RetrievedChunk(
        chunk_id=row["chunk_id"],
        document_id=row["document_id"],
        content=row["content"],
        score=1.0 - distance,
        metadata={
            "source_type": _enum_value(row["source_type"]),
            "title": row["title"],
            "ship": _enum_value(row["ship"]),
            "era": _enum_value(row["era"]),
            "material_type": row["material_type"],
            "source_field": row["source_field"],
        },
        citation=build_citation(row),
    )
