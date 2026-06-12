# Backend — Empress of Japan

FastAPI + LangGraph multi-agent backend with RAG on Postgres + pgvector.

## Application

Requires Python 3.12+. From `backend/`:

```bash
python -m venv .venv
source .venv/Scripts/activate     # Windows (Git Bash); use .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"

cp .env.example .env              # then edit if needed (.env is git-ignored)
uvicorn app.main:app --reload     # serves on http://localhost:8000
```

Health endpoints:

- `GET /health` — liveness (process is up).
- `GET /health/db` — readiness (database is reachable).

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

```bash
alembic upgrade head              # apply migrations to an EMPTY database
alembic revision --autogenerate -m "describe change"   # new migration from model changes
```

> The docker-compose database auto-applies `schema.sql` on first start, so it is
> already at the initial-migration state. To put it under Alembic control
> without re-running the DDL, run `alembic stamp head` once. To exercise
> `alembic upgrade head` from scratch, point `DATABASE_URL` at a fresh database
> that has **not** had `schema.sql` applied.

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
