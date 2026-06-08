# Knowledge Base Schema — Postgres + pgvector

> **Status:** Design (issue #10). Documents the schema for the RAG knowledge
> base that grounds the multi-agent backend.
> **Author:** Alina (Qingman Li) · **Track:** Multi-Agent Backend & Data
> **Upstream:** [data/audit-notes.md](./audit-notes.md) (CSV audit, closes #9)
> **Scope of this doc:** design rationale + SQL DDL. Runnable migrations,
> SQLAlchemy models, RDS provisioning, and the ingest pipeline are **follow-up
> tasks in other tracks** (see §12).

---

## 1. Purpose & context

The Empress of Japan experience lets visitors converse with personas grounded in
real archival material. Those answers must be **retrievable, filterable, and
citable**. This schema defines a Postgres + [pgvector](https://github.com/pgvector/pgvector)
store that holds embeddable text + filterable metadata + a citation chain.

The store is **derived and public-facing**. It is *not* a copy of the VMM
collection-management system — it deliberately omits everything a visitor should
never see (donor identities, valuations, internal curatorial judgments). The VMM
system remains the system of record for those.

Input shape comes from the audit: 285 catalogue records, 29 columns, sparse
free-text, messy vessel key, no structured dates, and literal `<i>` markup in
titles. See [audit-notes.md](./audit-notes.md) §2–§6.

---

## 2. Design principles

1. **Privacy by omission, not access control.** Donor/valuation data is never
   ingested, so there is no column to leak. (CLAUDE.md zero-tolerance rule.)
2. **Multi-source.** VMM has only catalogue metadata today; digitized assets
   arrive slowly as samples. The KB is grounded in three source types
   (§3), so retrieval breadth doesn't depend on VMM digitization speed.
3. **Citation-first.** Every embeddable chunk traces back to a document and an
   **origin** (VMM archive vs external), so agent answers can be attributed and
   audited (Ashley's W7 hallucination audits).
4. **Retrieval through a guarded view.** The RAG layer queries a view that
   enforces scope + sensitivity gating, never the base tables.
5. **Re-embeddable.** Embedding model + timestamp are stored per chunk so we can
   swap models or re-embed without guessing provenance.

---

## 3. Source model

Every row in `documents` declares its origin via `source_type`:

| `source_type` | What it is | Metadata available | Citation pointer |
|---|---|---|---|
| `vmm_catalogue` | A VMM catalogue record (the 285-row export) | ship/era/material/etc. | `object_identifier` + `public_url` (`vmmcollections.com/Detail/...`) |
| `vmm_digitized_sample` | Curated digitized content VMM sends (sample passenger lists, deck plans, menus) | partial; depends on item | `object_identifier` / `source_file` |
| `external_historical` | Public/online historical material about the Empress liners | free-form → `metadata` JSONB | `source_url` + `author_publisher` + `license` |

**Licensing:** external material must carry a `license` value; ingest rejects
external docs without a recorded license/attribution. This keeps attribution
auditable and avoids ingesting unredistributable text.

---

## 4. Privacy & sensitivity model

**Three mechanisms, layered:**

1. **Omission (primary).** Donor and valuation columns (`Donated by`, `Value`,
   `Appraisals`, `Appraisal note`) and internal curatorial judgments are **never
   created** in the schema (see §6 column-fate table). Nothing to query, nothing
   to leak.
2. **Free-text PII redaction (ingest-time).** The audit (§5) warns donor names
   can appear inside narrative fields (`Description`, `Made by`, maker note,
   `History of use`, `Exhibitions`). Every EMBED/free-text value passes a
   donor-name redaction scan **before** it lands in `documents`/`chunks`. (The
   blocklist is built from all free-text fields, not just `Donated by`.)
3. **Sensitivity gating (query-time).** `documents.sensitivity` separates
   `public` from `passenger_archival`. Passenger names are public archival
   material but carry a **descendant-sensitivity gate**: a passenger-archival
   document is only retrievable if its `voyage_date` is before 1945, OR (later)
   an explicit curator approval. Enforced in the `retrievable_chunks` view (§6).

> **Dependency:** the post-1945 gate needs `voyage_date`, which the source data
> does **not** provide (audit §6 — no structured date field). Until a
> date-enrichment step exists, passenger-archival documents default to
> `voyage_date = NULL` and are **excluded** by the view (fail-closed). See §11.

---

## 5. Entities

```
 documents (1) ────< (N) chunks
   │                     │
   │ source_type         │ embedding vector(1024)
   │ provenance          │ source_field
   │ ship / era / meta   │ content (cleaned, redacted)
   │ sensitivity         │
   │ voyage_date         │
   │ in_scope            │
```

- **`documents`** — one row per source item. Holds the cleaned title, source
  type + provenance, a curated subset of filterable VMM metadata (nullable for
  non-catalogue rows), sensitivity, and the ingest-scope flag.
- **`chunks`** — one row per embeddable text chunk (many per document). Holds the
  vector, the cleaned content, which field it came from, and embedding
  provenance.

---

## 6. DDL

```sql
-- ============================================================
-- Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE source_type_enum AS ENUM (
    'vmm_catalogue',
    'vmm_digitized_sample',
    'external_historical'
);

-- Canonical vessel key (audit §3). The two physical ships, plus the
-- unconfirmed and not-Empress buckets.
CREATE TYPE ship_enum AS ENUM (
    'ship_i',          -- Empress of Japan (I)
    'ship_ii',         -- Empress of Japan (II) / Scotland / Hanseatic hull
    'undetermined',    -- ship unconfirmed (audit: 13 records)
    'other'            -- not an Empress of Japan vessel (audit: 41 records)
);

-- Ship II carried three names over its life (audit §3). NULL/'na' for ship I,
-- undetermined, other, and non-catalogue docs.
CREATE TYPE era_enum AS ENUM (
    'empress_of_japan',     -- 1930–1942
    'empress_of_scotland',  -- 1942–1957
    'hanseatic',            -- post-1957
    'na'
);

CREATE TYPE sensitivity_enum AS ENUM (
    'public',
    'passenger_archival'    -- public archival, post-1945 descendant gate (§4)
);

-- ============================================================
-- documents
-- ============================================================
CREATE TABLE documents (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Origin & provenance
    source_type     source_type_enum NOT NULL,
    title           TEXT NOT NULL,          -- cleaned, <i> markup stripped
    object_identifier TEXT,                 -- VMM PK (unique within catalogue); NULL for external
    source_url      TEXT,                   -- external origin URL
    public_url      TEXT,                   -- public VMM detail page, if any
    author_publisher TEXT,                  -- external author/publisher
    license         TEXT,                   -- required for external_historical (§3)
    source_file     TEXT,                   -- ingest provenance (which file/export)
    content_hash    TEXT NOT NULL,          -- dedup / change detection
    metadata        JSONB NOT NULL DEFAULT '{}',  -- source-specific extras

    -- Filterable VMM metadata (nullable for non-catalogue rows)
    ship            ship_enum,
    era             era_enum,
    material_type   TEXT,                   -- menu, passenger_list, model, ...
    category        TEXT,
    object_type     TEXT,
    materials       TEXT,
    measurements    TEXT,
    place_made      TEXT,
    made_by         TEXT,
    previous_numbers TEXT,
    exhibitions     TEXT,

    -- Gating
    sensitivity     sensitivity_enum NOT NULL DEFAULT 'public',
    voyage_date     DATE,                   -- enrichment; NULL until derived (§11)
    in_scope        BOOLEAN NOT NULL DEFAULT TRUE,  -- ingest scope filter (§10)

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- object_identifier is unique among catalogue rows but NULL elsewhere; a partial
-- unique index enforces that without blocking multiple NULLs.
CREATE UNIQUE INDEX uq_documents_object_identifier
    ON documents (object_identifier)
    WHERE object_identifier IS NOT NULL;

-- External docs must carry a license (auditable attribution, §3).
ALTER TABLE documents ADD CONSTRAINT chk_external_license
    CHECK (source_type <> 'external_historical' OR license IS NOT NULL);

-- Metadata pre-filter indexes
CREATE INDEX idx_documents_source_type   ON documents (source_type);
CREATE INDEX idx_documents_ship          ON documents (ship);
CREATE INDEX idx_documents_material_type ON documents (material_type);
CREATE INDEX idx_documents_sensitivity   ON documents (sensitivity);
CREATE INDEX idx_documents_in_scope      ON documents (in_scope);

-- ============================================================
-- chunks
-- ============================================================
CREATE TABLE chunks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id     BIGINT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL DEFAULT 0,  -- order within the document
    source_field    TEXT NOT NULL,           -- e.g. 'composed', 'description', 'body'
    content         TEXT NOT NULL,           -- cleaned + redacted text that was embedded

    embedding       vector(1024) NOT NULL,   -- Bedrock Titan Text Embeddings V2
    embedding_model TEXT NOT NULL DEFAULT 'amazon.titan-embed-text-v2:0',
    token_count     INT,
    embedded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (document_id, chunk_index)
);

-- Approximate nearest-neighbour search. HNSW = better recall/latency than
-- IVFFlat and needs no training step. Cosine distance matches Titan embeddings.
CREATE INDEX idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_chunks_document_id ON chunks (document_id);

-- ============================================================
-- retrievable_chunks — the ONLY surface the RAG layer queries (§4)
-- ============================================================
-- Enforces ingest scope + the passenger-archival post-1945 gate. Fail-closed:
-- passenger_archival rows with NULL voyage_date are excluded.
CREATE VIEW retrievable_chunks AS
SELECT
    c.id            AS chunk_id,
    c.document_id,
    c.content,
    c.embedding,
    c.source_field,
    d.source_type,
    d.title,
    d.ship,
    d.era,
    d.material_type,
    -- origin-aware citation pointer (§9)
    d.object_identifier,
    d.public_url,
    d.source_url,
    d.author_publisher,
    d.license
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE d.in_scope = TRUE
  AND (
        d.sensitivity = 'public'
        OR (
            d.sensitivity = 'passenger_archival'
            AND d.voyage_date IS NOT NULL
            AND d.voyage_date < DATE '1945-01-01'
        )
  );
```

---

## 6b. Column-fate mapping — all 29 CSV columns

Verified against the `export_empress of japan.csv` header. **Only 4 columns are
embedded.** Everything else is filterable metadata, omitted-sensitive,
dropped-internal, or empty. Nothing is silently lost.

| # | CSV column | Fill % | Fate | Lands in |
|---|---|---|---|---|
| 1 | Object media representation (thumbnail) | 0% | **DROP** (empty) | — |
| 2 | Titles | 100% | **EMBED** (strip `<i>`) | `chunks` + `documents.title` |
| 3 | Object identifier | 100% | META (PK / citation) | `documents.object_identifier` |
| 4 | Previous number(s) | 12.3% | META | `documents.previous_numbers` |
| 5 | Object type | 13.7% | META | `documents.object_type` |
| 6 | Category | 21.1% | META | `documents.category` |
| 7 | Made by | 5–8% | META (+ PII scan) | `documents.made_by` |
| 8 | Artist/Maker/Manufacturer note | 5.3% | **EMBED** (+ PII scan) | `chunks` |
| 9 | Place made | low | META | `documents.place_made` |
| 10 | Place made notes | 0% | **DROP** (empty) | — |
| 11 | Vessel represented | 88.8% | META → normalize | `documents.ship` / `documents.era` |
| 12 | Description | 20.7% | **EMBED** (+ PII scan) | `chunks` |
| 13 | Model type | <1% | **DROP** | — |
| 14 | Relevance to mandate | ~18.9% | **INTERNAL** (drop) | — |
| 15 | Antique? | ~18.9% | **INTERNAL** (drop) | — |
| 16 | Quality | ~18.9% | **INTERNAL** (drop) | — |
| 17 | Attractiveness | <1% | **INTERNAL/DROP** | — |
| 18 | Display case? | ~18.9% | **INTERNAL** (drop) | — |
| 19 | Measurements | 60.4% | META | `documents.measurements` |
| 20 | Materials | 20.4% | META | `documents.materials` |
| 21 | Donated by | 48.4% | **SENSITIVE** (omit) | — never stored |
| 22 | Condition | ~18.9% | **INTERNAL** (drop) | — |
| 23 | Current condition | ~18.9% | **INTERNAL** (drop) | — |
| 24 | Notes on condition/conservation | 5–8% | **INTERNAL** (drop) | — |
| 25 | Value | 0% | **SENSITIVE** (omit) | — never stored |
| 26 | Appraisals | 13.7% | **SENSITIVE** (omit) | — never stored |
| 27 | Appraisal note | 0% | **SENSITIVE** (omit) | — never stored |
| 28 | History of use | 1.4% | **EMBED** (+ PII scan) | `chunks` |
| 29 | Exhibitions | 8.4% | META (+ PII scan) | `documents.exhibitions` |

**Embedded (4):** Titles, Artist/Maker note, Description, History of use.
**Omitted-sensitive (4):** Donated by, Value, Appraisals, Appraisal note.
**Dropped-internal (8):** Relevance to mandate, Antique?, Quality, Attractiveness,
Display case?, Condition, Current condition, Notes on condition/conservation.
**Dropped-empty (3):** thumbnail, Place made notes, Model type.
**Metadata (10):** the rest.

---

## 7. Embedding strategy

- **Model:** AWS Bedrock **Titan Text Embeddings V2**
  (`amazon.titan-embed-text-v2:0`), output dimension **1024** → `vector(1024)`.
  Bedrock is mandated by CLAUDE.md (single IAM credential path, spend on the AWS
  sandbox, telemetry through CloudWatch/OTel).
- **Distance:** cosine (`vector_cosine_ops`), matching Titan's normalized output.
- **VMM catalogue chunking:** the narrative fields are short and sparse
  (Description 20.7%, History of use 1.4% filled). So a catalogue object is
  embedded as **one composed chunk** — `Title` + `Description` + `History of use`
  + maker note concatenated — rather than many tiny chunks. `source_field =
  'composed'`.
- **External / digitized docs:** longer text, chunked normally (e.g. ~512-token
  windows with overlap), one row per chunk with `source_field = 'body'` and an
  incrementing `chunk_index`.
- **Re-embedding:** `embedding_model` + `embedded_at` per chunk let us migrate
  models or re-embed a subset without ambiguity.

---

## 8. Canonical ship/era mapping

The raw `Vessel represented` is messy (audit §6: 88.8% filled, multi-vessel
rows, one hull under three names). Normalize on ingest into `ship` + `era`:

| Raw vessel text (examples) | `ship` | `era` |
|---|---|---|
| Empress of Japan (I) / 1891 hull | `ship_i` | `na` |
| Empress of Japan (II), 1930–1942 | `ship_ii` | `empress_of_japan` |
| Empress of Scotland, 1942–1957 | `ship_ii` | `empress_of_scotland` |
| Hanseatic (post-1957) | `ship_ii` | `hanseatic` |
| blank / ambiguous (32 blanks) | `undetermined` | `na` |
| clearly another vessel | `other` | `na` |

The canonical mapping table is maintained alongside ingest so the per-ship
coverage KPI and retrieval filtering stay correct. Multi-vessel list rows resolve
to the primary represented vessel (documented per-row in ingest, not here).

---

## 9. Citation chain (origin-aware)

Each retrieved chunk → its `document` → an attributable citation, **branched by
origin**:

- **VMM (`vmm_catalogue` / `vmm_digitized_sample`):** cite `object_identifier`
  + `title` + `public_url` (the `vmmcollections.com/Detail/...` page).
- **External (`external_historical`):** cite `author_publisher` + `title` +
  `source_url` + `license`.

`source_field` records which part of the document the text came from. Titles are
markup-stripped before they enter a citation (audit §6 — 203/285 carry `<i>`).
`retrievable_chunks` (§6) exposes exactly these fields so the agent layer can
build a citation without touching base tables.

---

## 10. Ingest scope filter

`in_scope` marks rows the experience may surface:

- **In scope:** `ship_i`, `ship_ii` (all eras), and any `external_historical` /
  `vmm_digitized_sample` doc about the Empress liners.
- **Default out of scope:** `other` (the 41 non-Empress rows). `undetermined`
  (13 rows) is ingested but defaults `in_scope = FALSE` pending Ashley's
  ship confirmation (audit §7).
- External-source inclusion: must be about the Empress of Japan I/II liners and
  carry a recorded `license` (§3).

---

## 11. Open dependencies & follow-ups

- **Date enrichment (blocks the post-1945 gate).** No structured date exists in
  the source (audit §6). Until a derivation/enrichment step populates
  `voyage_date`, passenger-archival docs stay `NULL` and are excluded by the view
  (fail-closed). Needed before any passenger-name content goes live.
- **External-source selection & licensing.** Pick concrete public/online sources
  and record license/attribution per the §3 rule.
- **Passenger-persona candidate rules.** If real passengers become virtual
  agents, prefer **pre-1945 or fictionalized/composite** identities to sidestep
  descendant sensitivity. Persona *definitions* are owned by the agent/UX track
  (this KB only stores grounding facts).
- **Ashley's open questions (audit §7):** confirm ship for the 13 undetermined
  records; whether passenger names may be used in AI content; voyage dates on
  lists; languages to support.

---

## 12. Out of scope (for issue #10)

- Runnable migration files / Alembic.
- SQLAlchemy ORM models or any `backend/` code.
- RDS + pgvector Terraform provisioning (infra track — Yaoyi).
- The ingest pipeline implementation (separate task, after this schema settles).
- Virtual-agent persona definitions (agent/UX track — Steven).

---

## 13. Validation

The §6 DDL was validated against **Postgres 16 + pgvector**
(`pgvector/pgvector:pg16`, run locally in Docker). All statements created
without error: the `vector` extension, the four enums, both tables, the partial
unique index, the `chk_external_license` CHECK, every metadata/HNSW index, and
the `retrievable_chunks` view.

The privacy gate was also functionally tested by seeding rows and querying the
view:

| Row | `in_scope` | `sensitivity` | `voyage_date` | In `retrievable_chunks`? |
|---|---|---|---|---|
| public, in scope | TRUE | public | — | ✅ yes |
| public, out of scope | FALSE | public | — | ❌ hidden |
| passenger, no date | TRUE | passenger_archival | NULL | ❌ hidden (fail-closed) |
| passenger, pre-1945 | TRUE | passenger_archival | 1938-06-01 | ✅ yes |
| passenger, post-1945 | TRUE | passenger_archival | 1950-06-01 | ❌ hidden |

The `chk_external_license` constraint correctly rejected an `external_historical`
row inserted without a `license`.

To reproduce:

```powershell
docker run --rm -d --name eoj-pg -e POSTGRES_PASSWORD=pw -p 5432:5432 pgvector/pgvector:pg16
# paste the §6 DDL into psql and confirm it creates cleanly:
docker exec -i eoj-pg psql -U postgres -v ON_ERROR_STOP=1 < schema.sql
docker rm -f eoj-pg
```

(HNSW index support requires pgvector ≥ 0.5.0, which the `pg16` image ships.)
