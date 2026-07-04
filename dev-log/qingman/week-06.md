# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 6 (July 2 - July 8, 2026)
Date: 2026-07-02

## 1. Task / Goal
- **Issue #96** — `[voice/infra] Add Amazon Transcribe input and cached Polly
  narration`. My backend-owned task was the part called out in the issue
  comments: implement or guide the backend endpoints that call Amazon Transcribe
  and Amazon Polly, using Yaoyi's infrastructure settings from PR #100.
- **Issue #30** — `[backend] RAG retrieval layer (vector search over
  retrievable_chunks + citations)`. After the voice work, I picked up the first
  queryable RAG capability: embed an incoming question, search only the
  privacy-gated `retrievable_chunks` view, and return grounded chunks with
  origin-aware citations.
- The target backend contract is:
  - `WebSocket /voice/transcribe` — browser sends short PCM microphone chunks;
    backend streams them to Amazon Transcribe and returns partial/final
    transcript messages.
  - `POST /voice/synthesize` — frontend sends narrator text; backend synthesizes
    it with Amazon Polly, caches the MP3 in private S3, and returns a short-lived
    presigned playback URL.
- Security and cost guardrails were the main constraints: no AWS credentials in
  frontend code or committed files, no raw visitor microphone recordings
  retained, server-controlled narrator-to-voice mapping, deterministic cache keys
  that do not expose visitor text, and text/recording limits.
- I also split the finished work into reviewable commits so the config/docs,
  implementation, and tests can be reviewed separately.
- For #30, I kept the scope intentionally below `/chat`: this branch exposes a
  reusable retrieval service and `POST /retrieve` endpoint that the agent layer
  can call later, without changing persona responses in the same PR.

## 2. AI Tools Used
Codex. I used it first to read the full issue #96 body and all comments through
the GitHub API, because the local `gh` command was not available. Then I used
Codex to inspect the current backend/FastAPI structure, identify that the
backend voice layer was still missing on `main`, produce an implementation plan,
write the backend code, add tests, install the new Transcribe dependency, run
lint/tests, explain the work back in Chinese, and split the result into three
commits.

Later in the week I used Codex again for #30. I had it read the GitHub issue
through the GitHub API, inspect `data/schema.md` §6/§9, and check the existing
ingest/embedder/database patterns before planning the implementation. Then I
used Codex to implement the retrieval service, add the FastAPI endpoint, write
unit and integration tests, run backend verification, and recover from an
accidental commit on `main` by moving the work onto a dedicated issue branch.

## 3. Prompts / Agent Workflow
- **Read the issue and comments before coding.** The issue body mentioned
  "Backend voice adapter - Steven, reviewed by Alina", but the comments clarified
  the actionable backend assignment: `@lqingman` should implement or guide the
  backend Transcribe/Polly endpoints, using Yaoyi's env var names. This changed
  the interpretation from "review only" to "implement the backend slice".
- **Matched Yaoyi's infrastructure contract exactly.** Added settings for
  `VOICE_CACHE_BUCKET`, `VOICE_CACHE_PREFIX`, `POLLY_ENGINE`,
  `TRANSCRIBE_LANGUAGE_CODE`, `VOICE_AUDIO_URL_TTL_SECONDS`, and
  `VOICE_MAX_TEXT_LENGTH`, while reusing the existing `AWS_REGION`. No AWS access
  keys were added anywhere.
- **Kept AWS calls behind backend adapters.** Codex added a new voice module
  rather than mixing Polly/S3/Transcribe logic directly into the chat code. The
  backend app wires these adapters into routes, and tests can inject fakes.
- **Implemented the Polly cache path first.** The code resolves the narrator's
  Polly voice server-side, computes a SHA-256 cache key from voice, engine,
  language, cache version, and response text, checks S3 for a cache hit, and only
  calls Polly/uploads an MP3 on cache miss.
- **Implemented the Transcribe WebSocket path.** The route accepts binary PCM
  chunks, rejects empty/invalid messages, enforces a short recording-duration
  limit, and forwards audio to the Amazon Transcribe streaming SDK. It emits JSON
  transcript messages with `is_final` so the frontend can show partial/final
  states.
- **Kept local verification AWS-free.** Unit tests use fake S3, Polly, and
  Transcribe objects. Full backend tests initially failed because my local `.env`
  was configured for Bedrock chat and tried to resolve AWS OIDC offline; rerunning
  with `CHAT_MODEL=stub` matched the repo's no-AWS test expectation and passed.
- **Split commits for review.** After verification, Codex created three commits:
  config/docs/dependency, implementation, and tests.
- **Recovered the real #30 issue text first.** The local `gh` command was not
  installed, and the first sandboxed GitHub request could not resolve DNS, so I
  had Codex rerun a read-only GitHub API request with approval. That confirmed
  the issue was not "wire RAG into chat"; it was specifically the retrieval
  layer over `retrievable_chunks`.
- **Let the schema define the boundary.** Codex read `data/schema.md` and found
  that `retrievable_chunks` already exposes the privacy-gated rows plus all
  citation fields. That made the implementation rule simple: retrieval SQL must
  select from the view only, never from `documents` or `chunks`.
- **Reused the existing embedder path.** The new service uses the same embedder
  factory as ingest, so local tests can run with `FakeEmbedder`, while deployed
  or real-data runs can use Bedrock Titan V2 through `EMBEDDER=bedrock`.
- **Kept #30 separate from chat grounding.** The issue says to expose a backend
  function/endpoint the agent layer can call. I chose `POST /retrieve` plus a
  reusable `RetrievalService`, leaving `/chat` unchanged so future RAG-agent work
  can compose it deliberately instead of mixing two concerns in one PR.
- **Split and repaired the commits.** Codex first committed the implementation
  while still on `main`; I caught that, then moved the work to
  `qingman/issue-30-rag-retrieval`, reset `main` back to `origin/main`, and kept
  two reviewable commits on the issue branch.

## 4. Useful Output
- `backend/app/config.py` — added backend voice settings:
  `voice_cache_bucket`, `voice_cache_prefix`, `polly_engine`,
  `transcribe_language_code`, `voice_audio_url_ttl_seconds`, and
  `voice_max_text_length`.
- `backend/app/voice.py` — new AWS voice helper module:
  - backend-controlled narrator-to-Polly voice mapping
  - deterministic `v1` SHA-256 cache key generation
  - S3 cache hit/miss detection
  - Polly MP3 synthesis
  - private S3 upload and presigned playback URL generation
  - Amazon Transcribe streaming adapter
  - small shared transcript/result dataclasses and testable protocols
- `backend/app/main.py` — added:
  - `POST /voice/synthesize`
  - `WebSocket /voice/transcribe`
  - app-factory injection points for fake voice synthesizer/transcriber in tests
  - validation for unknown narrator, empty text, over-limit text, empty audio
    chunks, invalid WebSocket messages, and recording duration.
- `backend/pyproject.toml` — added `amazon-transcribe>=0.6` for the streaming
  Transcribe client.
- `backend/.env.example` — documented the voice runtime env vars as non-secret
  settings. No AWS credentials are included.
- `backend/README.md` — added a "Voice endpoints" section describing the REST and
  WebSocket contracts, expected audio format, and server-side credential model.
- `backend/tests/test_voice.py` — new tests for:
  - missing `VOICE_CACHE_BUCKET` returns `503`
  - unknown narrator returns `404`
  - empty/over-limit text rejection
  - client-supplied `voice_id`/`engine` ignored in favor of server mapping
  - S3 cache hit returns a presigned URL without calling Polly
  - S3 cache miss calls Polly and uploads MP3
  - cache key does not expose visitor text
  - WebSocket partial/final transcript messages
  - empty audio chunk rejection
  - recording duration limit
- Verification:
  - `.venv/bin/ruff check .` passed from `backend/`
  - `CHAT_MODEL=stub .venv/bin/pytest` passed: 42 passed / 2 skipped
  - `amazon_transcribe` import verified after installing updated backend
    dependencies into `.venv`
- Commits:
  - `42240ee feat: add backend voice runtime config`
  - `16d36d0 feat: add backend voice endpoints`
  - `5372ec7 test: cover backend voice endpoints`
- `backend/app/retrieval.py` (#30) — new retrieval layer:
  - embeds the incoming query with the configured backend embedder
  - searches `retrievable_chunks` with pgvector cosine distance
  - supports `top_k`, `ship`, and `material_type` filters
  - assembles VMM citations from `object_identifier` + `public_url`
  - assembles external citations from `author_publisher` + `source_url` +
    `license`
  - returns typed retrieval response models for endpoint and future agent use
- `backend/app/main.py` (#30) — added `POST /retrieve` with request validation
  for blank query and invalid `top_k`, plus app-factory injection so endpoint
  tests do not need AWS or a live database.
- `backend/tests/test_retrieval.py` (#30) — tests citation assembly, confirms the
  retrieval SQL reads only from `retrievable_chunks`, and checks endpoint
  validation/response shape.
- `backend/tests/test_ingest_integration.py` (#30) — added a DB-backed retrieval
  test that inserts public, out-of-scope, and passenger-archival rows, then
  verifies retrieval only returns rows visible through the view and respects
  metadata filters.
- Verification for #30:
  - `.venv/bin/python -m ruff check .` passed from `backend/`
  - `CHAT_MODEL=stub EMBEDDER=fake .venv/bin/python -m pytest` passed:
    48 passed / 3 skipped
  - Running pytest without env overrides still tries to use my local `.env`
    Bedrock chat settings and fails offline at AWS OIDC; that is existing local
    configuration behavior, not a retrieval failure.
- Commits for #30 on `qingman/issue-30-rag-retrieval`:
  - `bfec5c6 Add backend retrieval endpoint`
  - `1761756 Add retrieval coverage`

## 5. Human Review / Changes
- **Corrected the assignment interpretation.** At first the issue body made it
  look like Alina was only the backend reviewer. After reading the comments, I
  confirmed the actual work expected from me was the backend endpoint
  implementation using the settings Yaoyi provided.
- **Kept frontend work out of this PR.** The frontend still needs to replace the
  browser-only speech APIs with the backend voice contract, but this branch stays
  scoped to the backend. The README now gives the contract Steven/Kelly can use.
- **Preserved the no-credentials rule.** The implementation relies on the ECS
  task role or local AWS profile. `.env.example` documents only non-secret
  runtime settings.
- **Made privacy visible in tests.** The cache key test checks that visitor text
  does not appear in S3 object names, and the Transcribe path streams chunks
  without storing raw recordings.
- **Used fakes instead of live AWS for tests.** This keeps CI/local tests fast,
  deterministic, and safe. Real S3/Polly/Transcribe validation is still a deploy
  or sandbox smoke-test step.
- **Installed the new dependency only after confirming it was missing.** The
  local virtualenv had `boto3` but not `amazon_transcribe`; after adding it to
  `pyproject.toml`, I installed the updated backend dependencies and verified the
  import.
- **Clarified what "done" means for #30.** The code path is complete, but real
  semantic retrieval still depends on a populated database with Bedrock-generated
  embeddings. Local tests use fake embeddings to verify mechanics and privacy,
  not relevance quality.
- **Kept the privacy gate testable.** The implementation has a unit guard that
  the SQL reads only from `retrievable_chunks`, and the integration test proves
  out-of-scope and NULL-date passenger rows stay hidden because the view filters
  them before retrieval sees them.
- **Fixed branch hygiene after catching it.** I initially let Codex commit the
  first #30 change on `main`. After noticing, I created
  `qingman/issue-30-rag-retrieval`, preserved both commits there, and reset
  `main` back to the original `origin/main` commit.

## 6. Reflection
This work was a good reminder that the issue body and issue comments can carry
different kinds of truth. The issue body named reviewers and owners at a high
level, but the comments contained the concrete backend settings and the direct
ask to implement the endpoints. Reading all of it first prevented the wrong
outcome: stopping at a review plan when the backend implementation was actually
needed.

The cleanest technical choice was to isolate the voice runtime behind adapters.
Polly/S3 caching, Transcribe streaming, and FastAPI validation are related, but
they should not become tangled with `/chat` or the existing ingest/agent code.
The adapter boundary also made testing straightforward: fake clients can prove
cache hit/miss behavior and WebSocket transcript flow without requiring AWS
credentials.

The biggest remaining risk is integration, not unit behavior. The backend now
has the expected endpoints and local tests, but the full demo still needs the
frontend to send the correct PCM format, call `/chat` between transcript and
synthesis, play the presigned Polly URL, and handle Listening / Transcribing /
Thinking / Speaking / error states. A real AWS smoke test should also confirm
that the ECS task role permissions from PR #100 are sufficient for Transcribe,
Polly, S3 cache access, and KMS-encrypted bucket objects.

The #30 retrieval work had a similar lesson about separating capability from
demo readiness. The backend now has the retrieval surface: query embedding,
vector search, privacy-gated view access, filters, and citations. But relevance
cannot be honestly claimed from fake embeddings or an empty local database. The
right next validation step is a smoke test against a populated Postgres database
with Bedrock Titan V2 embeddings, then wiring the retrieved chunks into the
LangGraph persona flow in the follow-up RAG issue.
