# Backend — Empress of Japan

FastAPI + LangGraph multi-agent backend with RAG on Postgres + pgvector.

## Application

Requires Python 3.12+. From `backend/`:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # macOS/Linux; on Windows use: Git Bash -> source .venv/Scripts/activate, PowerShell -> .venv\Scripts\Activate.ps1, CMD -> .venv\Scripts\activate.bat
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

### Grounded persona chat

`POST /chat` retrieves the five nearest candidates from the privacy-gated
`retrievable_chunks` view before invoking the selected persona. Claude returns
an internal structured decision with one of three modes:

- `grounded` for historical/factual answers supported by relevant candidates;
- `conversational` for greetings, thanks, and other non-factual persona turns;
- `insufficient_evidence` for factual questions the available records cannot
  support, in which case the persona acknowledges the limitation rather than
  guessing.

When `scene` is supplied, the backend validates that the scene exists and that
the selected persona is available there. The model system prompt is composed as
persona prompt, then scene context prompt, then the grounding policy. Callers may
omit `scene` for persona-only chat; unknown or incompatible scenes are rejected.

```json
{
  "persona_id": "captain_sinclair",
  "scene": "bridge",
  "message": "Where are we?",
  "history": []
}
```

The public response keeps narration separate from evidence:

```json
{
  "persona_id": "captain_sinclair",
  "response": "Spoken narration without footnotes or source markers.",
  "citations": []
}
```

Only sources selected for a grounded answer appear in `citations`; conversational
and insufficient-evidence replies return an empty list. The `response` field
never contains citation numbers or a source list, so it can be sent directly to
voice synthesis. Retrieval failures return `503`, and invalid structured model
output returns `502`; neither path silently falls back to an ungrounded factual
answer.

Lint, format, and test:

```bash
ruff check .
ruff format .
pytest
```

## API and AI Usage Guardrails

These are the initial demo-safe limits for browser and future mobile clients.
They are intentionally conservative until we have load-test data from the AWS
deployment and should be tuned against the operating-cost assumptions from #55.
Treat this section as the contract for #89: implementation can move between
backend code, CloudFront/WAF/API Gateway, or client UX, but the user-visible
limits should stay explicit.

### Request limits

| Surface | Initial limit | Enforced today | Notes |
|---|---:|---|---|
| `POST /chat` | 12 requests/minute per visitor session, 120/hour per public IP | Planned | Enough for a fast museum conversation without letting one browser loop spend the Bedrock budget. |
| `POST /retrieve` | 30 requests/minute per public IP | Partly | `top_k` is capped at `20`; request-rate limiting is a follow-up. |
| `POST /voice/synthesize` | 20 requests/minute per visitor session | Partly | `VOICE_MAX_TEXT_LENGTH` is enforced; Polly audio is cached by text/voice/engine. |
| `WebSocket /voice/transcribe` | One active stream per browser tab; 15 seconds per recording | Partly | `VOICE_MAX_RECORDING_SECONDS = 15` is enforced; concurrent stream caps are a follow-up. |
| `POST /ingest/jobs` | Operator-only, no public traffic | Yes | Requires `X-Admin-Token`; clients cannot provide arbitrary source paths or embedder choices. |

Until an edge rate limiter exists, the frontend should avoid automatic retries
for visitor chat/voice actions. Let visitors explicitly retry after a visible
failure so one flaky network path does not multiply Bedrock, Transcribe, or
Polly calls.

CloudFront is the browser-facing hop in AWS, so backend/ALB per-IP limiting is
not reliable by itself: the backend mostly sees CloudFront egress addresses. Use
backend middleware for session/client-key limits, and use CloudFront WAF
rate-based rules if true client-IP limits become necessary.

### Bedrock chat limits

- **Model:** deployed chat uses the configured Bedrock inference profile
  `BEDROCK_CHAT_MODEL` (`us.anthropic.claude-sonnet-4-6` by default).
- **Input budget:** keep browser-supplied history to the latest **8 turns**
  or roughly **4,000 input tokens**, whichever is smaller. Server-side session
  memory is disabled in AWS until a shared checkpointer lands, so clients own
  history trimming.
- **Output budget:** narrator responses target **800 characters** for spoken
  playback and are hard-capped by `VOICE_MAX_TEXT_LENGTH` (default `1000`
  characters) before they are returned or sent to Polly.
- **Retry target (planned):** the current chat path does not yet configure
  explicit Bedrock retries. The target policy is to retry only throttling or
  transient 5xx/network failures, with bounded exponential backoff and at most
  **2 retries**. Do not retry validation errors, missing persona/scene errors,
  or safety/unsupported-answer responses.
- **Timeout target (planned):** the current chat path does not yet enforce a
  30-second model timeout. Keep a single public-demo chat request under
  **30 seconds** end to end, then surface a friendly retry affordance if
  Bedrock or RDS exceeds that window.

### Failure policy

- Return `400` for invalid public input (`top_k`, blank queries, overlong voice
  text) so clients can fix the request without retrying.
- Return `501` for `session_id` memory while the deployed shared checkpointer is
  unavailable; clients should send compact `history` instead.
- Return `503` for missing runtime configuration or unavailable dependencies
  where the operator needs to fix the deployment. `/chat` uses this status when
  its privacy-gated retrieval dependency is unavailable.
- Target `502` for upstream managed-service failures after bounded retry. The
  voice synthesis path maps known provider failures to `502`; chat returns it
  when Claude fails twice to produce a valid structured grounding decision.

### Signals to inspect

Safe telemetry may include counts, durations, model IDs, persona IDs, result
counts, cache hits, status codes, and error classes. Do **not** export raw
visitor prompts, model responses, retrieved passages, donor data, visitor audio,
or presigned playback URLs.

Required Honeycomb/CloudWatch views:

- request count, latency, and error rate by route and status code;
- `llm.invoke` count/error/latency by `llm.provider` and `llm.model_id`;
- `agent.persona_id` distribution for visitor chat traffic;
- `rag.retrieve` result count and `rag.top_k` distribution, plus candidate count,
  selected citation count, and answer mode from the persona span;
- `voice.synthesize` count, error rate, and `voice.cache_hit` ratio;
- Transcribe WebSocket close/error counts and recording-duration rejections;
- Bedrock, Polly, Transcribe, Fargate, RDS, and CloudWatch cost by service.

Follow-up implementation work:

- backend middleware for session/client-key limits and CloudFront WAF for true
  client-IP rate limits;
- Bedrock client timeout/retry configuration, `502` exception mapping, and
  explicit telemetry;
- token counting/summarization for client-provided chat history;
- an offline groundedness evaluator before exporting grounded/unsupported
  answer counters (#119).

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

# VMM catalogue with local classification enrichment (also local-only):
python -m app.ingest --csv ../data/"export_empress of japan.csv" \
                     --classified ../data/Empress_of_Japan_records_classified.xlsx

# External historical sources from a manifest (e.g. Wikipedia):
python -m app.ingest --external external_sources.json

# Both, with the real embedder:
python -m app.ingest --csv ../data/"export_empress of japan.csv" \
                     --classified ../data/Empress_of_Japan_records_classified.xlsx \
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

**External sources** carry a required `license`, `author_publisher`, and
`source_url`. `external_sources.json` is the committed manifest; each entry
supplies either inline project-authored `text` or a `wikipedia_title` fetched at
run time.

Re-running is idempotent (unchanged rows skipped via `content_hash`; a model
swap re-embeds). Each run logs counts/KPIs (rows in/out, redactions, per-ship
coverage); OTel → Honeycomb/CloudWatch export is an infra-track follow-up.

### Async ingest jobs

The admin-only API can enqueue ingest work to SQS and a separate worker can
consume it. Set `JOBS_QUEUE_URL` to the AWS queue from Terraform, or pair it with
`SQS_ENDPOINT_URL` for LocalStack/elasticmq. The endpoint does not accept
arbitrary file paths or embedder choices from clients; it uses the configured
`INGEST_JOB_EXTERNAL_PATH`, `INGEST_JOB_CSV_PATH`,
`INGEST_JOB_CLASSIFIED_PATH`, and server-side `EMBEDDER`. Paths may be local or
private `s3://` URIs. The worker accepts only values that exactly match its own
configuration and downloads approved S3 objects to ephemeral task storage.

```bash
# submit work through the API
curl -X POST http://localhost:8000/ingest/jobs \
  -H "X-Admin-Token: $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"include_external":true}'

# server-controlled full VMM + classified + external ingest
curl -X POST http://localhost:8000/ingest/jobs \
  -H "X-Admin-Token: $INGEST_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"include_csv":true,"include_external":true}'

# run the worker continuously
python -m app.jobs.worker

# useful for local smoke tests / one batch in CI
python -m app.jobs.worker --once
```

Messages are deleted only after a successful pipeline run. Failures are left on
the queue for SQS retry and DLQ handling.

## Voice endpoints

The voice flow keeps AWS credentials server-side. The browser sends microphone
audio/text to FastAPI; the backend uses the ECS task role for Amazon Transcribe,
Amazon Polly, and the private S3 audio cache from issue #96.

```bash
# synthesize narrator text into a short-lived private S3 playback URL
curl -X POST http://localhost:8000/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"narrator_id":"captain_sinclair","text":"Welcome aboard."}'
```

- `POST /voice/synthesize` accepts `{ "narrator_id", "text" }` and returns
  `{ "audio_url", "cached", "expires_in" }`.
- `WebSocket /voice/transcribe` accepts 16 kHz 16-bit PCM binary chunks and
  returns transcript messages with partial/final state. Send text `end` or
  `{"event":"end"}` to finish the stream.
- Configure `VOICE_CACHE_BUCKET`, `VOICE_CACHE_PREFIX`, `POLLY_ENGINE`,
  `TRANSCRIBE_LANGUAGE_CODE`, `VOICE_AUDIO_URL_TTL_SECONDS`, and
  `VOICE_MAX_TEXT_LENGTH`. Reuse `AWS_REGION`; do not add AWS access keys to
  committed files or frontend config.
- Narrator prompts target responses of at most 800 characters for natural spoken
  playback. If a model response still exceeds `VOICE_MAX_TEXT_LENGTH`, the agent
  trims it at the latest punctuation mark (then whitespace, then the hard limit)
  before returning or storing the response.

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
