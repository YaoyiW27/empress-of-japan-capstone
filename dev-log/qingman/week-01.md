# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 1 (May 26 – June 3, 2026)
Date: 2026-06-03

## 1. Task / Goal
Two issues this week, both on the data track:
- **Issue #11** — [stakeholder] Follow-up email to Ashley Smith (VMM) to close
  the open scope/privacy questions blocking ingest: one ship vs both, and
  whether passenger names from archival lists can be used in AI content. Also
  arrange the museum visit.
- **Issue #9** — [data] Audit Ashley's VMM CSV locally ahead of pgvector ingest:
  a commit-safe, structure-only writeup (no raw values) of the `Empress of
  Japan` export.

## 2. AI Tools Used
Claude Code (Opus), used for three things this week: the local data audit, a PR
review pass, and drafting/coordinating the stakeholder communications.

## 3. Prompts / Agent Workflow
- **Audit** — had Claude read the raw CSV/XLSX export locally and produce a
  structure-only writeup: per-column fill rates, proposed ingest roles
  (EMBED / META / SENSITIVE / DROP), primary-key check, and record counts by
  ship / era / material type. Constraint set up front: *no actual data values
  in the committed file* (no donor names, passenger names, valuations, or
  verbatim titles).
- **PR review / coordinate** — used Claude to sanity-check the audit notes
  against the issue's acceptance criteria before opening the PR, and to catch
  repo-hygiene gaps (see §5). Also used it to help structure the follow-up
  questions to Ashley so the email closed every open decision in one pass.

## 4. Useful Output
- `data/audit-notes.md` — the full structure-only audit: 29-column schema with
  per-field fill rates and ingest roles, primary-key confirmation (285 unique
  `Object identifier` values, 0 duplicates, 0 blanks), record counts by
  ship/era/material type, a privacy & sensitivity classification (donor PII,
  valuation, passenger-name classes), and a data-quality flag list (italic
  markup in titles, encoding, no structured date field, messy vessel key).
- `.gitignore` update — broadened the donor-data block to keep **both** raw
  source formats out of git (`data/export_*.csv`, `data/export_*.xlsx`), not
  just the single CSV.
- **Resolved stakeholder decisions** (from Ashley's email replies), now feeding
  the ingest plan:
  - **Scope confirmed to one ship** — the second *Empress of Japan* (built 1929,
    in service until 1966); records at `vmmcollections.com/Detail/vessels/900`.
    Work only with records tied to that vessel.
  - **Passenger names cleared** for use as virtual "people agents," with a
    recommendation to do light genealogical research (e.g. Ancestry.ca) on
    anyone we represent.
  - **Photo albums not yet digitized** (no non-damaging method yet) but
    described in detail in the database.
  - **Raw archival data digitizable on request** — Ashley offered either
    specific named items or one example of each record type.
- **Museum visit arranged** — Prof. Yvonne connected us with the museum; visit
  confirmed to view the second *Empress of Japan* model in the gallery (no
  supervision needed, check in at the front desk ~3:30 PM, museum closes 5:00)
  and take photos.

## 5. Human Review / Changes
- **Privacy guardrail held.** Verified the committed audit contains structure
  only — no donor names, passenger names, valuations, or verbatim titles — per
  the "never commit donor data" rule. The raw CSV/XLSX stays local-only.
- **Caught a `.gitignore` gap.** The audit references a second source file
  (`export_results_2026-05-20.xlsx`), but `.gitignore` only excluded the CSV —
  the XLSX could have been committed by accident. Broadened the ignore rules and
  verified with `git check-ignore` that both raw formats are now blocked.
- **Checked audit against the issue's acceptance criteria** before opening the
  PR: column structure & counts, donor-field identification (tagged at ingest,
  never surfaced), passenger-list entries as a separate privacy class, and a
  values-free writeup — all four confirmed present.
- **Open follow-ups recorded for Ashley** rather than guessed: confirm the ship
  for the 13 "Undetermined" records, request a curated digitized sample by
  material type, and confirm whether passenger lists carry voyage dates (needed
  for the post-1945 descendant-sensitivity gate).

## 6. Reflection
Using Claude as a review pass before opening the PR paid off — the `.gitignore`
gap on the XLSX was exactly the kind of quiet mistake that would have committed
raw donor data, and it surfaced before anything was pushed. The audit-first
framing (structure only, decisions recorded as a paper trail) kept the privacy
constraint front-and-center instead of an afterthought. The biggest open risk
the audit exposed is the absence of a structured date field, which blocks the
post-1945 gate for passenger names; next week's goal is to define a
date-enrichment approach and finalize the canonical vessel mapping before ingest.
