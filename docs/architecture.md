# Architecture

System architecture of the Empress of Japan capstone, as built in the current
codebase. This describes **what exists in code today**; planned work is flagged
explicitly. For team workflow see [`CONTRIBUTING.md`](../CONTRIBUTING.md); for a
higher-level intro see [`README.md`](../README.md).

Last verified against code: 2026-07-13.

---

## 1. Overview

A visitor opens the web app, steps into a 360° panorama of an *Empress of Japan*
scene, and converses (by voice or text) with a historical persona. The frontend
is a Next.js + React Three Fiber app; the backend is a FastAPI + LangGraph service
calling AWS Bedrock, with a Postgres + pgvector knowledge base. Everything is
deployed to a ~$1,000 AWS sandbox in `us-west-2` via Terraform and GitHub Actions.

```
Visitor (browser)
  ├─ Next.js 16 App Router + React 19
  ├─ React Three Fiber: 360° panorama (drag + gyroscope) + GLB ship model
  ├─ Voice in: Web Speech API (STT)   Voice out: AWS Polly (S3) w/ browser fallback
  └─ Chat: fetch POST /chat  ──────────────┐
                                            ▼
                              CloudFront ─▶ ALB ─▶ ECS Fargate (FastAPI + OTel sidecar)
                                            │
                    ┌───────────────────────┼───────────────────────────┐
                    ▼                        ▼                           ▼
              LangGraph               Postgres 16 + pgvector        AWS Bedrock
        dispatch ─▶ persona ─▶ END    (RAG store, Titan embeds)   (Claude Sonnet 4-6,
        (persona picked at API)       via /retrieve endpoint       Titan embeddings)

  SQS ─▶ worker (Fargate) ─▶ ingest pipeline ─▶ pgvector
  OTel ─▶ Honeycomb   ·   Logs/metrics ─▶ CloudWatch
```

---

## 2. Frontend

- **Stack:** Next.js 16.2 (App Router), React 19, TypeScript, Tailwind v4, Turbopack.
- **3D — two R3F systems:**
  - **360° panorama viewer** (`three/PanoramaScene.tsx`) — the primary experience.
    An equirectangular photo is mapped to the inside (`THREE.BackSide`) of a sphere;
    the camera sits at the center. Two look modes: pointer drag (`OrbitControls`)
    and phone gyroscope (`DeviceOrientationControls`), with FOV math and azimuth/
    polar clamping. A placeholder texture is drawn when a scene has no photo.
  - **GLB ship model** (`three/ShipModel.tsx`) — `useGLTF` loads a real GLB
    (`public/models/`), shown in the Explore hub and a placeholder `/scene` demo.
- **Conversation UI** (`NarratorOverlay.tsx`) — an overlay (tappable narrator
  cut-out + a small panel showing the last exchange), not a scrolling thread.
  Conversation history is kept in React state.
- **API client** (`lib/chat.ts`, `lib/voice.ts`) — plain `fetch` POST to
  `${API_BASE_URL}/chat` with `{persona_id, scene, message, history}`, returning a
  single JSON `{persona_id, response}`. No WebSocket/SSE/streaming for chat.
  `lib/api.ts` centralizes the base URL (`NEXT_PUBLIC_API_BASE_URL`, inlined at
  build time) and derives `WS_BASE_URL` (`https:`→`wss:`) for future WebSocket
  clients of the backend's `WS /voice/transcribe`.
- **Voice IO:**
  - STT — browser **Web Speech API** (`SpeechRecognition`), feeds transcript into
    the same submit path.
  - TTS — backend **AWS Polly** via `POST /voice/synthesize` (returns a short-lived
    S3 URL), played with `new Audio()`; falls back to browser `speechSynthesis`.
- **Routes** (App Router): `/` (landing), `/explore` (narrator picker + 3D ship),
  `/explore/[narratorId]` (panorama + chat, prerendered per narrator), `/scene`
  (R3F ship placeholder). The `/explore` subtree is wrapped in a landscape
  orientation gate.
- **Hosting:** static export (`next.config.ts` `output: "export"`,
  `trailingSlash: true`, `images.unoptimized`) → `out/` served from a private S3
  bucket behind CloudFront (HTTPS via the default cloudfront.net cert). Replaces
  Vercel. See §7 and the frontend deploy runbook (§10). No server-side rendering,
  route handlers, or middleware — the app is fully client-driven.
- **Narrators/scenes** are defined in `lib/narrators.ts` (3 narrators:
  `captain_sinclair`, `eleanor_whitmore`, `ming_chen`).

---

## 3. Backend

- **Framework:** FastAPI (Python 3.12), run via uvicorn (`app.main:app`).
- **Endpoints:**

  | Method | Path | Purpose |
  |---|---|---|
  | `GET` | `/health`, `/health/db` | Liveness / DB readiness |
  | `POST` | `/chat` | Persona agent chat |
  | `POST` | `/retrieve` | pgvector similarity search |
  | `POST` | `/voice/synthesize` | Polly TTS → S3 URL |
  | `WS` | `/voice/transcribe` | Streams PCM to Amazon Transcribe |
  | `POST` | `/ingest/jobs` | Admin-gated (X-Admin-Token) ingest enqueue → SQS |

- **LLM provider:** AWS Bedrock via `langchain-aws` `ChatBedrockConverse`
  (`agents/llm.py`). Model **`us.anthropic.claude-sonnet-4-6`** (US cross-region
  inference profile). Calls are blocking `.invoke()` — no chat streaming. The
  default model is a deterministic creds-free `StubChatModel`; Bedrock is opt-in
  via config.
- **Database:** Postgres 16, SQLAlchemy 2.0 + psycopg 3, Alembic migrations
  (`0001_initial_schema`, generated from `db/schema.sql`). Tables: `documents`,
  `chunks`; connection metadata comes from Secrets Manager in the cloud.
- **Async:** AWS SQS for ingest jobs — producer in `/ingest/jobs`, a standalone
  `app.jobs.worker` long-poll consumer running as its own Fargate service. Trace
  context propagates via SQS message attributes. No Redis/Celery.
- **Caching:** only Polly audio in S3 (presigned, 900s TTL); `lru_cache` for
  settings/personas.
- **Session memory:** optional in-process LangGraph `MemorySaver`, off by default;
  the default path is stateless client-supplied `history`.

---

## 4. Agent topology (LangGraph)

The graph is built in `backend/app/agents/graph.py` (`build_graph`). It is a
**single-hop graph** — no supervisor/router LLM, no tools, no RAG node, no
agent-to-agent handoff:

```
dispatch ──(state["persona_id"])──▶ <persona node> ──▶ END
```

- **`dispatch`** — no-op entry node; exists so a conditional edge can fan out.
- **Persona nodes** — one per persona, generated dynamically from the persona
  markdown registry (`data/ai/personas/`): `ming_chen`, `eleanor_whitmore`,
  `captain_sinclair`. Each loads its system prompt, calls the chat model, and
  truncates the reply to a spoken-length soft cap (~800 chars).
- **Routing** — a conditional edge reads `state["persona_id"]` and routes to the
  same-named node. The persona is resolved **at the API layer** (`_resolve_persona`
  in `main.py`) before the graph runs; `scene` is only a disambiguating hint.
- **State** (`agents/state.py`): `persona_id`, `scene`, `messages` (append reducer),
  `response`.

> **Planned:** a richer multi-agent topology (routing/handoff between more agents)
> is a target, not current state.

---

## 5. RAG

- **Store:** Postgres + pgvector, HNSW index with `vector_cosine_ops`, queried
  through a privacy-scoped `retrievable_chunks` view (in-scope + public-or-pre-1945
  archival).
- **Embeddings:** Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`),
  **1024-dim**, L2-normalized (`ingest/embed.py`).
- **Chunking** (`ingest/chunk.py`): VMM catalogue objects → one composed chunk
  (title/description/history/maker note); long docs → 400-word sliding windows with
  50-word overlap.
- **Retrieval** (`retrieval.py`): raw SQL cosine distance (`<=>`),
  `ORDER BY ... LIMIT :top_k`, score = `1.0 - distance`. Top-k default 5, max 20.

> **Planned:** RAG is currently exposed only via the standalone `/retrieve`
> endpoint. It is **not yet wired into `/chat`** — personas answer from their
> system prompt alone.

---

## 6. Data flow — a visitor query end-to-end

1. Visitor opens `/explore/[narratorId]`; sees the panorama and narrator overlay.
2. Taps 🎤 (Web Speech transcribes) or types.
3. Frontend `POST /chat` `{persona_id, scene, message, history}` →
   CloudFront → ALB → FastAPI.
4. FastAPI resolves the persona and calls the graph: `dispatch` → persona node →
   Bedrock (Claude Sonnet 4-6) with that persona's system prompt.
5. Response returns as a single JSON payload (no streaming).
6. Frontend `POST /voice/synthesize`; Polly renders audio → cached in S3 → played.
7. Spans go to Honeycomb via the OTel sidecar; logs/metrics to CloudWatch.

---

## 7. Infrastructure

- **IaC:** Terraform (AWS provider ~5.0, `us-west-2`), remote state in S3 with a
  DynamoDB lock. Resources are actively declared and applied.
- **Deployed AWS services:** VPC (2 public / 2 private subnets, no NAT for cost),
  **ECS Fargate** (backend + worker task defs, each with an OTel collector sidecar),
  **ALB** (HTTP :80), **CloudFront** (HTTPS/WSS entry, caching off, no WAF), **ECR**
  (immutable, scan-on-push), **RDS Postgres 16** `db.t4g.micro` (private, encrypted,
  deletion-protected, nightly auto-stop via EventBridge for cost), **S3 + KMS**
  (voice cache), **SQS** + DLQ, **Secrets Manager**, **SSM**, **CloudWatch**
  (dashboard + 5 alarms → SNS), and IAM for **Bedrock/Polly/Transcribe**.
- **Frontend hosting** (`frontend.tf`): per site (`var.frontend_sites`, default one
  `main` site) a private **S3** bucket + **CloudFront** distribution with an Origin
  Access Control and a viewer-request CloudFront Function that appends `index.html`
  for directory-style routes. Default cloudfront.net cert (no custom domain). The
  backend CORS allowlist auto-includes these CloudFront origins; `var.backend_cors_origins`
  holds the transitional Vercel URLs during cutover.
- **Note:** ECS services register at `desired_count=0`; the deploy workflow scales
  them up after pushing the first image.

---

## 8. CI/CD

GitHub Actions, all AWS access via **OIDC** (no static keys); scoped by subject
(PR → plan only, `main` → apply/deploy).

| Workflow | Trigger | Does |
|---|---|---|
| `plan.yml` | PR touching `infra/terraform/**` | fmt-check, validate, plan → PR comment |
| `apply.yml` | push to `main` (infra) | `terraform apply -auto-approve` |
| `deploy-backend.yml` | push to `main` (backend) / dispatch | build → Trivy scan → push → start RDS + Alembic migrate → deploy backend & worker → scale → health check |
| `deploy-frontend.yml` | push to `main` (frontend) / dispatch | `next build` static export → S3 sync (per site) → CloudFront invalidation |
| `migrate-backend.yml` | manual | one-off `alembic upgrade head` task |
| `terraform-security.yml` | PR / push / dispatch | Trivy config scan |
| `codeql.yml` | PR / push / weekly | CodeQL (python, js/ts) |
| `gitleaks.yml` | PR / dispatch | secret scan |

> There is no dedicated lint/unit-test workflow yet — CI today is security scans +
> Terraform + deploy.

---

## 9. Observability & cost guardrails

- **OpenTelemetry → Honeycomb:** `backend/app/telemetry.py` configures a
  TracerProvider + OTLP exporter and auto-instruments FastAPI and SQLAlchemy;
  spans go to an OTel collector sidecar (`otel/opentelemetry-collector-contrib`)
  that exports to `api.honeycomb.io`. Enabled in the sandbox; ships to Honeycomb
  only when the external `HONEYCOMB_API_KEY_SECRET_ARN` is set, otherwise the
  collector uses a debug exporter.
- **CloudWatch:** primary first-pass observability — dashboard, log groups, 5
  metric alarms (5xx, latency, unhealthy targets, queue backlog, DLQ) → SNS.
- **Cost guardrails (deployed):** AWS Budgets — a $1,000/month account budget and a
  $200/month Anthropic-Marketplace budget — plus Cost Anomaly Detection ($15
  threshold), all notifying an SNS topic.

> **Planned:** per-session/IP API rate limiting is documented (issue #89) but not
> enforced in code; only input/output size caps and the ingest admin-token gate
> exist today.

---

## 10. Frontend deploy runbook & validation

The frontend is a static export on S3 + CloudFront (`frontend.tf`,
`deploy-frontend.yml`). Vercel is retired.

### First-time / infra bring-up

1. Merge this change, then let `apply.yml` run (or `terraform apply` locally). This
   creates the frontend bucket(s), CloudFront distribution(s), the URL-rewrite
   function, and the `/empress/frontend/sites` SSM parameter, and updates the
   backend `CORS_ORIGINS` to include the new CloudFront origin(s).
2. Backend CORS picks up the new origins on the next backend task rollout
   (`deploy-backend.yml`), since `CORS_ORIGINS` is a task-definition env var.

### Routine deploy (automatic)

- Any push to `main` touching `frontend/**` triggers `deploy-frontend.yml`:
  `npm ci` → build with `NEXT_PUBLIC_API_BASE_URL` read from
  `/empress/backend/public_api_base_url` → `aws s3 sync` (HTML revalidated,
  `_next/` cached immutably) → `cloudfront create-invalidation "/*"`.
- Manual trigger: **Actions → deploy-frontend → Run workflow**.

### One-off manual deploy

```bash
cd frontend
API_BASE=$(aws ssm get-parameter --name /empress/backend/public_api_base_url \
  --query 'Parameter.Value' --output text)
NEXT_PUBLIC_API_BASE_URL="$API_BASE" npm run build
SITES=$(aws ssm get-parameter --name /empress/frontend/sites \
  --query 'Parameter.Value' --output text)
BUCKET=$(echo "$SITES" | jq -r '.main.bucket')
DIST=$(echo "$SITES" | jq -r '.main.distribution_id')
aws s3 sync out/ "s3://$BUCKET/" --delete --exclude "_next/*" \
  --cache-control "public, max-age=0, must-revalidate"
aws s3 sync out/_next/ "s3://$BUCKET/_next/" --delete \
  --cache-control "public, max-age=31536000, immutable"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*"
```

### Validation

- `terraform output frontend_site_urls` → open each URL; the landing page loads
  over HTTPS.
- Deep links resolve (not 403/404 XML): `/explore/`, `/explore/captain_sinclair/`.
- DevTools → Network: `/chat` and `/voice/synthesize` requests target the backend
  CloudFront HTTPS URL (not `127.0.0.1`), with **no CORS or mixed-content errors**.
- A spoken or typed prompt returns a narrator response; `POST /voice/synthesize`
  plays audio (or documents the browser-TTS fallback).
- `curl -sI https://<frontend-distribution>.cloudfront.net/` returns `200` and a
  `content-type: text/html` for the landing page.

### Adding / removing a second site

- Add an entry to `var.frontend_sites` (e.g. `gyro-test = { comment = "…" }`) and
  apply; the workflow deploys every site in the SSM map automatically.
- Retiring Vercel: once traffic is on AWS, empty `var.backend_cors_origins` to drop
  the legacy Vercel origins from the backend CORS allowlist.
