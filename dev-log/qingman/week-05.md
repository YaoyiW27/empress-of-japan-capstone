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
- Export is now aligned with PR #90's infra baseline: the backend uses the
  existing `app.telemetry` initializer and OTLP/HTTP collector sidecar endpoint
  (`127.0.0.1:4318/v1/traces`) instead of adding a separate gRPC exporter path.
- Opened **#98** as the explicit follow-up for the remaining API -> SQS -> worker
  connected trace once #35's backend worker/producer code exists.
- **Issue #35** — added the backend async ingest producer/worker path that #38
  and #98 had been waiting on: the API can enqueue ingest jobs to SQS, and a
  separate worker process can consume and run the existing ingest pipeline.
- After merging the latest `main`, I connected the new #35 SQS producer/worker
  to the existing `app.tracing.sqs` helpers. This implements the code-level
  trace-context handoff for #98, but #98 still needs a real SQS/LocalStack +
  Honeycomb end-to-end validation before I would call it fully complete.

## 2. AI Tools Used
Codex. Used it first in planning mode to read the issue through GitHub CLI,
inspect the backend/FastAPI/agent/ingest code, and confirm that the SQS worker
code does not exist in the current branch. Then used Codex to implement the
instrumentation, add tests, run lint/tests, split the work into separate
commits for easier review, and then respond to Copilot + Yaoyi review feedback.
Later in the week I used Codex again to implement #35, split the async worker
work into focused commits, merge the updated `main`, resolve conflicts, and
verify that the new worker code still passes alongside the OpenTelemetry changes.

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
- **Consolidated OTel setup with the infra baseline.** After PR #90 landed on
  main, the backend already had `app/telemetry.py` for OTLP/HTTP export to the
  collector sidecar. I kept that initializer as the single source of truth and
  layered the backend-owned manual spans on top.
- **Avoided duplicate instrumentation.** Removed the separate `app/observability.py`
  initializer from my first cut and kept PR #90's FastAPI + SQLAlchemy setup.
  Also did not keep psycopg instrumentation, because the backend currently goes
  through SQLAlchemy and instrumenting both layers could create duplicate DB spans.
- **Kept local development safe.** OTel remains disabled by default in settings,
  so local tests and development do not require a collector, Honeycomb
  credential, or AWS observability setup.
- **Added manual spans where business stages matter.** Automatic instrumentation
  covers framework/DB/AWS calls, but Codex also added named spans around the
  semantic backend stages: `/chat`, persona execution, LLM invocation, embedding
  batches, ingest rows, document lookup, chunk embedding, and document upsert.
- **Responded to review feedback.** Copilot caught small correctness issues in
  the initial helper/test code, and Yaoyi caught the larger integration issue:
  PR #90 had already established the collector-sidecar telemetry path on main.
  I accepted both sets of feedback and updated the branch accordingly.
- **Implemented the missing worker path for #35.** Codex inspected the existing
  ingest CLI and SQS Terraform references, then added a shared job payload model,
  an SQS queue adapter, a `python -m app.jobs.worker` consumer, and a
  `POST /ingest/jobs` endpoint that returns `202 Accepted` after publishing a
  job.
- **Kept the async worker scoped to jobs, not per-row parallelism.** The work
  distributes ingest at the job level: the API is decoupled from long-running
  ingest, and multiple workers can consume from the queue. It does not split one
  CSV or manifest into many internal sub-jobs yet.
- **Merged updated `main` and resolved conflicts.** The main branch gained the
  finalized OpenTelemetry PR while the worker branch was in progress. The merge
  conflicted in `.env.example` and `backend/app/main.py`; Codex kept both sets
  of settings/imports and then wired the new SQS worker to the existing trace
  propagation helper.

## 4. Useful Output
- `backend/app/telemetry.py` — the centralized OTel setup from PR #90, kept as
  the single initializer for FastAPI + SQLAlchemy tracing and OTLP/HTTP export
  to the collector sidecar. I added parsing for optional
  `OTEL_RESOURCE_ATTRIBUTES`.
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
- `backend/app/jobs/payloads.py` — typed async job payloads for ingest work,
  including validation that each job supplies at least one source (`csv` and/or
  `external`).
- `backend/app/jobs/sqs.py` — SQS-backed queue adapter used by the API producer
  and worker consumer. After merging `main`, it also injects trace context into
  SQS `MessageAttributes` and requests all message attributes on receive.
- `backend/app/jobs/worker.py` — worker entrypoint that polls SQS, runs the
  existing ingest pipeline, deletes messages only after successful processing,
  and leaves failed messages for SQS retry / DLQ handling.
- `backend/app/main.py` — now includes `POST /ingest/jobs` in addition to the
  telemetry setup. The endpoint publishes ingest jobs and returns a `job_id`.
- `backend/tests/test_observability.py` — tests that app creation works with
  OTel disabled/enabled and that SQS trace context can be injected/extracted.
  The SQS propagation test now constructs a valid `SpanContext` directly, so it
  is not order-dependent.
- `backend/tests/test_jobs.py` — tests for missing queue configuration, API job
  enqueueing, and typed SQS message round-tripping with message attributes.
- Verification after #35 and the merge: `ruff check .` passed from `backend/`;
  `$env:CHAT_MODEL='stub'; pytest` passed with 26 passed / 2 skipped. The
  skipped tests are the existing DB integration tests because local
  Postgres/pgvector was not running.
- Commits:
  - `3a94a08 Add backend OpenTelemetry setup`
  - `947398c Trace backend agent and ingest stages`
  - `1500412 Add SQS trace propagation helpers`
  - `30eec17 Format backend entrypoint imports`
  - `4e7e257 Address OTel review feedback`
  - `0f9a160 Merge remote-tracking branch 'origin/main' into alina/opentelemetry`
  - `9125c82 feat: add async ingest job worker`
  - `dd764d7 chore: fix backend entrypoint lint`
  - `27b5a23 Merge branch 'main' into alina/ingest-worker`

## 5. Human Review / Changes
- **Moved the remaining distributed-trace work into #98.** Since the backend
  worker/producer does not exist yet, #98 now tracks the API -> SQS -> worker
  connected trace after #35 lands. That lets PR #97 close #38 for the backend
  tracing foundation while keeping the missing worker path visible.
- **Kept secrets and Honeycomb-specific config out of code.** The backend reads
  the settings that PR #90 wires from ECS/Secrets Manager; no Honeycomb secret is
  committed.
- **Accepted the exporter-protocol correction.** The first cut used an OTLP/gRPC
  exporter. Yaoyi pointed out that main uses an OTLP/HTTP collector endpoint at
  `127.0.0.1:4318/v1/traces`, so I consolidated on `app.telemetry` and removed
  the duplicate gRPC initializer.
- **Accepted the DB-span correction.** Kept SQLAlchemy instrumentation only; did
  not add psycopg instrumentation because the backend does not currently make
  direct psycopg calls.
- **Chose local-safe defaults.** Missing collector config does not crash the app
  or tests. This was important because teammates should be able to run the
  backend locally without observability infrastructure.
- **Verified behavior instead of only relying on imports.** Ran the backend test
  suite and lint after installing the new OTel dependencies into the local
  virtualenv.
- **Split commits for review.** The final history separates dependency/setup,
  business instrumentation, SQS propagation, and formatting so reviewers can
  inspect each concern independently.
- **Kept #98 status honest after #35.** The code-level API -> SQS -> worker trace
  handoff is now wired because the worker exists, but I did not mark #98 as fully
  done. It still needs a real queue run and trace verification in Honeycomb or a
  local collector.
- **Installed updated backend dev dependencies to verify the merge.** After
  merging `main`, local tests initially failed because the new OpenTelemetry
  packages were not installed. I ran `python -m pip install -e .[dev]`, then
  reran lint and tests successfully. Pip warned that the global user environment
  now has `protobuf` 7.x, which may conflict with unrelated packages such as
  `mediapipe` or `wandb`; a virtualenv would avoid that cross-project risk.

## 6. Reflection
This issue was mostly about making the backend observable without pretending the
whole distributed system exists yet. The useful move was to separate **current
trace value** from **future distributed trace completion**: FastAPI, agent, LLM,
embedding, ingest, and DB spans are valuable immediately, while SQS propagation
is prepared as a small helper layer for the worker once it lands.

The tricky part was avoiding accidental scope creep while still respecting the
infra work that landed in parallel. The issue title says distributed tracing
across API, queue, and worker, but the actual repo only has the queue infra, not
the worker code. Building a worker just to satisfy tracing would have mixed two
issues together and made review harder. At the same time, PR #90 had already
made real deployment choices about collector sidecars and OTLP/HTTP export, so
the backend PR had to merge main and consolidate instead of creating a second
telemetry stack.

After #35 landed, I did wire `inject_trace_context` into `SendMessage` and wrap
worker message handling with `use_extracted_trace_context`. The remaining #98
work is no longer about missing code structure; it is about real end-to-end
validation: run API -> queue -> worker against SQS/LocalStack with telemetry
enabled, then confirm in Honeycomb or a collector that the trace is connected.
