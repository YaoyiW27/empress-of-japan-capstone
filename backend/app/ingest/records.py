"""Intermediate data structures passed between pipeline stages."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import Era, Sensitivity, Ship, SourceType


@dataclass
class ChunkText:
    """A piece of text to embed, with its provenance field."""

    content: str
    source_field: str
    chunk_index: int = 0


@dataclass
class IngestDoc:
    """A normalized, privacy-filtered document ready to chunk, embed, and upsert.

    Mirrors the writable columns of ``documents`` (schema §6) plus the chunk
    texts. Sensitive columns (donor/valuation) have no field here by design.
    """

    source_type: SourceType
    title: str
    content_hash: str
    chunks: list[ChunkText] = field(default_factory=list)

    # EMBED-field texts held between normalize → privacy (redaction) → chunk.
    # For VMM these are the composed-chunk parts; for external, the body text.
    embed_fields: dict[str, str] = field(default_factory=dict)

    # Provenance
    object_identifier: str | None = None
    source_url: str | None = None
    public_url: str | None = None
    author_publisher: str | None = None
    license: str | None = None
    source_file: str | None = None
    metadata: dict = field(default_factory=dict)

    # Filterable VMM metadata
    ship: Ship | None = None
    era: Era | None = None
    material_type: str | None = None
    category: str | None = None
    object_type: str | None = None
    materials: str | None = None
    measurements: str | None = None
    place_made: str | None = None
    made_by: str | None = None
    previous_numbers: str | None = None
    exhibitions: str | None = None

    # Gating
    sensitivity: Sensitivity = Sensitivity.public
    voyage_date: object | None = None  # datetime.date | None (NULL until enriched)
    in_scope: bool = True

    def dedupe_key(self) -> str:
        """Stable identity for idempotent upsert (schema §9)."""
        if self.object_identifier:
            return f"oid:{self.object_identifier}"
        if self.source_url:
            return f"url:{self.source_url}"
        return f"hash:{self.content_hash}"
