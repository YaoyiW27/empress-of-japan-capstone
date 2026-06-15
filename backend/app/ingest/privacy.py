"""Stage 3 — Privacy filter (ingest-pipeline §6; schema §4). The critical stage.

Three mechanisms:
1. Drop, don't tag — donor/valuation/internal columns are never read (handled in
   normalize by omission). This module asserts none leaked.
2. Free-text PII redaction — scrub stray donor names from text before it lands.
   The blocklist is built in-memory from the source donor column (audit §5) and
   is NEVER written to disk or committed.
3. Sensitivity + gating — set sensitivity, in_scope; voyage_date stays NULL
   (no enrichment yet) so passenger rows are excluded fail-closed.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

from app.ingest import mappings
from app.ingest.records import IngestDoc
from app.models import Sensitivity, Ship, SourceType

REDACTION_PLACEHOLDER = "[redacted]"

# Splits a donor cell into candidate names (handles "X and Y", "X; Y", "X & Y").
_NAME_SPLIT_RE = re.compile(r"\s*(?:\band\b|&|;|,|/)\s*", re.IGNORECASE)
# Honorifics/qualifiers that shouldn't themselves be treated as names.
_STOPWORDS = frozenset(
    {"mr", "mrs", "ms", "miss", "dr", "the", "estate", "of", "family", "and", "in", "memory"}
)


class DonorRedactor:
    """Redacts known donor names from free text (defense-in-depth, audit §5)."""

    def __init__(self, names: Iterable[str]) -> None:
        phrases: set[str] = set()
        tokens: set[str] = set()
        for raw in names:
            cleaned = (raw or "").strip()
            if not cleaned:
                continue
            for part in _NAME_SPLIT_RE.split(cleaned):
                part = part.strip(" .")
                if len(part) >= 3 and not part.isdigit():
                    phrases.add(part)
                for tok in re.findall(r"[^\W\d_]+", part, re.UNICODE):
                    if len(tok) >= 4 and tok.lower() not in _STOPWORDS:
                        tokens.add(tok)
        # Longest-first so multi-word names redact before their component tokens.
        terms = sorted(phrases | tokens, key=len, reverse=True)
        if terms:
            alternation = "|".join(re.escape(t) for t in terms)
            self._pattern = re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)
        else:
            self._pattern = None

    @classmethod
    def from_donor_values(
        cls, donor_values: Iterable[str], extra_blocklist_path: str | None = None
    ) -> DonorRedactor:
        names = list(donor_values)
        if extra_blocklist_path:
            p = Path(extra_blocklist_path)
            if p.exists():
                names += [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines()]
        return cls(names)

    def redact(self, text: str | None) -> tuple[str | None, int]:
        if not text or self._pattern is None:
            return text, 0
        new_text, n = self._pattern.subn(REDACTION_PLACEHOLDER, text)
        return new_text, n


def apply_privacy(doc: IngestDoc, redactor: DonorRedactor) -> int:
    """Redact free text in-place and set gating fields. Returns redaction count."""
    redactions = 0

    # Redact EMBED-field texts (these become chunk content).
    for label, text in list(doc.embed_fields.items()):
        new_text, n = redactor.redact(text)
        redactions += n
        if new_text:
            doc.embed_fields[label] = new_text
        else:
            del doc.embed_fields[label]

    # Redact free-text metadata that lands on the document row.
    for attr in ("made_by", "place_made", "exhibitions"):
        new_text, n = redactor.redact(getattr(doc, attr))
        redactions += n
        setattr(doc, attr, new_text)

    # Title also feeds a citation — scrub it too.
    new_title, n = redactor.redact(doc.title)
    redactions += n
    doc.title = new_title or doc.title

    # External docs carry scope/sensitivity from their manifest entry (schema
    # §10: an external doc about the liners is in scope); only redact them.
    if doc.source_type == SourceType.external_historical:
        return redactions

    # VMM rows — set gating here (ingest-pipeline §6).
    # Sensitivity (schema §4): passenger material is archival-gated.
    if doc.material_type in mappings.PASSENGER_MATERIAL_TYPES:
        doc.sensitivity = Sensitivity.passenger_archival
    # voyage_date intentionally left NULL — excluded fail-closed by the view.

    # Ingest scope (schema §10): only confirmed Empress hulls are in scope.
    doc.in_scope = doc.ship in (Ship.ship_i, Ship.ship_ii)
    return redactions


def assert_no_sensitive_columns(row: dict[str, str]) -> None:
    """Guardrail: confirm we never carry a sensitive column forward by mistake."""
    # Sensitive columns may exist in the raw row; they simply must not be mapped.
    leaked = mappings.SENSITIVE_COLUMNS & set(mappings.META_COLUMN_TO_ATTR)
    if leaked:  # pragma: no cover - static invariant
        raise AssertionError(f"sensitive columns mapped to documents: {leaked}")
