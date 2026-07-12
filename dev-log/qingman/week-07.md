# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 7 (July 9 - July 15, 2026)
Date: 2026-07-09 to 2026-07-11

## 1. Task / Goal
- **Issue #125 / PR #134** — prevent narrator responses from exceeding
  `VOICE_MAX_TEXT_LENGTH` before they reach `/voice/synthesize`.
- Keep spoken responses concise while preserving the same text in the API
  response and conversation history.
- **Issue #126** — prevent the ingest worker from reporting success and deleting
  its SQS message when the database is unreachable.
- Preserve row-level isolation for malformed sources while allowing datastore
  outages to trigger the existing SQS retry and DLQ behavior.

## 2. AI Tools Used
Codex was used to inspect the agent and voice paths, implement the response
length handling, add tests and documentation, and incorporate review feedback.
It was also used to inspect Issue #126 and trace the ingest exception path from
per-source processing through the SQS worker.

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

## 5. Human Review / Changes
- Kept `/voice/synthesize` validation unchanged and fixed the response earlier in
  the agent path.
- Addressed review feedback about generic whitespace handling, leading/trailing
  whitespace, and clearer virtualenv activation instructions.
- Chose explicit datastore exception categories instead of failing every job
  that writes zero rows, so a batch containing only invalid content keeps its
  intended source-level error semantics.

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
