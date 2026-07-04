"""Integration tests for the ingest pipeline against a real Postgres + pgvector.

Skipped automatically when no database is reachable at DATABASE_URL. Run with a
local pgvector container (see backend/README.md). Uses the FakeEmbedder so no
Bedrock/AWS access is required.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.ingest.embed import FakeEmbedder
from app.ingest.pipeline import ingest_external, ingest_vmm
from app.ingest.sources import read_vmm_rows
from app.retrieval import RetrievalService

_BACKEND = Path(__file__).resolve().parents[1]
CSV = _BACKEND.parent / "data" / "export_empress of japan.csv"
SCHEMA = _BACKEND / "db" / "schema.sql"

_DROP = """
DROP VIEW IF EXISTS retrievable_chunks;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS documents;
DROP TYPE IF EXISTS sensitivity_enum;
DROP TYPE IF EXISTS era_enum;
DROP TYPE IF EXISTS ship_enum;
DROP TYPE IF EXISTS source_type_enum;
"""


@pytest.fixture(scope="module")
def engine():
    # Short connect timeout so the suite skips fast in CI when no DB is present.
    eng = create_engine(get_settings().sqlalchemy_url, connect_args={"connect_timeout": 2})
    try:
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("no database reachable at DATABASE_URL")
    with eng.begin() as c:
        c.exec_driver_sql(_DROP)
        c.exec_driver_sql(SCHEMA.read_text(encoding="utf-8"))
    return eng


@pytest.mark.skipif(not CSV.exists(), reason="source CSV not present locally")
def test_vmm_ingest_is_private_and_idempotent(engine):
    emb = FakeEmbedder()

    with Session(engine) as s:
        first = ingest_vmm(s, CSV, emb)
    assert first.errors == 0
    assert first.inserted >= 200  # ~285 rows in the export

    # Re-running is idempotent: everything skips, nothing re-embeds (content_hash).
    with Session(engine) as s:
        second = ingest_vmm(s, CSV, emb)
    assert second.inserted == 0 and second.updated == 0
    assert second.skipped == first.inserted

    # No donor data anywhere in documents/chunks (the zero-tolerance guardrail).
    donor_values = {
        r["Donated by"].strip() for r in read_vmm_rows(CSV) if r.get("Donated by", "").strip()
    }
    with engine.connect() as c:
        doc_blob = " ".join(
            " ".join(str(v) for v in row)
            for row in c.execute(
                text("SELECT title, made_by, exhibitions, metadata::text FROM documents")
            )
        )
        chunk_blob = " ".join(row[0] for row in c.execute(text("SELECT content FROM chunks")))
    haystack = doc_blob + " " + chunk_blob
    for donor in donor_values:
        assert donor not in haystack, f"donor value leaked: {donor!r}"

    # Spot-check the retrieval surface returns public catalogue content.
    with engine.connect() as c:
        retrievable = c.execute(text("SELECT count(*) FROM retrievable_chunks")).scalar()
        passengers_hidden = c.execute(
            text(
                "SELECT count(*) FROM retrievable_chunks WHERE document_id IN "
                "(SELECT id FROM documents WHERE sensitivity = 'passenger_archival')"
            )
        ).scalar()
    assert retrievable > 0
    assert passengers_hidden == 0  # passenger rows are NULL-dated → fail-closed


def test_external_ingest_lands_in_retrieval_view(engine, tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text(
        '[{"title": "Empress liner history", "wikipedia_title": "Empress of Japan (1929)",'
        ' "license": "CC BY-SA 4.0", "ship": "ship_ii", "era": "empress_of_japan"}]',
        encoding="utf-8",
    )
    emb = FakeEmbedder()
    with Session(engine) as s:
        stats = ingest_external(
            s, manifest, emb, wikipedia_fetcher=lambda t: f"Historical article about {t}. " * 50
        )
    assert stats.errors == 0 and stats.inserted == 1 and stats.chunks_embedded >= 1

    with engine.connect() as c:
        row = c.execute(
            text(
                "SELECT source_type, license, author_publisher FROM retrievable_chunks "
                "WHERE source_type = 'external_historical' LIMIT 1"
            )
        ).first()
    assert row is not None and row.license == "CC BY-SA 4.0"


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{x:.9g}" for x in vector) + "]"


def _insert_doc_with_chunk(
    conn,
    *,
    title: str,
    object_identifier: str,
    content: str,
    content_hash: str,
    embedding: str,
    ship: str,
    material_type: str,
    sensitivity: str = "public",
    in_scope: bool = True,
) -> None:
    document_id = conn.execute(
        text(
            """
            INSERT INTO documents (
                source_type,
                title,
                object_identifier,
                public_url,
                content_hash,
                ship,
                era,
                material_type,
                sensitivity,
                in_scope
            )
            VALUES (
                'vmm_catalogue',
                :title,
                :object_identifier,
                :public_url,
                :content_hash,
                CAST(:ship AS ship_enum),
                'na',
                :material_type,
                CAST(:sensitivity AS sensitivity_enum),
                :in_scope
            )
            RETURNING id
            """
        ),
        {
            "title": title,
            "object_identifier": object_identifier,
            "public_url": f"https://vmmcollections.com/Detail/objects/{object_identifier}",
            "content_hash": content_hash,
            "ship": ship,
            "material_type": material_type,
            "sensitivity": sensitivity,
            "in_scope": in_scope,
        },
    ).scalar_one()
    conn.execute(
        text(
            """
            INSERT INTO chunks (
                document_id,
                chunk_index,
                source_field,
                content,
                embedding,
                embedding_model
            )
            VALUES (
                :document_id,
                0,
                'composed',
                :content,
                CAST(:embedding AS vector),
                'fake-embed-v1-1024d'
            )
            """
        ),
        {"document_id": document_id, "content": content, "embedding": embedding},
    )


def test_retrieval_uses_view_privacy_gate_and_filters(engine):
    embedder = FakeEmbedder()
    [query_embedding] = embedder.embed(["retrieval privacy query"])
    vector = _vector_literal(query_embedding)

    with engine.begin() as c:
        c.execute(text("DELETE FROM documents"))
        _insert_doc_with_chunk(
            c,
            title="Public menu",
            object_identifier="RET-1",
            content="Public menu content.",
            content_hash="ret-public-menu",
            embedding=vector,
            ship="ship_ii",
            material_type="menu",
        )
        _insert_doc_with_chunk(
            c,
            title="Public model",
            object_identifier="RET-2",
            content="Public model content.",
            content_hash="ret-public-model",
            embedding=vector,
            ship="ship_i",
            material_type="model",
        )
        _insert_doc_with_chunk(
            c,
            title="Out of scope",
            object_identifier="RET-3",
            content="Out-of-scope content should not appear.",
            content_hash="ret-out-of-scope",
            embedding=vector,
            ship="other",
            material_type="menu",
            in_scope=False,
        )
        _insert_doc_with_chunk(
            c,
            title="Gated passenger list",
            object_identifier="RET-4",
            content="Passenger archival content should not appear.",
            content_hash="ret-passenger",
            embedding=vector,
            ship="ship_ii",
            material_type="passenger_list",
            sensitivity="passenger_archival",
        )

    service = RetrievalService(embedder)
    with Session(engine) as s:
        all_results = service.retrieve(s, "retrieval privacy query", top_k=10)
        menu_results = service.retrieve(
            s, "retrieval privacy query", top_k=10, material_type="menu"
        )
        ship_i_results = service.retrieve(s, "retrieval privacy query", top_k=10, ship="ship_i")

    all_titles = {r.metadata["title"] for r in all_results.results}
    assert all_titles == {"Public menu", "Public model"}
    assert {r.metadata["title"] for r in menu_results.results} == {"Public menu"}
    assert {r.metadata["title"] for r in ship_i_results.results} == {"Public model"}
