# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 3 (June 11 – June 17, 2026)
Date: 2026-06-12

## 1. Task / Goal
- **Issue #27** — [backend] Scaffold the FastAPI app + SQLAlchemy + Alembic so
  the ingest pipeline, RAG retrieval, and agent layers have an application to
  build on. `backend/` previously held only the local DB tooling (#24) — no app
  code. Concretely: FastAPI skeleton with a health endpoint, Python project
  setup, SQLAlchemy engine/session + models for `documents` and `chunks`, and
  **Alembic** with the *initial migration generated from `backend/db/schema.sql`*
  so the two don't diverge.
- **Issue #28** — [data] Implement the ingest pipeline (the six stages outlined
  in #12): parse the VMM CSV → normalize via the column-fate map → **privacy
  filter** (drop donor/valuation, redact stray names, set sensitivity/scope) →
  chunk → embed (Bedrock Titan V2) → idempotent upsert into pgvector. Extended
  the design slightly to also ingest **external historical material** (e.g.
  Wikipedia) through the `external_historical` source type the schema already
  supports.

## 2. AI Tools Used
Claude Code (Opus). For #27, used to scaffold the app to repo conventions and
**verify** `alembic upgrade head` reproduces `schema.sql` exactly. For #28, used
in a stage-by-stage build with two upfront decisions made explicit (pluggable
embedder vs Bedrock-only; external-source scope), then **run end-to-end against
a real pgvector container** with the actual 285-row export to prove the privacy
guardrail and idempotency hold on real data.

## 3. Prompts / Agent Workflow
- **Grounded in the existing schema first** — had Claude read `db/schema.sql`,
  the docker-compose stack, `CONTRIBUTING.md`, and `CLAUDE.md` before writing
  anything, so the scaffold matched the canonical DDL and the team's branch/PR +
  secrets rules rather than generic defaults.
- **Built the FastAPI skeleton as layers** — `config.py` (pydantic-settings
  reading `DATABASE_URL` from env/`.env`, never committed), `db.py` (SQLAlchemy
  2.0 engine + session, `get_db` dependency), `main.py` (app factory + `/health`
  liveness and `/health/db` readiness endpoints).
- **Mirrored the schema into ORM models** — `app/models.py` written in
  SQLAlchemy 2.0 style (`DeclarativeBase` + `Mapped`) column-for-column against
  `schema.sql`: the four enums, `documents` (incl. JSONB metadata, the
  `chk_external_license` check, the partial unique index on `object_identifier`),
  and `chunks` (the `vector(1024)` column, HNSW `vector_cosine_ops` index, FK
  cascade, `(document_id, chunk_index)` uniqueness).
- **Hand-wrote the initial migration instead of autogenerating it** — because
  `--autogenerate` can't reliably reproduce the HNSW index, the
  `retrievable_chunks` view, the partial unique index, or the CHECK constraint,
  the `0001` migration mirrors `schema.sql` statement-for-statement. Wired
  `alembic/env.py` to read the URL from `app.config` (not `alembic.ini`) and
  point at the models' metadata so post-initial migrations can autogenerate.
- **Verified parity, didn't assume it** — had Claude spin up a throwaway
  `pgvector/pgvector:pg16` container with two empty databases, apply `schema.sql`
  to one and `alembic upgrade head` to the other, then `pg_dump --schema-only`
  both and diff. Also exercised `/health` and `/health/db` against the migrated
  DB through the FastAPI test client.
- **(#28) Decided the forks before coding.** Bedrock IAM with Yaoyi isn't ready,
  so rather than block the PR I built a **pluggable `Embedder`**: a real
  `BedrockTitanEmbedder` plus a deterministic `FakeEmbedder` (1024-dim, hash-seeded,
  L2-normalized) selected by env — the pipeline runs and tests pass today, and
  flips to Bedrock with no code change. Scoped the external feature to a
  manifest-driven scaffold + one real Wikipedia entry, not a general web crawler.
- **(#28) Built privacy as its own stage, grounded in the audit.** Donor/
  valuation/internal columns are never read (omission); a `DonorRedactor`
  blocklist is built **in-memory** from the source donor column (never written),
  then scrubs the EMBED/META free-text the audit (§5) flagged as name-leaky.
- **(#28) Ran it for real, twice.** Against the live 285-row export with the fake
  embedder: 285 inserted / 285 chunks / **120 redactions** / 0 errors; re-run
  skipped all 285 (idempotent on `content_hash`). Confirmed via SQL that no donor
  value appears in any title/metadata/chunk, and that `retrievable_chunks` returns
  public catalogue content while passenger rows stay hidden (NULL-dated, fail-closed).

## 4. Useful Output
- `backend/pyproject.toml` — project + deps (FastAPI, Uvicorn, SQLAlchemy 2.0,
  psycopg v3, pgvector, Alembic, pydantic-settings) and a `dev` extra (ruff,
  pytest, httpx); ruff + pytest config consolidated here.
- `backend/app/` — the FastAPI skeleton: `config.py`, `db.py` (engine with a
  connect timeout), `main.py` (`/health` liveness + `/health/db` readiness that
  fails fast with a 503 when the DB is down), and `models.py` mirroring `schema.sql`.
- `backend/alembic/` + `alembic.ini` — Alembic wired to app settings, with
  `versions/0001_initial_schema.py` generated from `schema.sql`. Alembic takes
  over migrations from here; `schema.sql` stays the canonical DDL.
- `backend/.env.example` — documents `DATABASE_URL` (real `.env` stays
  git-ignored); `backend/tests/test_health.py` — health smoke test.
- `.gitignore` update — un-ignored `.env.example` (the `.env.*` rule was
  swallowing it) and added `*.egg-info/` / `.ruff_cache/` (see §5).
- `backend/README.md` — added an Application section (setup/run/lint/test) and a
  Migrations section, including the `alembic stamp head` note for the
  docker-compose DB that already auto-applies `schema.sql`.
- **Verification result (#27)** — `pg_dump` diff of the schema.sql DB vs the
  `alembic upgrade head` DB is identical except pg_dump's random per-session
  `\restrict` tokens; tables, enums, indexes (incl. HNSW), and the
  `retrievable_chunks` view all match. `ruff` + `pytest` green.
- `backend/app/ingest/` (#28) — the six-stage pipeline: `parse`, `normalize`
  (column-fate map, ship/era, material_type, content_hash), `privacy`
  (omission + `DonorRedactor` + gating), `chunk` (composed VMM / windowed
  external), `embed` (pluggable Bedrock/fake), `upsert` (idempotent, re-embed on
  model change), `sources` (VMM CSV + external manifest incl. Wikipedia fetch),
  and a `pipeline` + `__main__` CLI emitting counts/KPIs.
- `backend/external_sources.json` (#28) — committed external-source manifest
  (one Wikipedia entry, CC BY-SA 4.0), proving the `external_historical` path.
- **Tests (#28)** — 8 unit tests (no DB) + 2 DB-backed integration tests
  (privacy/idempotency + external-into-view), guarded to skip fast when no DB.
  13 tests green; ingest runs verified against a real pgvector container.

## 5. Human Review / Changes
- **Caught `.env.example` being git-ignored.** The existing `.env.*` rule
  matched `.env.example` too, so the committable template would have been
  silently dropped. Added a `!.env.example` exception and verified with
  `git check-ignore` that the real `.env` stays blocked while the example is
  trackable. (Third `.gitignore` near-miss in three weeks — see Reflection.)
- **Refused to autogenerate the initial migration.** Letting Alembic
  autogenerate `0001` from the models would have quietly missed the HNSW index,
  the view, the partial index, and the CHECK — diverging from `schema.sql` on
  day one. Hand-wrote it to mirror the canonical DDL instead.
- **Verified parity rather than trusting "looks right."** Diffed two real
  databases (schema.sql vs `alembic upgrade head`) to prove they produce the
  same schema — the acceptance criterion — instead of eyeballing the migration.
- **Kept secrets out.** `DATABASE_URL` is read from env/`.env`; `alembic.ini`
  carries no URL (env.py pulls it from settings); confirmed no venv, egg-info,
  or secret files were staged.
- **(#27) Found a hang by actually running the app, not just the tests.** Hitting
  `/health/db` in the browser with the DB stopped spun forever — the engine had
  no connect timeout, so it waited indefinitely on a dead port. Added
  `connect_timeout=5` to the engine and made `/health/db` return a clean **503
  ("database unreachable")** instead of a 500 traceback, with a hint to run
  `docker compose up -d`. Also added that step (and the 503 note) to the README's
  run instructions, since the failure mode wasn't obvious from the docs.
- **Flagged a cross-track dependency, didn't pull it in.** Bedrock IAM access
  for the embedding/LLM calls is out of scope for the scaffold and needs sorting
  with Yaoyi when ingest/retrieval work starts — noted in the PR/handoff, not
  silently scaffolded.
- **(#28) Caught a row-level-error hole.** First cut fetched Wikipedia inside the
  manifest *generator*, i.e. outside the per-source try/except — so one bad fetch
  would abort the whole external batch. Split manifest-parse (no network) from
  per-entry build (may fetch) so a failure skips just that source, matching the
  "one bad row shouldn't abort the batch" rule.
- **(#28) Fixed a real Wikipedia 403, then a wrong title.** The generic
  User-Agent was blocked (Wikimedia UA policy) → set a compliant UA with contact.
  Then the article title returned an empty extract; probed candidates and found
  `Empress of Scotland (1930)` is the content-rich page for the Ship II hull.
- **(#28) Wouldn't let "fake embeddings" masquerade as real.** The `FakeEmbedder`
  is clearly labelled non-semantic and dev/test-only, so nobody mistakes a local
  run for a real retrieval index before Bedrock lands.

## 6. Reflection
The scaffold itself was routine; the value was in the verification. The Issue's
real risk is **divergence** — three places now describe the same tables
(`schema.sql`, the Alembic migration, the ORM models), and the moment they drift
the app breaks in confusing ways. Proving parity with a `pg_dump` diff turned
"the migration should match" into "it provably does," and establishes the rule
for going forward: `schema.sql` stays canonical, Alembic owns evolution, and
both mirror it. The recurring `.gitignore` near-miss — now three weeks running —
has crossed from coincidence into a clear signal: a pre-commit hook guarding both
`data/*.csv|xlsx` and stray secret/env files would beat catching these by eye.

#28 reinforced the same lesson from #27 — verify on real data, not in the
abstract. Running the actual 285-row export (not a fixture) is what surfaced the
120 real redactions and confirmed the passenger rows stay fail-closed; a unit
test alone would have proven neither. The pluggable embedder was the key unblock:
it decouples "is the pipeline correct?" (answerable now, with the fake) from "is
Bedrock wired up?" (Yaoyi's IAM, pending), so the data track keeps moving without
waiting on infra. **Open blockers, unchanged:** (1) Bedrock sandbox IAM before a
real embedding run; (2) the `voyage_date` enrichment spike before any
passenger-archival content can surface. Next: coordinate Bedrock access, do a
first real-embedding run, and start the RAG retrieval layer on top of
`retrievable_chunks` — which now actually has content (VMM catalogue + a first
external Wikipedia source) to retrieve.
