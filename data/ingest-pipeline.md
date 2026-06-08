# Ingest Pipeline — Outline

> **Status:** Design outline (issue #12). Describes how source rows flow into the
> knowledge base. **This is a design sketch, not an implementation** — the
> pipeline code, orchestration schedule, and Alembic migrations are follow-ups
> (see §10).
> **Author:** Alina (Qingman Li) · **Track:** Multi-Agent Backend & Data
> **Depends on:** [data/schema.md](./schema.md) (the target schema, #10) and
> [data/audit-notes.md](./audit-notes.md) (source shape + data-quality flags, #9).

> **Note on scope vs the original issue.** Issue #12 listed *"PII tagging (donor
> flag)"*. The settled schema (#10) takes a stronger stance: donor PII and
> valuations are **dropped at ingest and never stored**, not tagged. This doc
> follows the schema — see §5.

---

## 1. Purpose

Define the stages that turn a source row (a VMM catalogue record, a digitized
sample, or an external historical document) into rows in `documents` + `chunks`,
ready for RAG retrieval — applying the privacy, normalization, and citation rules
from the schema along the way.

---

## 2. Pipeline overview

```
  source (CSV / sample / external)
        │
        ▼
  [1] Parse & load        — read rows, fix encoding, strip <i> markup
        │
        ▼
  [2] Normalize & map     — column-fate mapping; vessel → ship/era; material_type
        │
        ▼
  [3] Privacy filter      — DROP donor/valuation/internal cols; redact free-text;
        │                    classify sensitivity; set voyage_date + in_scope
        ▼
  [4] Chunk & compose     — VMM = one composed chunk; external = windowed chunks
        │
        ▼
  [5] Embed (Bedrock Titan V2)  — 1024-dim vectors, batched
        │
        ▼
  [6] Upsert into pgvector — documents then chunks; idempotent on content_hash
```

Implementation language: **Python** (same stack as the FastAPI backend).

---

## 3. Source inputs

The pipeline is multi-source (schema §3). This issue focuses on the **VMM
catalogue CSV**, but the same stages apply to all three `source_type`s:

| Source | Stage differences |
|---|---|
| `vmm_catalogue` | Full §2 path; CSV is the source of truth (audit §1 — prefer CSV + markup strip over the XLSX). |
| `vmm_digitized_sample` | Same path; per-item metadata may be sparse; carries the passenger-archival sensitivity. |
| `external_historical` | No VMM columns; richer body text → normal chunking (§4); **must** carry a `license` (schema CHECK). |

---

## 4. Stage 1 — Parse & load

- Read the VMM **CSV** (not the XLSX) as the canonical export — audit §1 (markup
  handling differs between the two; pick one to avoid double-ingest).
- Confirm **UTF-8** round-trip; non-ASCII place/ship names present (audit §6).
- **Strip literal `<i>…</i>` markup** from titles before anything downstream —
  needed for both embedding and citations (audit §6: 203/285 affected).
- Validate the primary key: `Object identifier` is 285 unique, 0 blank
  (audit §4) → maps to `documents.object_identifier`.

## 5. Stage 2 — Normalize & map

Apply the **column-fate mapping** (schema §6b) — only a curated subset is kept:

- **Keep as `documents` metadata:** object_identifier, object_type, category,
  materials, measurements, place_made, made_by, previous_numbers, exhibitions.
- **EMBED fields held for Stage 4:** Titles, Description, History of use,
  Artist/Maker note.
- **Normalize the vessel key** into `ship` + `era` via the canonical mapping
  (schema §8): handles the 32 blanks → `undetermined`, multi-vessel rows, and
  the one hull under three names (Japan / Scotland / Hanseatic).
- **Derive `material_type`** (menu, passenger_list, model, …) from the audit's
  material classification (audit §3).
- Compute `content_hash` over the normalized source content (for idempotency, §9).

## 6. Stage 3 — Privacy filter (the critical stage)

Three mechanisms, matching schema §4:

1. **Drop, don't tag.** Donor (`Donated by`), valuation (`Value`, `Appraisals`,
   `Appraisal note`), and internal-curatorial columns are **never read into the
   document row** — there is no column to populate. (Supersedes the issue's
   "donor flag" wording.)
2. **Free-text PII redaction.** Every EMBED / free-text META value passes a
   donor-name redaction scan **before** it lands. The blocklist is built from
   **all** free-text fields, not just `Donated by` (audit §5 — names leak into
   Description, Made by, History of use, Exhibitions, maker note).
3. **Sensitivity + gating fields:**
   - Set `sensitivity` = `passenger_archival` for passenger-list content, else
     `public`.
   - Set `voyage_date` from enrichment **if available** (see §11 dependency);
     otherwise NULL → the retrieval view excludes it fail-closed.
   - Set `in_scope` per the ingest filter (schema §10): `other` rows and the 13
     `undetermined` rows default `in_scope = FALSE`.

> **Guardrail:** donor/valuation columns must not appear anywhere downstream —
> not in `documents`, not in `chunks.content`, not in embeddings, not in logs.

## 7. Stage 4 — Chunk & compose

- **VMM catalogue object → one composed chunk** (schema §7): concatenate
  `Title` + `Description` + `History of use` + maker note, `source_field =
  'composed'`. The narrative fields are too sparse to chunk individually
  (Description 20.7%, History of use 1.4% filled — audit §2).
- **External / longer docs → windowed chunks** (e.g. ~512 tokens with overlap),
  `source_field = 'body'`, incrementing `chunk_index`.
- Skip empty composed text (an object with no narrative content contributes
  metadata to `documents` but no `chunks` row).

## 8. Stage 5 — Embed (Bedrock Titan V2)

- Model: **`amazon.titan-embed-text-v2:0`** via the **AWS Bedrock SDK**
  (CLAUDE.md mandates Bedrock over the direct Anthropic API — single IAM path,
  sandbox spend, OTel/CloudWatch telemetry).
- Output dimension **1024** → `chunks.embedding vector(1024)`.
- **Batch** chunk texts to limit Bedrock round-trips; respect throttling/retries.
- Record provenance per chunk: `embedding_model`, `embedded_at` (schema §7) so a
  model swap can re-embed a subset unambiguously.

## 9. Stage 6 — Upsert into pgvector

- Insert/update `documents` first, then its `chunks` (FK + `ON DELETE CASCADE`).
- **Idempotency:** key catalogue docs on `object_identifier`; use `content_hash`
  to skip rows whose source content is unchanged since the last run.
- **Re-embedding:** if `embedding_model` differs from the target model, re-embed
  and replace that document's chunks (delete-then-insert within a transaction).
- Wrap per-document writes in a transaction so a failure leaves no partial doc.

---

## 10. Idempotency, failure handling & observability

- **Re-runnable:** unchanged rows (matching `content_hash`) are skipped; changed
  rows replace their chunks. Safe to re-run the whole export.
- **Row-level errors** are logged and skipped, not fatal to the batch (one bad
  row shouldn't abort 285).
- **Counts / KPIs** emitted per run: rows in/out, dropped-out-of-scope,
  redactions applied, chunks embedded, and the **per-ship coverage** KPI
  (audit §3) — surfaced via OTel → Honeycomb/CloudWatch (infra track).

## 11. Open dependencies

- **`voyage_date` enrichment** blocks the passenger post-1945 gate (audit §6 —
  no structured date in source). Until it exists, passenger-archival docs stay
  NULL-dated and are excluded fail-closed. Prerequisite before passenger content
  goes live.
- **Donor-name blocklist source** for Stage 3 redaction — derive from the
  `Donated by` values *locally* (never committed) plus known patterns.
- **External-source selection + licensing** for `external_historical` ingest.
- Ashley's open questions (audit §7): ship confirmation for the 13 undetermined
  records; passenger-name usage; voyage dates on lists.

## 12. Out of scope (for issue #12)

- The pipeline implementation (Python code) and its tests.
- Orchestration / scheduling (one-shot script vs job runner).
- Alembic migrations and the backend DB connection wiring.
- Embedding-model benchmarking.
