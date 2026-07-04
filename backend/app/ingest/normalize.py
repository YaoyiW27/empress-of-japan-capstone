"""Stage 2 — Normalize & map (ingest-pipeline §5).

Apply the column-fate mapping (schema §6b): keep only the curated metadata
subset, hold the EMBED fields for chunking, normalize the vessel key into
ship/era, derive material_type, and compute content_hash for idempotency.
"""

from __future__ import annotations

import hashlib
import json

from app.ingest import classified, mappings
from app.ingest.parse import strip_markup
from app.ingest.records import IngestDoc
from app.models import Era, Ship, SourceType

# Stable label per EMBED column, used as the chunk's composed-part order/key.
_EMBED_LABELS = {
    mappings.COL_TITLES: "title",
    mappings.COL_DESCRIPTION: "description",
    mappings.COL_HISTORY_OF_USE: "history_of_use",
    mappings.COL_MAKER_NOTE: "maker_note",
}

_CLASSIFIED_MATERIAL_TYPES = {
    "accommodation / deck plan": "deck_plan",
    "brochure / cruise promo": "brochure",
    "clock": "clock",
    "daily program": "daily_program",
    "lighting": "lighting",
    "menu": "menu",
    "model": "model",
    "other / object": "other_object",
    "painting": "painting",
    "passenger list": "passenger_list",
    "photograph": "photograph",
    "register": "register",
    "route map": "route_map",
    "voyage calculations": "voyage_calculations",
    "voyage log": "voyage_log",
    "voyage record (misc)": "voyage_record",
    "weather record": "weather_record",
}


def _content_hash(payload: dict) -> str:
    """Deterministic hash over normalized content (order-independent)."""
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _ship_from_classification(value: str | None) -> Ship | None:
    text = (value or "").lower()
    if "japan (ii)" in text:
        return Ship.ship_ii
    if "japan (i)" in text:
        return Ship.ship_i
    if "undetermined" in text:
        return Ship.undetermined
    if "other" in text:
        return Ship.other
    return None


def _era_from_name_on_item(value: str | None) -> Era | None:
    text = (value or "").lower()
    if "scotland era" in text:
        return Era.empress_of_scotland
    if "hanseatic" in text:
        return Era.hanseatic
    if "japan era" in text:
        return Era.empress_of_japan
    if "name not in title" in text:
        return Era.na
    return None


def _canonical_material_type(value: str | None) -> str | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    if text in _CLASSIFIED_MATERIAL_TYPES:
        return _CLASSIFIED_MATERIAL_TYPES[text]
    return (
        text.replace(" / ", "_")
        .replace("/", "_")
        .replace("-", "_")
        .replace(" ", "_")
        .replace("__", "_")
    )


def _apply_classified_enrichment(doc: IngestDoc, classified_row: dict[str, str]) -> None:
    ship = _ship_from_classification(classified_row.get(classified.COL_SHIP_CLASSIFICATION))
    era = _era_from_name_on_item(classified_row.get(classified.COL_NAME_ON_ITEM_ERA))
    material_type = _canonical_material_type(classified_row.get(classified.COL_MATERIAL_TYPE))

    if ship is not None:
        doc.ship = ship
    if era is not None:
        doc.era = era
    if material_type:
        doc.material_type = material_type

    enrichment_metadata = {
        "classified_ship": strip_markup(classified_row.get(classified.COL_SHIP_CLASSIFICATION)),
        "classified_material_type": strip_markup(classified_row.get(classified.COL_MATERIAL_TYPE)),
        "classified_name_on_item_era": strip_markup(
            classified_row.get(classified.COL_NAME_ON_ITEM_ERA)
        ),
        "classified_match_basis": strip_markup(classified_row.get(classified.COL_MATCH_BASIS)),
        "classified_title_readable": strip_markup(
            classified_row.get(classified.COL_TITLE_READABLE)
        ),
    }
    doc.metadata.update({k: v for k, v in enrichment_metadata.items() if v})


def normalize_vmm_row(
    row: dict[str, str],
    source_file: str | None = None,
    classified_row: dict[str, str] | None = None,
) -> IngestDoc:
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
    if classified_row:
        _apply_classified_enrichment(doc, classified_row)

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
            "metadata": {
                **doc.metadata,
                **{a: getattr(doc, a) for a in mappings.META_COLUMN_TO_ATTR.values()},
            },
        }
    )
    return doc
