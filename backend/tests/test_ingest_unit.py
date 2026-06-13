"""Unit tests for the ingest stages (no database required)."""

from __future__ import annotations

from app.ingest.chunk import compose_vmm_chunk, window_chunks
from app.ingest.embed import FakeEmbedder
from app.ingest.mappings import derive_material_type, map_vessel_to_ship_era
from app.ingest.normalize import normalize_vmm_row
from app.ingest.parse import strip_markup
from app.ingest.privacy import DonorRedactor, apply_privacy
from app.ingest.sources import read_external_manifest
from app.models import EMBEDDING_DIM, Era, Sensitivity, Ship, SourceType


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


def test_external_manifest_requires_license(tmp_path):
    manifest = tmp_path / "ext.json"
    manifest.write_text('[{"title": "T", "text": "x"}]', encoding="utf-8")
    try:
        list(read_external_manifest(manifest))
        raise AssertionError("expected a missing-license error")
    except ValueError as e:
        assert "license" in str(e)
