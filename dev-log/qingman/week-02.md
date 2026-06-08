# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 2 (June 4 – June 10, 2026)
Date: 2026-06-08

## 1. Task / Goal
- **Issue #10** — [data] Design the Postgres + pgvector knowledge base schema
  that grounds the multi-agent RAG backend, documented in `data/schema.md`.
  Must support the privacy tiers, per-ship tagging, embedding storage, and a
  source citation chain identified in last week's audit (#9).

## 2. AI Tools Used
Claude Code (Opus), used in plan mode to design the schema, then to author and
**validate** the DDL against a real Postgres + pgvector instance, plus a
repo-hygiene pass.

## 3. Prompts / Agent Workflow
- **Design (plan mode)** — had Claude review issue #10 against the audit notes
  before writing anything, then work through the open design decisions as
  explicit choices rather than assumptions: embedding model + dimension
  (Bedrock Titan Text Embeddings V2 → `vector(1024)`), chunking shape
  (two-table `documents` + `chunks`), and how to enforce privacy at the schema
  level.
- **Reframed the data sourcing** — flagged that the museum only has catalogue
  metadata today and digitizes slowly, so the KB is grounded in three source
  types (`vmm_catalogue`, `vmm_digitized_sample`, `external_historical`) with
  per-source provenance and an origin-aware citation chain.
- **Verified columns directly** — instead of trusting the audit summary, had
  Claude read the actual CSV header and build a column-fate table for all 29
  columns, deciding exactly which get embedded vs stored-as-metadata vs dropped.
- **Validated, not just authored** — installed Docker Desktop locally and had
  Claude run the schema DDL against `pgvector/pgvector:pg16`, then functionally
  test the privacy gate by seeding rows and querying the retrieval view.

## 4. Useful Output
- `data/schema.md` — the schema design + validated DDL:
  - **Two-table RAG shape:** `documents` (one row per source item) + `chunks`
    (one embedding each), `vector(1024)` for Bedrock Titan V2, HNSW cosine index.
  - **Privacy by omission:** donor, valuation, and internal-curatorial columns
    are *never created* — nothing to leak. Passenger-archival data is gated
    post-1945 (fail-closed) through a `retrievable_chunks` view, the only
    surface the RAG layer queries.
  - **Column-fate table** mapping all 29 audited CSV columns — only **4** are
    embedded (Titles, Description, History of use, Maker note); the rest are
    filterable metadata, omitted-sensitive, dropped-internal, or empty.
  - **Multi-source model** with provenance and a required-license CHECK on
    external historical material.
  - Canonical ship/era mapping, ingest scope filter, and an explicit
    out-of-scope list (RDS provisioning, ORM models, ingest pipeline).
- `.gitignore` update — broadened the donor-data guard to `data/*.csv` /
  `data/*.xlsx` (allowing `audit-notes.md` / `schema.md`), closing the gap that
  left a derived spreadsheet committable (see §5).
- **Local dev environment** — Docker Desktop installed (WSL2 backend), used to
  validate the schema against real Postgres + pgvector.

## 5. Human Review / Changes
- **Caught another `.gitignore` gap.** A new derived file
  (`Empress_of_Japan_records_classified.xlsx`) was untracked but *not* ignored —
  last week's guard only matched `export_*`. It would have been committable.
  Broadened the rule to all `data/*.xlsx` / `data/*.csv` and verified with
  `git check-ignore` that every spreadsheet is now blocked while the `.md` docs
  stay committable.
- **Pushed back on storing donor data.** Rather than a tiered-access design,
  decided donor PII and valuations are *dropped at the ingest boundary and never
  stored* — the museum's own system stays the system of record. Smallest leak
  surface, and it aligns with the "never commit donor data" rule.
- **Insisted on real validation.** Claude initially wrote the DDL with a
  made-up shorthand and a claim it had been validated; corrected the SQL to
  valid Postgres and actually ran it. The DDL creates cleanly, and the privacy
  gate test confirmed the view returns only the public/in-scope and pre-1945
  passenger rows — out-of-scope, NULL-date, and post-1945 rows are all hidden.
- **Kept scope honest.** Confirmed issue #10 is the design doc + DDL only;
  RDS provisioning (infra/Yaoyi), ORM models + migrations, and the ingest
  pipeline are recorded as follow-ups, not silently pulled in.

## 6. Reflection
The most valuable move this week was refusing to merge an *unvalidated* schema —
spinning up pgvector locally turned "looks right" into "creates cleanly and the
privacy gate provably fails closed," which matters because that gate is the
thing standing between us and surfacing a passenger's name we shouldn't. The
recurring `.gitignore` gap (twice now) suggests a pattern worth automating: a
pre-commit hook that blocks any `data/*.csv`/`*.xlsx` would beat catching it by
eye each week. The open blocker carried over from last week is unchanged — the
post-1945 gate needs a `voyage_date` the source data doesn't have, so a
date-enrichment step is the prerequisite before any passenger-name content can
go live. Next: hand RDS + pgvector provisioning to Yaoyi and start sketching the
ingest pipeline against the local Docker instance.
