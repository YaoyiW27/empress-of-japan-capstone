# CLAUDE.md

Instructions auto-loaded into every Claude Code session in this repo. Keep terse —
read `CONTRIBUTING.md` (and, once it exists, `docs/architecture.md`) for full detail.

---

## What we're building

The Empress of Japan capstone is an interactive, **in-browser 3D + multi-agent
web experience** for the Vancouver Maritime Museum (VMM) — a navigable
WebXR-style 3D scene rendered with React Three Fiber, paired with a LangGraph
multi-agent backend so visitors can converse with personas tied to the
Empress of Japan I & II ocean liners (Storyteller, Curator, passenger
archetypes). Agent knowledge is grounded in VMM archival material via RAG on
Postgres + pgvector.

- **Course:** Northeastern CS 7980 Capstone, Summer 2026
- **Primary stakeholder:** Ashley Smith, VMM curator
- **Final showcase:** 2026-08-10
- **Budget:** ~$1,000 AWS sandbox (Yaoyi tracks)

---

## Team — track owners

| Person | Track | Owns |
|---|---|---|
| **Kelly** (Ching-Hsin Hsu) | Frontend & 3D Pipeline | `frontend/`, R3F + Next.js shell, glTF pipeline, Hongyu coordination |
| **Steven** (Suochun Fang) | UX & Voice Interaction | `ux-voice/`, UX flows, agent personas, voice IO, curator dashboard |
| **Alina** (Qingman Li) | Multi-Agent Backend | `backend/`, FastAPI + LangGraph, RAG on Postgres + pgvector |
| **Yaoyi** (Yaoyi Wang) | DevOps, Cloud & Observability | `infra/`, AWS, Terraform, GitHub Actions, OTel → Honeycomb, CloudWatch |

Cross-track edits need review from the affected track's owner.

---

## Reference docs

- **`CONTRIBUTING.md`** — team workflow, branch/PR rules, definition of done,
  weekly AI dev-log format. **Read this first.**
- `docs/architecture.md` — system architecture *(to be committed)*
- `docs/project-plan.md` — full project plan *(to be committed)*
- `data/schema.md` — Postgres + pgvector schema *(to be committed by Alina)*
- **TA Hao Wu's AWS playbook** — https://github.com/wuhao2809/aws-team-playbook
  — treat as a **reference pattern, not a template**. Borrow ideas (bootstrap
  shape, OIDC trust policy, plan/apply workflow split); don't copy wholesale.

---

## Branch & PR rules (enforced — see CONTRIBUTING.md for the full list)

- No direct pushes to `main`. Branch as `<name>/<short-kebab>`
  (e.g. `yaoyi/aws-bootstrap-script`).
- Every change goes through a PR. 1 approval required. **Squash and merge.**
- PR title style: `[track] short imperative` —
  e.g. `[infra] Add bootstrap.sh for S3 + DynamoDB backend`.
- Definition of done: merged + CI green (lint, tests, `terraform plan` if
  applicable) + Issue closed + user-visible behavior noted for next demo.
- Weekly AI dev-log at `dev-log/<name>/<YYYY-WXX>.md` before Wednesday class.

---

## Things we never do

- **Never commit donor data.** Nothing under `data/raw/`, no `*.donor.csv`,
  not the original `export_empress_of_japan.csv` from Ashley. If something
  slips in: notify the team on Teams/WeChat immediately and rewrite history
  before pushing.
- **Never commit Terraform state.** No `*.tfstate*`, no `.terraform/`, no
  `*.tfvars` (except `*.tfvars.example`). State lives in S3 with a DynamoDB
  lock — that is the only source of truth.
- **Never write AWS credentials to env files or any committed file.** GitHub
  Actions authenticates via OIDC into a scoped IAM role; local dev uses AWS
  SSO or short-lived sandbox creds. No `.env`, `.aws-credentials`, or `*.pem`
  in the repo, ever.
- **Never push to `main`, force-push, or bypass branch protection.** If
  protection blocks you, ping the team — don't disable it.

---

## LLM access pattern (backend)

Prefer the **AWS Bedrock SDK** over the direct Anthropic API for model calls
from `backend/`. Reasons:

- Keeps spend on the $1k AWS sandbox rather than a separate Anthropic bill
- Single IAM-governed credential path; no extra API keys to rotate
- Telemetry flows through CloudWatch + OTel alongside the rest of our infra

If there's a concrete reason to call the Anthropic API directly (feature
parity gap, region availability), call it out in the PR description so Yaoyi
and Alina can weigh in.

---

## Working style in this repo

- Prefer editing existing files to creating new ones.
- Don't create READMEs or extra docs unless explicitly asked.
- Match the track owner's conventions when editing their directory.
- When scope is unclear, default to the asker's Week 1 starter tasks in
  `CONTRIBUTING.md`.
