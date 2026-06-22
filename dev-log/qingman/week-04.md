# AI-Assisted Development Log

Name: Qingman Li (Alina)
Week: Week 4 (June 18 – June 24, 2026)
Date: 2026-06-21

## 1. Task / Goal
- **Issue #31** — [backend] Stand up the **LangGraph multi-agent topology**: an
  orchestrator that routes a visitor's question to a persona agent (Captain
  Sinclair / Ming Chen / Ms. Whitmore) which replies in character, plus a
  `POST /chat` endpoint and short-term per-session memory. The Issue as written
  also required **RAG grounding** on every answer, but RAG isn't usable yet
  (ingest still runs only against the `FakeEmbedder`; the real-embedding run is
  blocked on Bedrock IAM), so the goal this week was the **agent architecture
  without RAG** — personas answer from their system prompts alone — with the
  retrieval step left as a clean seam to fill later.
- **Scope-split the Issue, didn't silently drop work.** Edited #31 down to the
  no-RAG architecture and opened **#69** to track wiring the agents to the RAG
  retrieval layer (grounding + citations), so the deferral is explicit and
  tracked rather than forgotten.
- **Opened the infra dependency I hit.** Filed **#70** for Yaoyi — Bedrock
  `InvokeModel` IAM for a **Claude chat** model. PR #49 only granted invoke on the
  Titan *embedding* model, so there is currently no permission to call a Claude
  chat model from the backend.

## 2. AI Tools Used
Claude Code (Opus). Planned the change in plan-mode first (explored the backend,
read PR #68's persona files and PR #49's IAM scope before proposing anything),
then made two design forks explicit upfront — **pluggable stub LLM vs Bedrock-only**,
and **LLM-router vs scene/explicit routing** — and chose stub-default + explicit
routing. Built the agent module to mirror the existing `ingest/embed.py` factory
pattern, then **verified against a real LLM** (a local-dev Gemini key) to prove
personas stay in character and session memory actually carries context across
turns — not just that the tests pass.

## 3. Prompts / Agent Workflow
- **Grounded in the existing code first.** Had Claude read `CLAUDE.md`,
  `CONTRIBUTING.md`, the current `backend/app/` skeleton, and the merged persona
  files from PR #68 before writing — so the scaffold reused the repo's
  pydantic-settings/factory conventions and the Bedrock-first rule rather than
  generic LangChain boilerplate.
- **Decided the forks before coding.** Bedrock *chat* IAM isn't ready, so rather
  than block I built a **pluggable `ChatModel`** mirroring the embedder: a
  `StubChatModel` (deterministic, creds-free — the graph and tests run today), a
  `BedrockChatModel` (`ChatBedrockConverse`, the production path), selected by
  `settings.chat_model`. Routing was chosen as **scene/explicit** — the request
  carries `persona_id` (or a `scene` hint) and the orchestrator dispatches — over
  an LLM classifier, to keep it deterministic and cheap for the demo.
- **Loaded personas from the authored files, not hardcoded prompts.**
  `app/agents/personas.py` parses each `data/ai/personas/*.md` (PR #68) into a
  registry — YAML frontmatter for `id`/`name`/`scenes`, the fenced block under
  `## System Prompt` for the prompt — and builds a `scene -> personas` index.
  Since some scenes are shared (`loading_dock`, `promenade_deck`), `persona_id`
  is the primary selector and a shared scene without one returns a 400.
- **Built the graph as the seam for RAG.** `app/agents/graph.py` is a LangGraph
  `StateGraph`: a `dispatch` entry node conditional-edges to one node per persona;
  each persona node loads its system prompt and calls the chat model. The persona
  node is exactly where a future `retrieve` step inserts — so #69 is an addition,
  not a rewrite.
- **Added short-term session memory on request.** After the first cut (stateless,
  client supplies `history`), added **server-side per-session memory** via a
  LangGraph `MemorySaver` checkpointer keyed by `session_id`: the `messages` field
  got an `operator.add` reducer so each turn appends to the checkpointed history,
  and the persona node writes its reply back so the next turn sees it. The
  stateless `history` path remains as a no-`session_id` fallback.
- **Verified with a real model, twice over.** Ran all three personas through
  Gemini and confirmed in-character, boundary-respecting replies (Ming's
  lower-deck register, Whitmore's first-class voice). Then ran a two-turn session
  test where turn 2 — sending **only** the new message — correctly recalled the
  passenger's name and destination from turn 1, proving the memory wires through
  end to end, not just in a unit assertion.

## 4. Useful Output
- `backend/app/agents/` — the new agent layer:
  - `personas.py` — load/cache personas from `data/ai/personas/*.md`, registry +
    `scene_to_personas` index.
  - `llm.py` — pluggable `ChatModel`: `StubChatModel` (default), `BedrockChatModel`
    (`ChatBedrockConverse`), and a `make_chat_model` factory mirroring
    `make_embedder`. (Plus a clearly-labelled **local-dev-only** `GeminiChatModel`
    for testing real generation before Bedrock chat IAM lands — not the production
    path.)
  - `state.py` — `AgentState` with an `operator.add` reducer on `messages` (so
    session turns accumulate).
  - `graph.py` — `build_graph(chat_model, checkpointer=None)`: dispatch → per-persona
    nodes; compile with `MemorySaver` for session memory.
- `backend/app/main.py` — `POST /chat` (`persona_id` / `scene` / `session_id` /
  `history`), persona resolution with 400 (ambiguous scene) / 404 (unknown persona);
  graph compiled once at startup, plus a `session_graph` with in-memory checkpointer.
- `backend/app/config.py` — `chat_model` (default `stub`), `bedrock_chat_model`,
  and the dev-only `gemini_chat_model` / `gemini_api_key` (key via local `.env` only).
- `backend/pyproject.toml` — added `langgraph`, `langchain-core`, `langchain-aws`.
- `backend/tests/test_agents.py` — persona loading, scene disambiguation, graph
  dispatch, **session-memory accumulation**, and `/chat` happy-path + ambiguous-scene
  + unknown-persona. 8 new tests; full suite 17 passed / 2 skipped (DB), ruff green.
- **Issue hygiene** — #31 rescoped to no-RAG architecture (+ a session-memory task
  and acceptance criterion); **#69** opened for the RAG follow-up; **#70** opened +
  assigned to Yaoyi for Claude chat IAM, with Project Track/Phase set.

## 5. Human Review / Changes
- **Refused to let the Issue's RAG requirement block the architecture.** Rather
  than wait on the embedding run, split #31 into "architecture now (#31)" and
  "grounding later (#69)", and built the graph so the persona node is the exact
  insertion point — the deferral costs no rework.
- **Caught the IAM gap precisely.** Confirmed PR #49 granted invoke only on the
  *embedding* model, so the backend has **no Claude chat permission** — filed #70
  with the exact ask (mirror the embedding policy for a Claude model + console
  model-access) instead of vaguely "needs Bedrock."
- **Kept the stub honest.** `StubChatModel` is non-generative and clearly labelled,
  so nobody mistakes a creds-free local run for real model output — same discipline
  as the `FakeEmbedder` last week.
- **Treated the Gemini key as dev-only and uncommittable.** Added the Gemini path
  only as a local testing convenience (CLAUDE.md is Bedrock-first), confirmed
  `backend/.env` is git-ignored via `git check-ignore`, and kept `chat_model`'s
  committed default at `stub` so the off-convention provider never ships as default.
- **Made memory ownership a deliberate decision, not a default.** "Where does
  session memory live — frontend or backend?" is a real architecture choice that
  also overlaps Steven's UX/voice track; chose backend (better for multi-persona
  switching, observability, and the future RAG layer) and flagged it as a
  cross-track point to confirm rather than assuming.
- **Verified `scene` disambiguation on real frontmatter.** `loading_dock` maps to
  both Sinclair and Ming, so a scene-only request there is genuinely ambiguous —
  made it a 400 with a helpful message instead of silently picking one persona.

## 6. Reflection
The architectural bet this week was **building for the dependency you don't have
yet**. RAG, Bedrock chat IAM, and the frontend session model are all pending, and
the temptation was to either block on them or stub past them sloppily. Instead the
same pattern from #28 paid off again: a pluggable seam (`ChatModel`, like
`Embedder`) decouples "is the agent graph correct?" — answerable now — from "is
Bedrock wired?" (Yaoyi, #70). The persona node being the literal RAG insertion
point means #69 is additive, not a rewrite. And choosing **scene/explicit routing
+ backend session memory** were deliberate calls with stated trade-offs, not
defaults — the kind of decision that's cheap to make now and expensive to reverse
after the frontend integrates.

Verifying against a real model (Gemini, as a stand-in until Bedrock) was again
where the confidence came from: the two-turn memory test sending only the new
message proved the `MemorySaver` + reducer actually carries context, which a
mocked assertion wouldn't have shown convincingly. **Open blockers:** (1) #70 —
Claude chat IAM, to flip `chat_model` from stub to Bedrock; (2) #69 / the RAG
retrieval layer, still gated on the real-embedding run. Next: confirm the chat
model id with Yaoyi once IAM lands, then start #69 on top of `retrievable_chunks`,
inserting the `retrieve` step into the persona node the graph already leaves open.
