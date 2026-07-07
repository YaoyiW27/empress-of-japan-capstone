"""Stage 6 — Upsert into pgvector (ingest-pipeline §9; schema §9).

Idempotent on content_hash; re-embeds when the target model changes; each
document's writes are wrapped in their own transaction so a failure leaves no
partial document.
"""

from __future__ import annotations

from dataclasses import dataclass

from opentelemetry import trace
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingest.embed import Embedder
from app.ingest.records import IngestDoc
from app.models import Chunk, Document, SourceType

tracer = trace.get_tracer(__name__)

# documents columns populated from an IngestDoc (sensitive columns absent).
_DOC_ATTRS = (
    "source_type",
    "title",
    "object_identifier",
    "source_url",
    "public_url",
    "author_publisher",
    "license",
    "source_file",
    "ship",
    "era",
    "material_type",
    "category",
    "object_type",
    "materials",
    "measurements",
    "place_made",
    "made_by",
    "previous_numbers",
    "exhibitions",
    "sensitivity",
    "voyage_date",
    "in_scope",
    "content_hash",
)


@dataclass
class UpsertResult:
    status: str  # "inserted" | "updated" | "skipped"
    chunks_embedded: int = 0


def _find_existing(session: Session, doc: IngestDoc) -> Document | None:
    with tracer.start_as_current_span("db.document.lookup"):
        if doc.object_identifier:
            stmt = select(Document).where(Document.object_identifier == doc.object_identifier)
        elif doc.source_url:
            stmt = select(Document).where(
                Document.source_url == doc.source_url,
                Document.title == doc.title,
                Document.source_type == SourceType.external_historical,
            )
        else:
            stmt = select(Document).where(Document.content_hash == doc.content_hash)
        return session.scalars(stmt).first()


def _apply_doc_fields(row: Document, doc: IngestDoc) -> None:
    for attr in _DOC_ATTRS:
        setattr(row, attr, getattr(doc, attr))
    row.metadata_ = doc.metadata or {}


def _embed_and_attach(row: Document, doc: IngestDoc, embedder: Embedder) -> int:
    if not doc.chunks:
        return 0
    with tracer.start_as_current_span("db.document.embed_chunks") as span:
        span.set_attribute("db.chunk_count", len(doc.chunks))
        span.set_attribute("embed.model_id", embedder.model_id)
        vectors = embedder.embed([c.content for c in doc.chunks])
        for chunk, vec in zip(doc.chunks, vectors, strict=True):
            row.chunks.append(
                Chunk(
                    chunk_index=chunk.chunk_index,
                    source_field=chunk.source_field,
                    content=chunk.content,
                    embedding=vec,
                    embedding_model=embedder.model_id,
                    token_count=len(chunk.content.split()),
                )
            )
        return len(doc.chunks)


def upsert_document(session: Session, doc: IngestDoc, embedder: Embedder) -> UpsertResult:
    """Insert/update a document + its chunks idempotently, in one transaction."""
    with tracer.start_as_current_span("db.document.upsert") as span:
        span.set_attribute("db.document.source_type", str(doc.source_type.value))
        span.set_attribute("db.document.in_scope", doc.in_scope)
        try:
            existing = _find_existing(session, doc)

            if existing is not None:
                current_model = existing.chunks[0].embedding_model if existing.chunks else None
                unchanged = existing.content_hash == doc.content_hash
                same_model = current_model == embedder.model_id or not doc.chunks
                if unchanged and same_model:
                    session.rollback()
                    span.set_attribute("db.document.upsert_status", "skipped")
                    return UpsertResult(status="skipped")
                # Changed content or model swap → replace chunks (cascade delete).
                existing.chunks.clear()
                session.flush()
                _apply_doc_fields(existing, doc)
                n = _embed_and_attach(existing, doc, embedder)
                session.commit()
                span.set_attribute("db.document.upsert_status", "updated")
                return UpsertResult(status="updated", chunks_embedded=n)

            row = Document()
            _apply_doc_fields(row, doc)
            session.add(row)
            n = _embed_and_attach(row, doc, embedder)
            session.commit()
            span.set_attribute("db.document.upsert_status", "inserted")
            return UpsertResult(status="inserted", chunks_embedded=n)
        except Exception:
            session.rollback()
            raise
