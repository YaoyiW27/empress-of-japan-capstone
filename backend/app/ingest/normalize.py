"""Stage 2 — Normalize & map (ingest-pipeline §5).

Apply the column-fate mapping (schema §6b): keep only the curated metadata
subset, hold the EMBED fields for chunking, normalize the vessel key into
ship/era, derive material_type, and compute content_hash for idempotency.
"""

from __future__ import annotations

import hashlib
import json

from app.ingest import mappings
from app.ingest.parse import strip_markup
from app.ingest.records import IngestDoc
from app.models import SourceType

# Stable label per EMBED column, used as the chunk's composed-part order/key.
_EMBED_LABELS = {
    mappings.COL_TITLES: "title",
    mappings.COL_DESCRIPTION: "description",
    mappings.COL_HISTORY_OF_USE: "history_of_use",
    mappings.COL_MAKER_NOTE: "maker_note",
}


def _content_hash(payload: dict) -> str:
    """Deterministic hash over normalized content (order-independent)."""
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def normalize_vmm_row(row: dict[str, str], source_file: str | None = None) -> IngestDoc:
    """Turn a raw VMM CSV row into a normalized IngestDoc (pre-redaction).

    Donor/valuation/internal columns are simply never read here — privacy by
    omission (schema §4). The privacy stage redacts the free-text values this
    function carries and sets the gating fields.
    """
    title = strip_markup(row.get(mappings.COL_TITLES)) or "(untitled)"

    doc = IngestDoc(
        source_type=SourceType.vmm_catalogue,
        title=title,
        content_hash="",  # filled below
        source_file=source_file,
    )

    # Filterable metadata (markup-stripped).
    for col, attr in mappings.META_COLUMN_TO_ATTR.items():
        setattr(doc, attr, strip_markup(row.get(col)))

    # Vessel → ship/era (schema §8); material_type (audit §3).
    doc.ship, doc.era = mappings.map_vessel_to_ship_era(row.get(mappings.COL_VESSEL))
    doc.material_type = mappings.derive_material_type(title, doc.object_type, doc.category)

    # EMBED fields held for the chunk stage (markup-stripped, non-empty).
    for col, label in _EMBED_LABELS.items():
        text = strip_markup(row.get(col))
        if text:
            doc.embed_fields[label] = text

    # Hash over the normalized source content that actually lands.
    doc.content_hash = _content_hash(
        {
            "object_identifier": doc.object_identifier,
            "title": title,
            "embed_fields": doc.embed_fields,
            "ship": doc.ship.value if doc.ship else None,
            "era": doc.era.value if doc.era else None,
            "material_type": doc.material_type,
            "metadata": {a: getattr(doc, a) for a in mappings.META_COLUMN_TO_ATTR.values()},
        }
    )
    return doc
