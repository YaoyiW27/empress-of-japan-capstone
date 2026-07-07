"""Optional VMM classified-workbook enrichment.

The CSV remains the canonical museum export. The local classified workbook is a
derived aid that preserves the original 285 rows and adds curator-friendly
classification columns. This module reads only the ``All records (classified)``
sheet and indexes it by ``Object identifier``.
"""

from __future__ import annotations

import posixpath
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

CLASSIFIED_SHEET = "All records (classified)"
COL_SHIP_CLASSIFICATION = "Ship classification"
COL_MATERIAL_TYPE = "Material type"
COL_NAME_ON_ITEM_ERA = "Name on item (era)"
COL_MATCH_BASIS = "Match basis"
COL_TITLE_READABLE = "Title (readable)"

_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
_REL_ATTR = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def _column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + ord(ch.upper()) - 64
    return idx - 1


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    strings: list[str] = []
    for item in root.findall("main:si", _NS):
        strings.append("".join(text.text or "" for text in item.findall(".//main:t", _NS)))
    return strings


def _sheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("rel:Relationship", _NS)
    }

    paths: dict[str, str] = {}
    for sheet in workbook.findall("main:sheets/main:sheet", _NS):
        target = targets[sheet.attrib[_REL_ATTR]]
        paths[sheet.attrib["name"]] = (
            target.lstrip("/") if target.startswith("/") else posixpath.normpath(f"xl/{target}")
        )
    return paths


def _sheet_rows(archive: zipfile.ZipFile, sheet_path: str, shared: list[str]) -> list[list[str]]:
    root = ET.fromstring(archive.read(sheet_path))
    rows: list[list[str]] = []
    for row in root.findall(".//main:sheetData/main:row", _NS):
        values: list[str] = []
        for cell in row.findall("main:c", _NS):
            idx = _column_index(cell.attrib.get("r", "A1"))
            while len(values) <= idx:
                values.append("")
            cell_type = cell.attrib.get("t")
            if cell_type == "inlineStr":
                text = "".join(t.text or "" for t in cell.findall(".//main:t", _NS))
            else:
                raw_node = cell.find("main:v", _NS)
                raw = "" if raw_node is None or raw_node.text is None else raw_node.text
                text = shared[int(raw)] if cell_type == "s" and raw else raw
            values[idx] = " ".join(text.split()) if isinstance(text, str) else str(text)
        if any(values):
            rows.append(values)
    return rows


def read_classified_rows(
    path: str | Path, sheet_name: str = CLASSIFIED_SHEET
) -> list[dict[str, str]]:
    """Read the classified workbook sheet into dictionaries.

    This intentionally avoids optional Excel dependencies; ``.xlsx`` is a ZIP of
    XML files and the classification sheet has simple scalar cells.
    """
    with zipfile.ZipFile(path) as archive:
        paths = _sheet_paths(archive)
        if sheet_name not in paths:
            raise ValueError(f"classified workbook is missing sheet {sheet_name!r}")
        rows = _sheet_rows(archive, paths[sheet_name], _shared_strings(archive))

    if not rows:
        return []
    header = rows[0]
    return [
        {header[i]: values[i] if i < len(values) else "" for i in range(len(header))}
        for values in rows[1:]
        if any(value.strip() for value in values)
    ]


def load_classified_index(path: str | Path | None) -> dict[str, dict[str, str]]:
    """Return classified rows keyed by object identifier; empty when no path."""
    if not path:
        return {}
    rows = read_classified_rows(path)
    index: dict[str, dict[str, str]] = {}
    for row in rows:
        object_identifier = row.get("Object identifier", "").strip()
        if object_identifier:
            index[object_identifier] = row
    return index
