# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 8 (July 16 - July 22, 2026)
Date: 2026-07-16 to 2026-07-18

## 1. Task / Goal
- **Issue #146** — investigate whether the active scene context was being sent
  to the narrator backend and included in the model system prompt.
- Preserve the selected narrator persona while changing the contextual prompt
  whenever the visitor moves to a different scene.
- Define a clear frontend/backend scene ID contract without breaking the
  frontend's existing URL-friendly scene IDs.
- Reject unknown scenes and persona/scene combinations that are not supported,
  rather than silently running with only the persona prompt.
- Package the authored files under `data/ai/scenes` in the deployed backend
  image and add regression coverage for scene-aware prompt construction.
- **Issue #34** — replace process-local LangGraph session memory with a
  Postgres-backed checkpointer so one conversation can continue across API
  instances and instance restarts.
- Treat short-term memory as session-scoped data with a 30-minute sliding idle
  timeout, then remove the expired thread's checkpoints and metadata.
- Connect the frontend to the new API contract with one `session_id` per browser
  tab, stored in `sessionStorage`, while retaining local history for display.

## 2. AI Tools Used
Codex was used to trace the complete chat request path from the narrator overlay
through `POST /chat` and into the LangGraph persona node. It compared the runtime
implementation with the authored scene files, confirmed the root cause, drafted
Issue #146, implemented the fix, added tests and documentation, and separated
the finished work into focused Git commits.
For Issue #34, Codex inspected the existing `MemorySaver`, FastAPI lifecycle,
RDS/Alembic configuration, ECS deployment settings, and frontend chat call. It
then implemented the shared checkpointer, designed concurrency-safe expiry
cleanup, added integration coverage, connected the browser session contract,
ran the available validation, and split the work into backend, documentation,
infrastructure, and frontend commits.

## 3. Prompts / Agent Workflow
- Searched the frontend and backend for `scene`, persona prompts, and system
  prompt construction to follow the value across the application boundary.
- Confirmed that the frontend already sent a scene value and FastAPI placed it
  in graph state, but `_grounding_prompt` used only the persona prompt and RAG
  policy. The scene Markdown files were never parsed at runtime.
- Found a second deployment gap: the backend Docker image copied
  `data/ai/personas` but did not copy `data/ai/scenes`.
- Identified inconsistent IDs between the active frontend and backend content,
  including `loading-dock` / `loading_dock`, `deck` / `open_deck`, and
  `first-class-dining-saloon` / `dining_saloon`.
- Added a backend scene registry that parses YAML frontmatter and the fenced
  block under `## Scene Context Prompt` from each scene Markdown file.
- Changed system prompt composition to persona prompt, then active scene
  context, then spoken-response and grounding policy.
- Added API and graph-level checks for unknown scenes and persona/scene
  incompatibility while keeping scene omission as an explicit persona-only
  fallback.
- Kept the frontend's URL-friendly `scene.id` values and added explicit
  `backendSceneId` values for the canonical API contract.
- Updated the Docker image and environment configuration so deployed tasks can
  load the scene files through `SCENE_DIR`.
- Added regression tests for scene parsing, persona-to-scene coverage, prompt
  ordering, scene switching, unknown scenes, and incompatible personas.
- Confirmed that the existing `session_id` path used an in-process
  `MemorySaver`, was disabled by default, and could not survive load balancing
  or an API restart.
- Reused the existing PostgreSQL/RDS database with LangGraph's
  `PostgresSaver` and a psycopg connection pool instead of introducing Redis.
- Added `agent_sessions` lifecycle metadata and an Alembic migration, while
  leaving LangGraph responsible for creating and migrating its own checkpoint
  tables.
- Added a 30-minute sliding TTL. Each valid session request refreshes its
  expiry; reusing an already expired ID deletes its old thread before beginning
  a new conversation.
- Added a 60-second background cleanup loop that processes expired sessions in
  batches with `FOR UPDATE SKIP LOCKED`, allowing multiple API tasks to sweep
  safely without sticky-session assumptions.
- Moved checkpointer startup, graph compilation, cleanup-task creation, and
  connection-pool shutdown into the FastAPI lifespan. Enabled the feature in
  the ECS task definition and kept the client-provided `history` fallback when
  session memory is disabled.
- Added frontend tab-scoped session management using `sessionStorage` and
  `crypto.randomUUID()`. Chat requests now send `session_id` instead of the
  entire history; after 30 minutes of inactivity the frontend rotates the ID
  and clears the displayed conversation history.

## 4. Useful Output
- GitHub Issue #146 — documented the missing runtime composition, Docker gap,
  scene ID mismatch, expected prompt order, and acceptance criteria.
- `backend/app/agents/scenes.py` — scene Markdown parser and cached registry.
- `backend/app/agents/graph.py` — scene lookup, validation, tracing, and prompt
  composition in persona → scene → grounding-policy order.
- `backend/app/main.py` — API validation for canonical scene IDs and supported
  persona/scene combinations.
- `frontend/src/lib/narrators.ts` and `NarratorOverlay.tsx` — explicit mapping
  from frontend URL IDs to canonical backend scene IDs.
- `backend/Dockerfile`, `.env.example`, and `config.py` — deployed scene files
  and configurable `SCENE_DIR` support.
- `backend/tests/test_agents.py` — regression coverage for the complete scene
  prompt contract.
- Verification: the full backend suite completed with 88 tests passed and 3
  integration tests skipped. Frontend ESLint and the production Next.js build
  passed. Ruff passed for all changed Python files, and `git diff --check`
  reported no whitespace errors.
- Split the work into `be76e67` (backend scene prompt implementation),
  `73f4aa1` (frontend scene ID mapping), and `f12511b` (documentation).
- `backend/app/session_memory.py` — pooled Postgres checkpointer, sliding TTL,
  immediate expired-thread reset, and multi-instance cleanup loop.
- `backend/alembic/versions/0002_agent_sessions.py` — indexed session lifecycle
  table; Alembic autogenerate also excludes package-owned checkpoint tables.
- `backend/app/main.py` — lifespan-managed shared session graph, validated
  1–128 character session IDs, and explicit `501`/`503` failure behavior.
- `frontend/src/lib/chat.ts` and `NarratorOverlay.tsx` — one tab-scoped session
  ID, backend session requests, local display history, and idle rotation.
- Issue #34 verification: the complete backend suite passed with 96 tests and 6
  integration skips. The three new Postgres scenarios cover interleaved turns
  across two app instances, restart recovery, immediate expiry reset, and
  concurrent cleanup; they skipped locally because Docker/Postgres was not
  running. Frontend ESLint and the production Next.js build passed.
- Split the work into `2581261` (backend persistence, migration, and tests),
  `d20fd96` (documentation), `addf4d2` (ECS enablement), and `729c08a`
  (frontend tab-scoped sessions).

## 5. Human Review / Changes
- Verified the diagnosis against both the request flow and the exact system
  prompt passed to the chat model instead of assuming that the presence of a
  `scene` field in the API request meant the model received scene context.
- Kept persona-only requests supported for backward compatibility, but made
  invalid supplied scene values fail clearly.
- Reviewed whether the frontend should use one scene ID everywhere. A single
  canonical ID would be simpler if URL compatibility were unimportant; the
  current implementation keeps UI/deep-link IDs separate and makes the backend
  mapping explicit because several existing values differ semantically, not
  only by hyphen versus underscore.
- Mapped the first-class `deck` scene to `open_deck` and updated Eleanor
  Whitmore's allowed-scene metadata so the backend validation matches the
  visitor experience.
- Separated backend behavior, frontend mapping, and documentation into three
  commits so each design concern can be reviewed independently.
- Chose Postgres over Redis for Issue #34 because the project already operates
  private RDS access from every API task and does not require another service
  for the expected museum-demo latency or scale.
- Defined expiry by inactivity rather than creation time so an active visitor
  is not interrupted mid-conversation. Kept cleanup idempotent and locked at
  the session row so a request refreshing a live session is not deleted by a
  concurrent API instance's sweeper.
- Kept the frontend transcript separate from backend memory: React state still
  supports display, while only the current message and opaque session ID cross
  the API boundary. Used `sessionStorage` rather than `localStorage` so separate
  tabs and future visits do not share conversation memory.

## 6. Reflection
This issue showed that carrying a field through API and graph state is not the
same as using it. End-to-end tracing must continue to the final model invocation
and deployed artifact contents; otherwise data can appear correctly wired while
having no effect on model behavior.

The scene ID mismatch also demonstrated the value of an explicit boundary
contract. URL identifiers are part of frontend navigation, while canonical
backend IDs select authored prompt files. Keeping the mapping visible avoids
silent string normalization and makes semantic mappings such as `deck` to
`open_deck` reviewable. If the project later decides that existing deep links do
not need compatibility, consolidating both fields into one canonical ID would
be a reasonable simplification.

Finally, prompt composition needs deterministic tests. Checking the exact order
of persona, scene, and grounding instructions—and proving that switching scenes
replaces only the contextual portion—provides stronger protection than testing
only that `/chat` returns a successful response.

Issue #34 clarified that a stateless API does not mean the application has no
state; it means request-serving processes do not own durable state. Moving the
LangGraph thread to Postgres lets the load balancer route any turn to any task,
while the separate expiry table gives the product an explicit privacy and
storage lifecycle instead of retaining visitor conversations indefinitely.

The cleanup design also showed why expiry needs coordination with active
requests. A timer that simply deletes old rows can race with another instance
refreshing the same session. Row locking, `SKIP LOCKED`, immediate cleanup on
expired-ID reuse, and idempotent checkpoint deletion make the behavior safe
under horizontal scaling. On the client, keeping the opaque ID in
`sessionStorage` aligns the UI boundary with the backend's thread boundary
without turning short-term memory into a cross-visit user profile.
