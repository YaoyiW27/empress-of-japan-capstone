"""Unit tests for the ingest stages (no database required)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.ingest.chunk import compose_vmm_chunk, window_chunks
from app.ingest.classified import load_classified_index
from app.ingest.embed import FakeEmbedder
from app.ingest.mappings import derive_material_type, map_vessel_to_ship_era
from app.ingest.normalize import normalize_vmm_row
from app.ingest.parse import strip_markup
from app.ingest.privacy import DonorRedactor, apply_privacy
from app.ingest.sources import read_external_manifest, read_vmm_rows
from app.ingest.upsert import _find_existing
from app.models import EMBEDDING_DIM, Era, Sensitivity, Ship, SourceType

_ROOT = Path(__file__).resolve().parents[2]
_CSV = _ROOT / "data" / "export_empress of japan.csv"
_CLASSIFIED = _ROOT / "data" / "Empress_of_Japan_records_classified.xlsx"


def test_strip_markup():
    assert strip_markup("<i>Menu</i>  card") == "Menu card"
    assert strip_markup("") is None
    assert strip_markup(None) is None


def test_vessel_mapping():
    assert map_vessel_to_ship_era("Empress of Japan (I)") == (Ship.ship_i, Era.na)
    assert map_vessel_to_ship_era("Empress of Japan (II)") == (Ship.ship_ii, Era.empress_of_japan)
    assert map_vessel_to_ship_era("Empress of Scotland") == (Ship.ship_ii, Era.empress_of_scotland)
    assert map_vessel_to_ship_era("Hanseatic") == (Ship.ship_ii, Era.hanseatic)
    assert map_vessel_to_ship_era("") == (Ship.undetermined, Era.na)
    assert map_vessel_to_ship_era("Empress of Canada") == (Ship.other, Era.na)


def test_material_type():
    assert derive_material_type("Dinner Menu", None, None) == "menu"
    assert derive_material_type("First Class Passenger List", None, None) == "passenger_list"
    assert derive_material_type("Ship model", None, None) == "model"
    assert derive_material_type("Random object", None, None) is None


def test_normalize_does_not_read_donor_or_sensitive_columns():
    row = {
        "Titles": "<i>Menu</i>",
        "Object identifier": "EOJ-1",
        "Vessel represented": "Empress of Scotland",
        "Description": "A dinner menu.",
        "Donated by": "Jane Donor",
        "Value": "5000",
        "Appraisals": "appraised high",
    }
    doc = normalize_vmm_row(row, source_file="x.csv")
    assert doc.title == "Menu"
    assert doc.object_identifier == "EOJ-1"
    assert doc.ship == Ship.ship_ii and doc.era == Era.empress_of_scotland
    # Donor/valuation values must not appear anywhere on the normalized doc.
    blob = repr(doc.__dict__)
    assert "Jane Donor" not in blob and "5000" not in blob and "appraised" not in blob


def test_classified_enrichment_overrides_heuristics():
    row = {
        "Titles": "Dinner menu for Empress of Scotland",
        "Object identifier": "EOJ-CLASSIFIED-1",
        "Vessel represented": "",
        "Description": "A dinner menu.",
        "Object type": "",
        "Category": "",
    }
    classified_row = {
        "Ship classification": "Empress of Japan (II)",
        "Material type": "Menu",
        "Name on item (era)": "Empress of Scotland era (1942–1957)",
        "Match basis": "Single-vessel (exact)",
        "Title (readable)": "Dinner menu for Empress of Scotland",
    }
    doc = normalize_vmm_row(row, classified_row=classified_row)
    assert doc.ship == Ship.ship_ii
    assert doc.era == Era.empress_of_scotland
    assert doc.material_type == "menu"
    assert doc.metadata["classified_match_basis"] == "Single-vessel (exact)"


@pytest.mark.skipif(
    not _CSV.exists() or not _CLASSIFIED.exists(),
    reason="local VMM source files are not present",
)
def test_classified_workbook_matches_csv_object_ids():
    csv_ids = {r["Object identifier"] for r in read_vmm_rows(_CSV)}
    classified = load_classified_index(_CLASSIFIED)
    assert len(csv_ids) == 285
    assert set(classified) == csv_ids
    assert len(classified) == 285


def test_donor_redactor():
    redactor = DonorRedactor(["Smith, John", "Acme Foundation"])
    text, n = redactor.redact("Donated in memory of John Smith via Acme Foundation.")
    assert "John" not in text and "Smith" not in text and "Acme" not in text
    assert n >= 2


def test_apply_privacy_sets_gating():
    row = {
        "Titles": "Passenger List",
        "Object identifier": "EOJ-2",
        "Vessel represented": "Empress of Japan (II)",
    }
    doc = normalize_vmm_row(row)
    apply_privacy(doc, DonorRedactor([]))
    assert doc.material_type == "passenger_list"
    assert doc.sensitivity == Sensitivity.passenger_archival
    assert doc.voyage_date is None  # excluded fail-closed by the view
    assert doc.in_scope is True  # ship_ii is in scope

    other = normalize_vmm_row({"Titles": "X", "Vessel represented": "Empress of Canada"})
    apply_privacy(other, DonorRedactor([]))
    assert other.in_scope is False  # 'other' defaults out of scope


def test_compose_and_window():
    doc = normalize_vmm_row({"Titles": "Menu", "Description": "Soup and fish."})
    compose_vmm_chunk(doc)
    assert len(doc.chunks) == 1
    assert doc.chunks[0].source_field == "composed"
    assert "Menu" in doc.chunks[0].content and "Soup" in doc.chunks[0].content

    windows = window_chunks(
        " ".join(str(i) for i in range(1000)), window_words=400, overlap_words=50
    )
    assert len(windows) > 1


def test_fake_embedder_is_deterministic_and_normalized():
    emb = FakeEmbedder()
    [v1], [v2] = emb.embed(["hello"]), emb.embed(["hello"])
    assert v1 == v2 and len(v1) == EMBEDDING_DIM
    assert abs(sum(x * x for x in v1) - 1.0) < 1e-5  # L2-normalized
    assert emb.embed(["a"]) != emb.embed(["b"])


def test_external_manifest_inline_and_license(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text(
        '[{"title": "T", "text": "Body text here.", "license": "CC BY-SA 4.0",'
        ' "author_publisher": "Author", "source_url": "http://x", "ship": "ship_ii"}]',
        encoding="utf-8",
    )
    docs = list(read_external_manifest(manifest))
    assert len(docs) == 1
    d = docs[0]
    assert d.source_type == SourceType.external_historical
    assert d.license == "CC BY-SA 4.0" and d.embed_fields["body"] == "Body text here."

    # Wikipedia entry uses an injected fetcher (no network in tests).
    manifest.write_text(
        '[{"title": "W", "wikipedia_title": "Empress of Japan (1929)", "license": "CC BY-SA 4.0"}]',
        encoding="utf-8",
    )
    docs = list(read_external_manifest(manifest, wikipedia_fetcher=lambda t: f"Article about {t}."))
    assert docs[0].embed_fields["body"] == "Article about Empress of Japan (1929)."
    assert "en.wikipedia.org/wiki/Empress_of_Japan_(1929)" in docs[0].source_url


def test_external_manifest_same_url_entries_keep_distinct_identity(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text(
        "["
        '{"title": "Era one", "text": "Body one.", "license": "CC BY 4.0",'
        ' "author_publisher": "Author", "source_url": "https://example.test/source"},'
        '{"title": "Era two", "text": "Body two.", "license": "CC BY 4.0",'
        ' "author_publisher": "Author", "source_url": "https://example.test/source"}'
        "]",
        encoding="utf-8",
    )

    first, second = list(read_external_manifest(manifest))

    assert first.source_url == second.source_url
    assert first.dedupe_key() != second.dedupe_key()


def test_external_upsert_lookup_uses_title_with_source_url(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text(
        '[{"title": "Era one", "text": "Body one.", "license": "CC BY 4.0",'
        ' "author_publisher": "Author", "source_url": "https://example.test/source"}]',
        encoding="utf-8",
    )
    [doc] = list(read_external_manifest(manifest))

    class ScalarResult:
        def first(self):
            return None

    class FakeSession:
        statement = None

        def scalars(self, statement):
            self.statement = statement
            return ScalarResult()

    session = FakeSession()

    assert _find_existing(session, doc) is None
    compiled = str(session.statement)
    assert "documents.source_url" in compiled
    assert "documents.title" in compiled


def test_external_manifest_requires_license(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text('[{"title": "T", "text": "x"}]', encoding="utf-8")
    try:
        list(read_external_manifest(manifest))
        raise AssertionError("expected a missing-license error")
    except ValueError as e:
        assert "license" in str(e)


def test_external_manifest_requires_source_url_and_author_for_inline_text(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text('[{"title": "T", "text": "x", "license": "CC BY 4.0"}]', encoding="utf-8")
    with pytest.raises(ValueError, match="author_publisher"):
        list(read_external_manifest(manifest))

    manifest.write_text(
        '[{"title": "T", "text": "x", "license": "CC BY 4.0", "author_publisher": "A"}]',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="source_url"):
        list(read_external_manifest(manifest))
