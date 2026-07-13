# Empress of Japan — VMM Capstone

An interactive, in-browser experience for the Vancouver Maritime Museum (VMM):
visitors step aboard a 360° recreation of the *Empress of Japan* ocean liners and
converse with historical personas (a captain, a first-class passenger, a crew
member) grounded in VMM archival material.

- **Course:** Northeastern CS 7980 Capstone, Summer 2026
- **Primary stakeholder:** Ashley Smith, VMM curator
- **Final showcase:** 2026-08-10

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for team workflow and
[`CLAUDE.md`](CLAUDE.md) for repo conventions.

---

## Architecture at a glance

```
Visitor (browser)
  ├─ Next.js 16 App Router + React 19
  ├─ React Three Fiber: 360° panorama viewer (drag + gyroscope) + GLB ship model
  ├─ Voice in: Web Speech API (STT)   Voice out: AWS Polly (S3) w/ browser fallback
  └─ Chat: fetch POST /chat  ──────────────┐
                                            ▼
                              CloudFront ─▶ ALB ─▶ ECS Fargate (FastAPI)
                                            │
                    ┌───────────────────────┼───────────────────────────┐
                    ▼                        ▼                           ▼
              LangGraph               Postgres 16 + pgvector        AWS Bedrock
        dispatch ─▶ persona ─▶ END    (RAG store, Titan embeds)   (Claude Sonnet 4-6,
        (persona picked at API)       via /retrieve endpoint       Titan embeddings)
```

Everything runs in a ~$1,000 AWS sandbox in `us-west-2`.

---

## Tech stack

| Layer | What's used |
|---|---|
| **Frontend** | Next.js 16.2 (App Router), React 19, TypeScript, Tailwind v4, Turbopack |
| **3D** | React Three Fiber + drei + three — 360° equirectangular panorama viewer (pointer + phone gyroscope) and a GLB ship model |
| **Voice** | STT: browser Web Speech API · TTS: AWS Polly (cached to S3), with browser `speechSynthesis` fallback |
| **Backend** | FastAPI (Python 3.12), LangGraph, SQLAlchemy 2.0 + Alembic, psycopg 3 |
| **LLM** | AWS Bedrock (`ChatBedrockConverse`) — Claude Sonnet 4-6 (`us.anthropic.claude-sonnet-4-6`) |
| **RAG** | Postgres 16 + pgvector (HNSW cosine); Amazon Titan Text Embeddings V2 (1024-dim) |
| **Async** | AWS SQS (ingest jobs) + a standalone worker process; no Redis/Celery |
| **Infra** | Terraform → ECS Fargate, RDS Postgres, ALB, CloudFront, ECR, S3+KMS, SQS, Secrets Manager, SSM |
| **CI/CD** | GitHub Actions with OIDC (no static keys); Trivy, CodeQL, Gitleaks scans |
| **Observability** | OpenTelemetry → Honeycomb (collector sidecar); CloudWatch dashboard + alarms |

---

## Repo layout

| Path | Owner | Contents |
|---|---|---|
| `frontend/` | Kelly | Next.js + R3F app (panorama experience, narrator overlay, voice) |
| `backend/` | Alina | FastAPI + LangGraph agents, RAG retrieval, ingest pipeline |
| `infra/` | Yaoyi | Terraform (`infra/terraform/`), AWS, observability |
| `.github/workflows/` | Yaoyi | Terraform plan/apply, backend deploy, security scans |
| `data/` | Alina | pgvector schema, persona/scene definitions (`data/ai/`) |
| `dev-log/` | all | Weekly AI-assisted dev logs |
| `docs/` | all | Architecture and project plan *(in progress)* |

---

## How a visitor query flows

1. Visitor opens `/explore/[narratorId]`, sees the panorama and the narrator overlay.
2. Taps 🎤 (Web Speech API transcribes) or types a message.
3. Frontend `POST /chat` with `{persona_id, scene, message, history}` → CloudFront → ALB → FastAPI.
4. FastAPI resolves the persona and calls the LangGraph graph: `dispatch` routes on
   `persona_id` to the matching persona node, which calls Bedrock (Claude Sonnet 4-6)
   with that persona's system prompt.
5. Response returns as a single JSON payload (no streaming for chat).
6. Frontend requests `POST /voice/synthesize`; Polly renders audio, cached in S3, played back.
7. Traces flow to Honeycomb via the OTel sidecar; logs/metrics to CloudWatch.

---

## Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health`, `/health/db` | Liveness / DB readiness |
| `POST` | `/chat` | Persona agent chat |
| `POST` | `/retrieve` | pgvector similarity search (top-k, default 5 / max 20) |
| `POST` | `/voice/synthesize` | Polly TTS → S3 URL |
| `WS` | `/voice/transcribe` | Streams PCM to Amazon Transcribe |
| `POST` | `/ingest/jobs` | Admin-gated (X-Admin-Token) ingest enqueue → SQS |

---

## Running locally

> Ports 8000/5432/3000 are commonly taken; this repo defaults local dev to
> 8001/5433/3001. Adjust to taste.

**Backend** (`backend/`):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head            # against a local Postgres+pgvector
uvicorn app.main:app --port 8001
```

The chat model defaults to a deterministic `stub` (no AWS creds needed). Set the
Bedrock model in config to use live Claude Sonnet 4-6.

**Frontend** (`frontend/`):

```bash
cd frontend
npm install
# .env.local: NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
npm run dev
```

**Infra** (`infra/terraform/`): Terraform state lives in S3 with a DynamoDB lock —
never commit `*.tfstate*` or `.tfvars`. Deploys happen through GitHub Actions
(`plan` on PR, `apply` on merge to `main`).

---

## Current status & known gaps

Built and working:

- 360° panorama experience with drag + gyroscope look controls, per-narrator routes
- Voice in (Web Speech) and out (Polly with browser fallback)
- FastAPI + LangGraph persona chat over Bedrock
- pgvector RAG store, embeddings, and `/retrieve` endpoint
- Full Terraform-managed AWS stack, OIDC CI/CD, OTel → Honeycomb, cost budgets

Planned / not yet wired (tracked in Issues):

- **RAG is not yet connected to `/chat`** — personas currently answer from their
  system prompt alone; `/retrieve` exists as a standalone endpoint.
- **The agent graph is a single hop** (`dispatch → persona → END`) with no
  supervisor/router LLM and no agent-to-agent handoff; persona is chosen at the
  API layer. A richer multi-agent topology is a target, not current state.
- **API rate limiting is documented but not enforced** in code (issue #89); only
  input/output size caps and the ingest admin-token gate exist today.
- **Chat is request/response**, not streamed.
