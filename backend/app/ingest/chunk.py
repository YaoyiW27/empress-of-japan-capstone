"""Stage 4 — Chunk & compose (ingest-pipeline §7; schema §7).

VMM catalogue object → one composed chunk (narrative fields are too sparse to
chunk individually). External/long docs → windowed chunks with overlap.
"""

from __future__ import annotations

from app.ingest.records import ChunkText, IngestDoc

# Order the composed VMM chunk concatenates its parts in (schema §7).
_COMPOSE_ORDER = ("title", "description", "history_of_use", "maker_note")


def compose_vmm_chunk(doc: IngestDoc) -> None:
    """Build the single composed chunk for a VMM object (in-place)."""
    parts = [doc.embed_fields[label] for label in _COMPOSE_ORDER if label in doc.embed_fields]
    text = "\n\n".join(parts).strip()
    if text:
        doc.chunks = [ChunkText(content=text, source_field="composed", chunk_index=0)]
    else:  # no narrative content → metadata-only document, no chunk row (§7)
        doc.chunks = []


def window_chunks(text: str, *, window_words: int = 400, overlap_words: int = 50) -> list[str]:
    """Split long body text into overlapping word windows (~512-token target)."""
    words = text.split()
    if not words:
        return []
    if len(words) <= window_words:
        return [" ".join(words)]
    step = max(1, window_words - overlap_words)
    windows = []
    for start in range(0, len(words), step):
        windows.append(" ".join(words[start : start + window_words]))
        if start + window_words >= len(words):
            break
    return windows


def chunk_external_doc(doc: IngestDoc, **window_kwargs: int) -> None:
    """Window an external document's body text into chunks (in-place)."""
    body = doc.embed_fields.get("body", "")
    doc.chunks = [
        ChunkText(content=w, source_field="body", chunk_index=i)
        for i, w in enumerate(window_chunks(body, **window_kwargs))
    ]
