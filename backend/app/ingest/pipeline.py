"""Pipeline orchestration + run KPIs (ingest-pipeline §10).

Wires the six stages, applies row-level error handling (one bad row never aborts
the batch), and emits counts/KPIs per run. OTel → Honeycomb/CloudWatch export is
an infra-track follow-up; this logs structured counts in the meantime.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from opentelemetry import trace
from sqlalchemy.orm import Session

from app.ingest.chunk import chunk_external_doc, compose_vmm_chunk
from app.ingest.embed import Embedder
from app.ingest.normalize import normalize_vmm_row
from app.ingest.privacy import DonorRedactor, apply_privacy
from app.ingest.records import IngestDoc
from app.ingest.sources import (
    build_external_doc,
    fetch_wikipedia_extract,
    load_external_entries,
    read_vmm_rows,
)
from app.ingest.upsert import upsert_document

log = logging.getLogger("ingest")
tracer = trace.get_tracer(__name__)


@dataclass
class IngestStats:
    rows_in: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    out_of_scope: int = 0
    chunks_embedded: int = 0
    redactions: int = 0
    errors: int = 0
    per_ship: Counter = field(default_factory=Counter)

    def summary(self) -> str:
        ship = ", ".join(f"{k}={v}" for k, v in sorted(self.per_ship.items())) or "—"
        return (
            f"rows_in={self.rows_in} inserted={self.inserted} updated={self.updated} "
            f"skipped={self.skipped} out_of_scope={self.out_of_scope} "
            f"chunks_embedded={self.chunks_embedded} redactions={self.redactions} "
            f"errors={self.errors} | per_ship: {ship}"
        )


def _record(stats: IngestStats, doc: IngestDoc, status: str, chunks: int) -> None:
    stats.chunks_embedded += chunks
    if status == "inserted":
        stats.inserted += 1
    elif status == "updated":
        stats.updated += 1
    elif status == "skipped":
        stats.skipped += 1
    if not doc.in_scope:
        stats.out_of_scope += 1
    if doc.ship is not None:
        stats.per_ship[doc.ship.value] += 1


def ingest_vmm(
    session: Session,
    csv_path: str | Path,
    embedder: Embedder,
    *,
    extra_blocklist_path: str | None = None,
    stats: IngestStats | None = None,
) -> IngestStats:
    """Ingest the VMM catalogue CSV (stages 1–6)."""
    with tracer.start_as_current_span("ingest.vmm") as span:
        span.set_attribute("ingest.source", str(csv_path))
        stats = stats or IngestStats()
        rows = read_vmm_rows(csv_path)
        span.set_attribute("ingest.rows_loaded", len(rows))
        redactor = DonorRedactor.from_donor_values(
            (r.get("Donated by", "") for r in rows), extra_blocklist_path
        )
        source_file = Path(csv_path).name

        for i, row in enumerate(rows):
            stats.rows_in += 1
            try:
                with tracer.start_as_current_span("ingest.vmm.row") as row_span:
                    row_span.set_attribute("ingest.row_index", i)
                    row_span.set_attribute(
                        "ingest.object_identifier", row.get("Object identifier", "")
                    )
                    doc = normalize_vmm_row(row, source_file=source_file)
                    stats.redactions += apply_privacy(doc, redactor)
                    compose_vmm_chunk(doc)
                    row_span.set_attribute("ingest.chunk_count", len(doc.chunks))
                    result = upsert_document(session, doc, embedder)
                    row_span.set_attribute("ingest.upsert_status", result.status)
                    _record(stats, doc, result.status, result.chunks_embedded)
            except Exception:
                stats.errors += 1
                log.exception("row %d (%s) failed — skipping", i, row.get("Object identifier", "?"))
        span.set_attribute("ingest.errors", stats.errors)
        span.set_attribute("ingest.chunks_embedded", stats.chunks_embedded)
        return stats


def ingest_external(
    session: Session,
    manifest_path: str | Path,
    embedder: Embedder,
    *,
    wikipedia_fetcher: Callable[[str], str] = fetch_wikipedia_extract,
    stats: IngestStats | None = None,
) -> IngestStats:
    """Ingest external-historical sources from a manifest (stages 4–6)."""
    with tracer.start_as_current_span("ingest.external") as span:
        span.set_attribute("ingest.source", str(manifest_path))
        stats = stats or IngestStats()
        # External text carries no VMM donor context — use an empty donor blocklist
        # to avoid over-redacting unrelated names in third-party prose.
        redactor = DonorRedactor([])
        source_file = str(manifest_path)

        # Build each doc inside the try so a failed fetch (e.g. network/403) skips
        # that one source instead of aborting the whole batch (ingest-pipeline §10).
        entries = load_external_entries(manifest_path)
        span.set_attribute("ingest.rows_loaded", len(entries))
        for i, entry in enumerate(entries):
            stats.rows_in += 1
            try:
                with tracer.start_as_current_span("ingest.external.row") as row_span:
                    row_span.set_attribute("ingest.row_index", i)
                    row_span.set_attribute("ingest.title", entry.get("title", ""))
                    doc = build_external_doc(
                        entry, source_file=source_file, wikipedia_fetcher=wikipedia_fetcher
                    )
                    stats.redactions += apply_privacy(doc, redactor)
                    chunk_external_doc(doc)
                    row_span.set_attribute("ingest.chunk_count", len(doc.chunks))
                    result = upsert_document(session, doc, embedder)
                    row_span.set_attribute("ingest.upsert_status", result.status)
                    _record(stats, doc, result.status, result.chunks_embedded)
            except Exception:
                stats.errors += 1
                log.exception("external source %r failed — skipping", entry.get("title", "?"))
        span.set_attribute("ingest.errors", stats.errors)
        span.set_attribute("ingest.chunks_embedded", stats.chunks_embedded)
        return stats
