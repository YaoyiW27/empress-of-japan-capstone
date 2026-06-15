"""Stage 1 — Parse & load (ingest-pipeline §4).

Read the VMM CSV (the source of truth, not the XLSX — audit §1), confirm UTF-8,
and strip literal ``<i>…</i>`` markup before anything downstream (audit §6).
"""

from __future__ import annotations

import csv
import re
from collections.abc import Iterator
from pathlib import Path

# Strip any HTML-ish tag (the export carries literal <i>…</i> in 203/285 titles).
_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")


def strip_markup(value: str | None) -> str | None:
    """Remove literal HTML tags and collapse whitespace; None/empty → None."""
    if value is None:
        return None
    cleaned = _TAG_RE.sub("", value)
    cleaned = " ".join(cleaned.split())
    return cleaned or None


def parse_csv(path: str | Path) -> Iterator[dict[str, str]]:
    """Yield raw CSV rows as dicts, decoded as UTF-8.

    ``utf-8-sig`` tolerates a BOM if the export carries one; non-ASCII place and
    ship names round-trip cleanly (audit §6). Markup stripping happens in the
    normalize stage, per-field, so the raw values stay inspectable here.
    """
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)
