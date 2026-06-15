"""Source readers — VMM CSV and the external-historical manifest (schema §3).

The external manifest lets the KB hold material beyond the VMM catalogue (e.g.
Wikipedia articles about the Empress liners). Each entry MUST carry a license
(schema CHECK on external_historical) and an author/publisher for attribution.
Bodies may be inline (`text`) or fetched from Wikipedia (`wikipedia_title`).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from pathlib import Path

from app.ingest.parse import parse_csv
from app.ingest.records import IngestDoc
from app.models import Era, Sensitivity, Ship, SourceType

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA_LICENSE = "CC BY-SA 4.0"
WIKIPEDIA_PUBLISHER = "Wikipedia contributors"
# Wikimedia enforces a User-Agent policy: identify the app + a contact.
# https://meta.wikimedia.org/wiki/User-Agent_policy
WIKIPEDIA_USER_AGENT = (
    "EmpressOfJapan-Capstone/0.1 "
    "(https://github.com/lqingman/empress-of-japan-capstone; li.qingm@northeastern.edu)"
)


def read_vmm_rows(csv_path: str | Path) -> list[dict[str, str]]:
    """Read all VMM CSV rows into memory (285 rows — small, see audit §1)."""
    return list(parse_csv(csv_path))


def fetch_wikipedia_extract(title: str, *, timeout: float = 15.0) -> str:
    """Fetch the plain-text extract of a Wikipedia article via the REST action API."""
    import httpx

    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": "1",
        "redirects": "1",
        "format": "json",
        "titles": title,
    }
    resp = httpx.get(
        WIKIPEDIA_API, params=params, timeout=timeout, headers={"User-Agent": WIKIPEDIA_USER_AGENT}
    )
    resp.raise_for_status()
    pages = resp.json()["query"]["pages"]
    page = next(iter(pages.values()))
    extract = page.get("extract", "")
    if not extract:
        raise ValueError(f"Wikipedia returned no extract for {title!r}")
    return extract


def _content_hash(*parts: str | None) -> str:
    blob = "␟".join(p or "" for p in parts)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def load_external_entries(manifest_path: str | Path) -> list[dict]:
    """Parse the manifest JSON (no network) — pipeline builds docs per-entry so a
    single failed fetch is isolated, not fatal to the batch."""
    return json.loads(Path(manifest_path).read_text(encoding="utf-8"))


def build_external_doc(
    entry: dict,
    *,
    source_file: str | None = None,
    wikipedia_fetcher: Callable[[str], str] = fetch_wikipedia_extract,
) -> IngestDoc:
    """Build one external-historical IngestDoc from a manifest entry.

    May fetch from Wikipedia (injectable for tests). Entries without a license
    are rejected early (the schema CHECK would reject them too).
    """
    title = entry["title"]
    license_ = entry.get("license")
    if not license_:
        raise ValueError(f"external source {title!r} is missing a required license")

    if entry.get("text"):
        body = entry["text"]
        author = entry.get("author_publisher")
        source_url = entry.get("source_url")
    elif entry.get("wikipedia_title"):
        body = wikipedia_fetcher(entry["wikipedia_title"])
        author = entry.get("author_publisher", WIKIPEDIA_PUBLISHER)
        source_url = entry.get(
            "source_url",
            f"https://en.wikipedia.org/wiki/{entry['wikipedia_title'].replace(' ', '_')}",
        )
    else:
        raise ValueError(f"external source {title!r} needs 'text' or 'wikipedia_title'")

    return IngestDoc(
        source_type=SourceType.external_historical,
        title=title,
        content_hash=_content_hash(title, source_url, body),
        source_url=source_url,
        author_publisher=author,
        license=license_,
        source_file=source_file,
        embed_fields={"body": body},
        ship=Ship(entry["ship"]) if entry.get("ship") else None,
        era=Era(entry["era"]) if entry.get("era") else None,
        material_type=entry.get("material_type"),
        metadata=entry.get("metadata", {}),
        sensitivity=Sensitivity.public,
        in_scope=entry.get("in_scope", True),
    )


def read_external_manifest(
    manifest_path: str | Path,
    *,
    wikipedia_fetcher: Callable[[str], str] = fetch_wikipedia_extract,
):
    """Convenience generator (used in tests): parse + build every entry."""
    for entry in load_external_entries(manifest_path):
        yield build_external_doc(
            entry, source_file=str(manifest_path), wikipedia_fetcher=wikipedia_fetcher
        )
