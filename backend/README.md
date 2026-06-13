# Backend — Empress of Japan

FastAPI + LangGraph multi-agent backend with RAG on Postgres + pgvector.

## Application

Requires Python 3.12+. From `backend/`:

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate     # Windows (Git Bash); use .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"

cp .env.example .env              # then edit if needed (.env is git-ignored)
docker compose up -d              # start the local DB (see "Local database" below)
uvicorn app.main:app --reload     # serves on http://localhost:8000
```

Health endpoints:

- `GET /health` — liveness (process is up; no DB needed).
- `GET /health/db` — readiness (database is reachable). Returns 503 if the DB
  is down — start it with `docker compose up -d`.

`DATABASE_URL` is read from the environment / `.env` (never committed — see
CLAUDE.md). It defaults to the local docker-compose database below.

Lint, format, and test:

```bash
ruff check .
ruff format .
pytest
```

### Migrations (Alembic)

`db/schema.sql` is the canonical DDL. The **initial** Alembic migration
(`alembic/versions/0001_initial_schema.py`) is generated from it so the two do
not diverge; Alembic owns migrations from here forward.

**Which command depends on the environment** — does the database already have
the schema, or is it empty?

**Local docker-compose DB → `stamp` (don't `upgrade`).** This DB auto-applied
`schema.sql` on first `docker compose up`, so its tables/enums already exist.
Running `alembic upgrade head` here would try to re-create them and fail with
`type "source_type_enum" already exists`. `stamp` just records that the DB is
already at revision 0001:

```bash
alembic stamp head                # record "already at 0001"; runs no DDL
alembic current                   # verify → 0001_initial (head)
```

**Cloud (AWS RDS) or any fresh/empty DB → `upgrade`.** RDS is provisioned empty
(it does NOT run `schema.sql`), so Alembic builds the schema from scratch — this
is the normal path, and what CI and teammates' new databases use too:

```bash
alembic upgrade head              # run the migration(s) to build the schema
```

**After changing the models (any environment) → author a new migration:**

```bash
alembic revision --autogenerate -m "describe change"   # then commit it; upgrade applies it
```

## Ingest pipeline

Turns source material into rows in `documents` + `chunks` (the six stages in
[`../data/ingest-pipeline.md`](../data/ingest-pipeline.md)): parse → normalize →
**privacy filter** → chunk → embed → upsert. Lives in `app/ingest/`.

```bash
# VMM catalogue CSV (the source CSV is local-only, never committed):
python -m app.ingest --csv "../data/export_empress of japan.csv"

# External historical sources from a manifest (e.g. Wikipedia):
python -m app.ingest --external external_sources.json

# Both, with the real embedder:
python -m app.ingest --csv ../data/"export_empress of japan.csv" \
                     --external external_sources.json --embedder bedrock
```

**Embeddings are pluggable** (`EMBEDDER` env / `--embedder`):

- `fake` (default) — deterministic local vectors, **no AWS needed**. Lets the
  pipeline run and tests pass before Bedrock IAM is provisioned. Not semantic;
  never use for real retrieval.
- `bedrock` — AWS Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`),
  1024-dim. Needs sandbox Bedrock IAM access (coordinate with Yaoyi — CLAUDE.md).

**Privacy (the critical stage).** Donor/valuation/internal columns are never
read (omission); free-text is scanned against a donor-name blocklist built
**in-memory** from the source donor column (never written/committed); an extra
local blocklist file can be passed with `--blocklist`. Passenger-archival rows
stay `voyage_date = NULL` and are excluded fail-closed by `retrievable_chunks`
until the date-enrichment spike lands.

**External sources** carry a required `license` + `author_publisher` (schema
CHECK). `external_sources.json` is the committed manifest; each entry supplies
either inline `text` or a `wikipedia_title` fetched at run time.

Re-running is idempotent (unchanged rows skipped via `content_hash`; a model
swap re-embeds). Each run logs counts/KPIs (rows in/out, redactions, per-ship
coverage); OTel → Honeycomb/CloudWatch export is an infra-track follow-up.

## Local database (Postgres + pgvector)

A local dev database, with the knowledge base schema applied automatically on
first start. Requires Docker Desktop (WSL2 backend on Windows).

```bash
# from backend/
docker compose up -d        # start; schema applies on first run
docker compose ps           # check health
docker compose down         # stop, keep data
docker compose down -v      # stop and wipe data (schema re-applies next `up`)
```

Connection string:

```
postgresql://postgres:postgres@localhost:5432/empress
```

Connect with psql inside the container:

```bash
docker compose exec db psql -U postgres -d empress
```

Quick check that the schema is present:

```bash
docker compose exec db psql -U postgres -d empress -c "\dt"     # tables
docker compose exec db psql -U postgres -d empress -c "\dv"     # views
```

You should see the `documents` and `chunks` tables and the
`retrievable_chunks` view.

## Schema

- **Design + rationale:** [`../data/schema.md`](../data/schema.md) — privacy
  model, column-fate mapping, embedding strategy, citation chain.
- **Runnable DDL (source of truth):** [`db/schema.sql`](db/schema.sql) — the
  executable mirror of `schema.md` §6, auto-applied by docker-compose.

> **Alembic** is now wired up (see [Migrations](#migrations-alembic) above). The
> initial migration was generated from `db/schema.sql`, which stays the canonical
> DDL; Alembic owns migrations going forward.

The cloud database is **AWS RDS** (infra/ track) — this setup is local-dev only.
