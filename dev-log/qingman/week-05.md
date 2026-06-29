# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 5 (June 25 - July 1, 2026)
Date: 2026-06-29

## 1. Task / Goal
- **Issue #38** — [backend] Add **OpenTelemetry distributed tracing
  instrumentation** to the backend so requests can be traced across the API,
  agent/LLM path, database work, ingest stages, and the future SQS worker path.
- The original issue asks for a connected trace spanning **API -> SQS -> worker**,
  but the current backend branch does not yet contain the SQS producer/worker
  implementation. I kept the scope honest: instrumented the backend code that
  exists today and added reusable SQS trace-context helpers so #35 / worker code
  can later connect to the same trace without redesign.
- Export is wired through standard OTLP environment variables so the deployment
  can send traces to the team collector / Honeycomb once the infra side is ready.

## 2. AI Tools Used
Codex. Used it first in planning mode to read the issue through GitHub CLI,
inspect the backend/FastAPI/agent/ingest code, and confirm that the SQS worker
code does not exist in the current branch. Then used Codex to implement the
instrumentation, add tests, run lint/tests, and split the work into separate
commits for easier review.

## 3. Prompts / Agent Workflow
- **Recovered the real issue text first.** `gh issue view 38` failed because the
  default GraphQL query hit a deprecated Projects field, so Codex used
  `gh api repos/YaoyiW27/empress-of-japan-capstone/issues/38` to read the issue
  body directly. That clarified the target: FastAPI + worker auto-instrumentation,
  SQS trace propagation, spans for retrieval/Bedrock/DB, and OTLP export.
- **Checked the repo before coding.** Codex searched `backend/`, `infra/`, and
  remote branches for SQS/worker code. The only SQS implementation present is
  Terraform queue wiring in `infra/terraform/sqs.tf`; there is no backend worker
  entrypoint yet. That changed the implementation from "complete API-to-worker
  trace" to "instrument current backend + add propagation helpers for the future
  worker."
- **Added OTel setup as an app-level concern.** Created `app/observability.py`
  with idempotent OpenTelemetry setup for service metadata, deployment resource
  tags, framework tracing, database tracing, and AWS client tracing.
- **Kept local development safe.** OTel is enabled by default, but spans are not
  exported unless `OTEL_EXPORTER_OTLP_ENDPOINT` is configured. This means local
  tests and development do not require a collector, Honeycomb credential, or AWS
  observability setup.
- **Added manual spans where business stages matter.** Automatic instrumentation
  covers framework/DB/AWS calls, but Codex also added named spans around the
  semantic backend stages: `/chat`, persona execution, LLM invocation, embedding
  batches, ingest rows, document lookup, chunk embedding, and document upsert.
- **Split the commits after implementation.** Instead of one large commit, Codex
  separated the work into four reviewable commits: OTel setup, business-stage
  spans, SQS propagation helpers/tests, and a tiny ruff formatting cleanup.

## 4. Useful Output
- `backend/app/observability.py` — central OTel setup for the backend:
  FastAPI, SQLAlchemy, psycopg, botocore instrumentation, OTLP exporter when
  configured, and no-export local behavior when no endpoint is set.
- `backend/app/config.py` / `backend/.env.example` — new tracing config:
  `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, and
  optional `OTEL_RESOURCE_ATTRIBUTES`.
- `backend/app/main.py` — OTel setup called from the app factory; manual spans
  around `/chat` and `/health/db`.
- `backend/app/agents/graph.py` and `backend/app/agents/llm.py` — spans around
  persona agent execution and LLM calls, including attributes for provider,
  model id, persona id, and message count.
- `backend/app/ingest/embed.py`, `pipeline.py`, and `upsert.py` — spans around
  fake/Bedrock embedding, ingest row processing, document lookup, chunk
  embedding, and DB upsert status.
- `backend/app/tracing/sqs.py` — reusable SQS trace propagation helpers:
  `inject_trace_context`, `extract_trace_context`, and
  `use_extracted_trace_context`, carrying W3C trace context in SQS
  `MessageAttributes`.
- `backend/tests/test_observability.py` — tests that app creation works with
  OTel disabled/enabled and that SQS trace context can be injected/extracted.
- Verification: `ruff check backend` passed; `pytest backend/tests` passed with
  23 passed / 2 skipped. The skipped tests are the existing DB integration tests
  because local Postgres/pgvector was not running.
- Commits:
  - `3a94a08 Add backend OpenTelemetry setup`
  - `947398c Trace backend agent and ingest stages`
  - `1500412 Add SQS trace propagation helpers`
  - `30eec17 Format backend entrypoint imports`

## 5. Human Review / Changes
- **Did not overclaim the worker acceptance criterion.** Since the backend
  worker/producer does not exist yet, this PR should be described as the tracing
  foundation for #38, not a complete API -> SQS -> worker trace. The helper API
  is ready for the worker once #35 lands.
- **Kept secrets and Honeycomb-specific config out of code.** The implementation
  uses standard OTLP env vars and leaves collector/Honeycomb wiring to infra, as
  the issue requested.
- **Chose local-safe defaults.** Missing collector config does not crash the app
  or tests. This was important because teammates should be able to run the
  backend locally without observability infrastructure.
- **Verified behavior instead of only relying on imports.** Ran the backend test
  suite and lint after installing the new OTel dependencies into the local
  virtualenv.
- **Split commits for review.** The final history separates dependency/setup,
  business instrumentation, SQS propagation, and formatting so reviewers can
  inspect each concern independently.

## 6. Reflection
This issue was mostly about making the backend observable without pretending the
whole distributed system exists yet. The useful move was to separate **current
trace value** from **future distributed trace completion**: FastAPI, agent, LLM,
embedding, ingest, and DB spans are valuable immediately, while SQS propagation
is prepared as a small helper layer for the worker once it lands.

The tricky part was avoiding accidental scope creep. The issue title says
distributed tracing across API, queue, and worker, but the actual repo only has
the queue infra, not the worker code. Building a worker just to satisfy tracing
would have mixed two issues together and made review harder. The better outcome
is a clear foundation: current code emits meaningful spans now, and future SQS
producer/consumer code has an obvious way to preserve trace context.

Next improvement: once #35 adds the SQS producer and worker, wire
`inject_trace_context` into `SendMessage` and wrap worker message handling with
`use_extracted_trace_context`, then verify in Honeycomb that one conversation
appears as a connected API -> queue -> worker trace.
