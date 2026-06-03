# VMM CSV — Data Audit Notes

> **Scope:** Local audit of the VMM `Empress of Japan` export, ahead of pgvector ingest.
> **Privacy:** Structure only — **no actual data values** (no donor names, passenger names, valuations, or verbatim titles) are recorded in this file.
> **Repo note:** This notes file is safe to commit. The **raw CSV/XLSX must NOT be committed** (local-only).
> Author: Alina (Qingman Li) · Date: 2026-06-03

---

## 1. Source files

| File | Rows | Cols | Notes |
|---|---|---|---|
| `export_empress_of_japan.csv` | 285 | 29 | Titles/vessel carry literal `<i>…</i>` markup |
| `export_results_2026-05-20.xlsx` | 285 | 29 | Same export; italics stored as cell formatting, not literal tags |

- Same shape and column set; **not byte-identical** (markup handling differs).
- **Action:** pick ONE as source of truth for ingest to avoid double-ingest / inconsistent text. Recommend the CSV with a markup-stripping step (see §6).

## 2. Schema (29 columns) — fill rate & proposed ingest role

Roles: **EMBED** (vectorized text) · **META** (filterable metadata) · **SENSITIVE** (never surfaced) · **DROP** (near-empty / unused).

| Column | Fill % | Proposed role |
|---|---|---|
| Object identifier | 100% | META (primary key) |
| Titles | 100% | EMBED (strip markup) |
| Vessel represented | 88.8% | META (needs normalization — §5) |
| Measurements | 60.4% | META |
| Donated by | 48.4% | **SENSITIVE (donor PII)** |
| Category | 21.1% | META |
| Materials | 20.4% | META |
| Description | 20.7% | EMBED + **PII scan** |
| Relevance to mandate / Antique? / Quality / Display case? / Current condition | ~18.9% | META (internal curatorial) |
| Object type | 13.7% | META |
| Appraisals | 13.7% | **SENSITIVE (valuation)** |
| Previous number(s) | 12.3% | META |
| Exhibitions | 8.4% | META + PII scan |
| Made by / Place made / Condition / Notes on condition / Notes on conservation | 5–8% | META + PII scan (free text) |
| Artist/Maker/Manufacturer note | 5.3% | EMBED/META + PII scan |
| History of use | 1.4% | EMBED + PII scan |
| Model type / Attractiveness | <1% | DROP / optional META |
| Object media (thumbnail) / Place made notes / Value / Appraisal note | 0% | DROP (empty in this export) |

## 3. Record counts (aggregate)

- **Total records:** 285
- **By ship (relationship to the two physical vessels):**
  - Empress of Japan (II): **104**
  - Empress of Japan (I): **127**
  - Undetermined (ship unconfirmed): **13**
  - Other / not Empress of Japan: **41**
- **Ship II by era (same hull, three names):**
  - Empress of Japan era (1930–1942): 68 (62 are passenger lists)
  - Empress of Scotland era (1942–1957): 30 (21 are menus)
  - Name not in title (physical objects): 6
- **By material type (all 285):** Menu 93 · Passenger list 67 · Other/object 61 · Model 16 · Accommodation/deck plan 10 · Register 10 · Photograph 5 · Clock 4 · Lighting 4 · Painting 4 · Voyage calculations 3 · Daily program 2 · Route map 2 · Brochure 1 · Voyage log 1 · Voyage record (misc) 1 · Weather record 1

## 4. Primary key

- `Object identifier`: 285 non-null, **285 unique, 0 duplicates, 0 blanks** → usable as PK.
- TODO: near-duplicate **title** check (repeated generic titles may be distinct items or true dupes).

## 5. Privacy & sensitivity classification of fields

| Class | Rule | Fields in this export |
|---|---|---|
| **A — Donor PII** | Zero-tolerance; never surfaced | `Donated by` (primary). Also scan free-text for stray names: `Description`, `Made by`, `Artist/Maker note`, `History of use`, `Exhibitions`, `Notes on condition/conservation` |
| **B — Valuation / financial** | Recommend exclude (insurance/appraisal) | `Appraisals`, `Value`, `Appraisal note` |
| **C — Passenger names** | Public archival, sensitive (descendant check for post-1945) | **Not present in this CSV** — only list titles/voyage refs. Names arrive with digitized list contents. |

- **Key point:** donor-name blocklist must be built from **all** free-text fields, not just `Donated by`.

## 6. Data-quality flags / cleaning needs

- **Markup:** 203/285 titles contain `<i>` tags → strip before embedding & before use in citations.
- **Encoding:** non-ASCII characters present (place/ship names) → confirm UTF-8 round-trip on ingest.
- **No structured date field:** dates are only implicit in voyage numbers / era. **Blocks the post-1945 descendant-sensitivity gate** for passenger names → requires a date-derivation/enrichment step.
- **Vessel key is messy:** 88.8% filled (32 blank), multi-vessel list rows, and one hull under three names (Empress of Japan → Empress of Scotland → Hanseatic). Maintain a documented canonical mapping so retrieval filtering and the per-ship coverage KPI compute correctly.
- **Scope:** export is not limited to one ship (Ship I + non-EoJ rows present) → define an explicit ingest filter.
- **Low-fill columns:** several fields are 0–20% populated → decide DROP vs optional META.

## 7. Open questions / follow-ups for Ashley (VMM)

- Confirm the ship for the **13 "Undetermined"** records (voyage log, weather record, voyage calculations, some menus/plans) — cross-check against `vmmcollections.com/Detail/vessels/900`.
- Request a **curated digitized sample** by material type (priority: 2–3 Japan-era passenger lists; 1–2 accommodation/deck plans; the single voyage log / weather record / calculations once ship-confirmed).
- Do passenger lists carry **voyage dates** (needed for the post-1945 gate)?
- Photo albums are **not yet digitized** — descriptions only for now.

## 8. Audit status checklist

- [x] Column structure & record counts confirmed
- [x] Donor field(s) identified (+ free-text PII scan targets listed)
- [x] Passenger-list entries identified (catalogue-level; no names in CSV)
- [x] Ship / era / material-type classification mapped
- [ ] Free-text PII scan executed across Class-A fields
- [ ] Canonical vessel mapping finalized
- [ ] Date-enrichment approach defined (post-1945 gate)
- [ ] Field → ingest mapping signed off
