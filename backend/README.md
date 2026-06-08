# Backend — Empress of Japan

FastAPI + LangGraph multi-agent backend with RAG on Postgres + pgvector.
*(App code is scaffolded incrementally — this README currently covers the local
database.)*

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

> When the app adds **Alembic**, generate the *initial* migration from
> `db/schema.sql` so the two do not diverge. `db/schema.sql` stays the canonical
> DDL until then.

The cloud database is **AWS RDS** (infra/ track) — this setup is local-dev only.
