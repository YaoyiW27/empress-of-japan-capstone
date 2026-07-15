# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 7 (July 9 - July 15, 2026)
Date: 2026-07-09 to 2026-07-13

## 1. Task / Goal
- **Issue #125 / PR #134** — prevent narrator responses from exceeding
  `VOICE_MAX_TEXT_LENGTH` before they reach `/voice/synthesize`.
- Keep spoken responses concise while preserving the same text in the API
  response and conversation history.
- **Issue #126** — prevent the ingest worker from reporting success and deleting
  its SQS message when the database is unreachable.
- Preserve row-level isolation for malformed sources while allowing datastore
  outages to trigger the existing SQS retry and DLQ behavior.
- **Issue #136** — support the complete VMM CSV, classified workbook, and
  external-source ingest in AWS while keeping source selection server-controlled.
- Use private S3 only to deliver approved raw inputs to the ECS worker; continue
  storing documents, metadata, and Titan embeddings in PostgreSQL/pgvector.
- Verify the merged full-ingest path against the deployed AWS environment with
  the reviewed VMM CSV, classified workbook, and external-source manifest.
- **Issue #69** — connect LangGraph persona chat to the privacy-gated retrieval
  layer while keeping spoken narration separate from citations.
- Let personas answer ordinary conversation naturally, ground supported
  historical answers, and abstain in character when the available records do
  not support a factual answer.

## 2. AI Tools Used
Codex was used to inspect the agent and voice paths, implement the response
length handling, add tests and documentation, and incorporate review feedback.
It was also used to inspect Issue #126 and trace the ingest exception path from
per-source processing through the SQS worker.
For Issue #136, Codex traced the API payload, worker, ECS task definitions, IAM,
and existing local ingest pipeline before implementing the AWS input flow.
For Issue #69, Codex inspected the graph/retrieval seams, probed the deployed
`/retrieve` endpoint, traced its failure through CloudWatch, and implemented the
retrieval fix and structured persona response contract with regression tests.

## 3. Prompts / Agent Workflow
- Added an 800-character soft target to persona prompts.
- Added a hard limit based on the configured `VOICE_MAX_TEXT_LENGTH`.
- Truncated long responses at punctuation first, then whitespace, then the hard
  character boundary.
- Wired the limit into both stateless and session-memory agent graphs.
- Updated the implementation after review to strip surrounding whitespace and
  recognize newlines/tabs as truncation boundaries.
- Identified that `ingest_vmm` and `ingest_external` caught every exception,
  including SQLAlchemy connection failures, and treated them as source errors.
- Changed connection, disconnection, interface, and pool-timeout exceptions to
  escape the row-level handler so `process_envelope` fails and the worker does
  not delete the SQS message.
- Added regression coverage confirming that datastore outages propagate,
  malformed sources are still skipped, and failed jobs retain their message.
- Extended the async job payload with the classified workbook and configured the
  admin endpoint to enqueue one full VMM + classified + external job.
- Added exact server-side allowlist validation so clients or forged queue
  messages cannot select arbitrary paths, S3 buckets/keys, or embedders.
- Added worker-side download of approved `s3://` inputs to ephemeral task
  storage before the existing pipeline generates Titan V2 embeddings and writes
  them to RDS/pgvector.
- Added a private encrypted/versioned source bucket and least-privilege worker
  IAM access limited to the two approved objects. Raw inputs are not baked into
  the image or stored in Terraform state.
- Uploaded the reviewed CSV and classified workbook to the exact allowlisted
  keys in the KMS-encrypted ingest-source bucket, then submitted one full ingest
  job through the admin-only API.
- Followed the ECS worker through successful external-source fetches and job
  completion, then verified that both the source queue and DLQ returned to zero
  visible and zero in-flight messages.
- Found that deployed unfiltered retrieval failed because PostgreSQL could not
  infer nullable bind parameter types. Added explicit casts for both optional
  filters while preserving `retrievable_chunks` as the only query surface.
- Wired each persona node to retrieve the latest visitor turn and provide the
  top five candidates to Claude as untrusted archival data.
- Added structured `grounded`, `conversational`, and `insufficient_evidence`
  modes. The model selects supporting internal source IDs only for grounded
  answers; the API validates them and returns source metadata separately from
  the voice-safe response.
- Added fail-closed behavior for unavailable retrieval and repeatedly invalid
  structured model output, plus prompt-injection and inline-citation guards.

## 4. Useful Output
- `backend/app/agents/graph.py` — prompt guidance and `truncate_response` logic.
- `backend/app/main.py` — passes the configured voice limit into agent graphs.
- `backend/tests/test_agents.py` — English/Chinese punctuation, whitespace, hard
  truncation, prompt guidance, and history consistency coverage.
- `backend/README.md` — documented narrator response-length behavior.
- Verification: 64 tests passed, 3 skipped; Ruff passed for changed Python files.
- `backend/app/ingest/pipeline.py` — distinguishes datastore availability
  failures from recoverable per-source failures.
- `backend/tests/test_ingest_unit.py` — covers outage propagation and malformed
  source isolation.
- `backend/tests/test_jobs.py` — verifies a failed ingest job does not delete its
  SQS message.
- Issue #126 verification: 25 targeted tests passed; Ruff and diff checks passed
  for the changed files. The broader run had 58 passed and 3 skipped; two
  unrelated chat tests could not refresh AWS SSO credentials in the local
  network environment.
- `backend/app/jobs/payloads.py`, `worker.py`, and `main.py` — classified input,
  server-controlled job construction, S3 materialization, and telemetry counts.
- `infra/terraform/ingest.tf` and `ecs.tf` — private source bucket, exact-object
  IAM policy, and API/worker environment configuration.
- `backend/README.md` and `infra/README.md` — full-ingest setup, upload, enqueue,
  idempotency, queue, and DLQ verification procedures.
- Issue #136 verification: 33 targeted tests passed; changed Python files passed
  Ruff and `git diff --check`. The full suite had 62 passed and 3 skipped; the
  same two AWS SSO-dependent chat tests failed in the local network environment.
  Terraform CLI was unavailable locally, so `terraform fmt/validate` and live
  AWS ingest verification remain deployment steps.
- Split the work into `f8299c4` (backend full-ingest job support) and `2c89786`
  (private AWS ingest inputs and infrastructure documentation).
- Live AWS verification completed successfully: 296 documents inserted (285
  VMM and 11 external), 336 chunks embedded with Titan Text Embeddings V2, 120
  redactions, 54 out-of-scope rows, and zero errors. The SQS source queue and
  DLQ both reported zero visible and zero in-flight messages afterward.
- Issue #69 implementation updated the retrieval SQL, LangGraph state/persona
  node, Bedrock structured-output adapter, `/chat` response model, tests, and
  architecture/operator documentation.
- Issue #69 verification: 32 targeted agent/retrieval tests passed; the complete
  backend suite passed with 82 tests and 3 integration skips. Ruff passed for
  every changed Python file, and `git diff --check` passed.

## 5. Human Review / Changes
- Kept `/voice/synthesize` validation unchanged and fixed the response earlier in
  the agent path.
- Addressed review feedback about generic whitespace handling, leading/trailing
  whitespace, and clearer virtualenv activation instructions.
- Chose explicit datastore exception categories instead of failing every job
  that writes zero rows, so a batch containing only invalid content keeps its
  intended source-level error semantics.
- Clarified after review that S3 is an input transport for the raw CSV/workbook,
  not an embedding store. The final 1024-dimensional vectors still live in the
  PostgreSQL pgvector columns.
- Kept source uploads out of Terraform because managing private source contents
  as Terraform objects would place their data or hashes in infrastructure state.
- Kept citations out of narrator prose because the same response is synthesized
  as speech. The backend exposes a separate structured list only when Claude
  identifies a candidate as direct support for the answer.
- Avoided a fixed similarity threshold: the small knowledge base always returns
  nearest neighbours, even for greetings. One structured persona call instead
  decides whether the turn is conversational, grounded, or a factual request
  with insufficient evidence.

## 6. Reflection
Prompt guidance improves normal model output, but a deterministic backend limit
is still necessary because voice synthesis has a strict request-size contract.
Applying the same final text to the response and history avoids conversation
state drifting from what the visitor actually hears.

Issue #126 showed that broad exception handling can undermine queue guarantees:
the worker's retry/DLQ design only works when infrastructure failures reach the
message-processing boundary. Error handling should therefore classify failures
by recovery scope—source-local errors can be skipped, while shared datastore
failures must fail the job.

Issue #136 reinforced the distinction between source delivery and knowledge-base
storage. A deployed worker needs durable, private access to raw files, while the
processed knowledge and semantic vectors belong in PostgreSQL/pgvector. Using
separate controls for those stages also makes least privilege clearer: the API
can enqueue only configured sources, and the worker can read only the approved
objects before writing to the database.

The live run also showed why deployment verification must include observable
outcomes rather than only a successful enqueue response. Worker completion
counts, embedding totals, redaction/out-of-scope metrics, and empty source/DLQ
queues together demonstrated that the full job completed without silently
dropping work.

Issue #69 reinforced that retrieval and grounding are separate decisions. A
nearest-neighbour result is not automatically evidence. Preserving a normal
persona response for conversation, requiring explicit source selection for
historical claims, and abstaining when records are insufficient provides a more
honest experience without making every visitor exchange sound like a footnote.
