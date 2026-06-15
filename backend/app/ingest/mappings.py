"""Canonical mappings + column-fate tables (schema §6b, §8; audit §3, §5).

The CSV column names here must match the VMM export header exactly. The fate of
every column is encoded so nothing is silently kept or lost — see schema §6b.
"""

from __future__ import annotations

from app.models import Era, Ship

# --- CSV column names (exact header strings) ---------------------------------
COL_TITLES = "Titles"
COL_OBJECT_IDENTIFIER = "Object identifier"
COL_PREVIOUS_NUMBERS = "Previous number(s)"
COL_OBJECT_TYPE = "Object type"
COL_CATEGORY = "Category"
COL_MADE_BY = "Made by"
COL_MAKER_NOTE = "Artist/Maker/Manufacturer note"
COL_PLACE_MADE = "Place made"
COL_VESSEL = "Vessel represented"
COL_DESCRIPTION = "Description"
COL_MEASUREMENTS = "Measurements"
COL_MATERIALS = "Materials"
COL_DONATED_BY = "Donated by"
COL_HISTORY_OF_USE = "History of use"
COL_EXHIBITIONS = "Exhibitions"

# Fields concatenated into the single composed VMM chunk (schema §7), in order.
EMBED_FIELDS = (COL_TITLES, COL_DESCRIPTION, COL_HISTORY_OF_USE, COL_MAKER_NOTE)

# CSV column → documents attribute (filterable metadata; schema §6b).
META_COLUMN_TO_ATTR = {
    COL_OBJECT_IDENTIFIER: "object_identifier",
    COL_PREVIOUS_NUMBERS: "previous_numbers",
    COL_OBJECT_TYPE: "object_type",
    COL_CATEGORY: "category",
    COL_MADE_BY: "made_by",
    COL_PLACE_MADE: "place_made",
    COL_MEASUREMENTS: "measurements",
    COL_MATERIALS: "materials",
    COL_EXHIBITIONS: "exhibitions",
}

# Never read into any row (privacy by omission; schema §4, §6b). Listed so the
# privacy stage can assert none of these reach downstream.
SENSITIVE_COLUMNS = frozenset({COL_DONATED_BY, "Value", "Appraisals", "Appraisal note"})

# Free-text fields scanned for stray donor names (audit §5) before they land.
PII_SCAN_COLUMNS = frozenset(
    {
        COL_DESCRIPTION,
        COL_MAKER_NOTE,
        COL_HISTORY_OF_USE,
        COL_MADE_BY,
        COL_EXHIBITIONS,
        COL_PLACE_MADE,
    }
)


def map_vessel_to_ship_era(vessel: str | None) -> tuple[Ship, Era]:
    """Normalise the messy ``Vessel represented`` text into ship + era (schema §8).

    Heuristic, pending Ashley's confirmation of ambiguous rows (audit §7):
    explicit roman numerals and the Scotland/Hanseatic names classify cleanly;
    a bare "Empress of Japan" with no disambiguator stays ``undetermined``
    (which defaults out of scope) rather than risk a majority misclassification.
    """
    t = (vessel or "").strip().lower()
    if not t:
        return Ship.undetermined, Era.na
    if "scotland" in t:
        return Ship.ship_ii, Era.empress_of_scotland
    if "hanseatic" in t:
        return Ship.ship_ii, Era.hanseatic
    if "empress of japan" in t:
        if "(i)" in t or "(1)" in t:
            return Ship.ship_i, Era.na
        if "(ii)" in t or "(2)" in t:
            return Ship.ship_ii, Era.empress_of_japan
        return Ship.undetermined, Era.na
    # A different, named vessel (e.g. another Empress liner).
    return Ship.other, Era.na


# Keyword → canonical material_type (audit §3), checked in order against the
# combined title/object_type/category text. First match wins.
_MATERIAL_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("passenger list", "passenger_list"),
    ("list of passenger", "passenger_list"),
    ("deck plan", "deck_plan"),
    ("accommodation plan", "deck_plan"),
    ("weather record", "weather_record"),
    ("voyage calculation", "voyage_calculations"),
    ("voyage log", "voyage_log"),
    ("daily program", "daily_program"),
    ("daily programme", "daily_program"),
    ("route map", "route_map"),
    ("brochure", "brochure"),
    ("register", "register"),
    ("menu", "menu"),
    ("model", "model"),
    ("photograph", "photograph"),
    ("clock", "clock"),
    ("lighting", "lighting"),
    ("lamp", "lighting"),
    ("painting", "painting"),
)


def derive_material_type(title: str, object_type: str | None, category: str | None) -> str | None:
    """Derive a canonical ``material_type`` from the item's text (audit §3)."""
    haystack = " ".join(p for p in (title, object_type, category) if p).lower()
    for keyword, material in _MATERIAL_KEYWORDS:
        if keyword in haystack:
            return material
    return None


# Material types that carry passenger-archival sensitivity (schema §4). Their
# voyage_date is unknown (no enrichment yet) so the retrieval view excludes them
# fail-closed — see ingest-pipeline §6 / §11.
PASSENGER_MATERIAL_TYPES = frozenset({"passenger_list"})
