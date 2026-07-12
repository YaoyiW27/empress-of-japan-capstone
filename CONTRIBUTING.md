# Contributing to the Empress of Japan Capstone

Internal team workflow conventions. Last updated May 26, 2026.

---

## Team

| Name | Role | Owns |
|---|---|---|
| **Kelly** (Ching-Hsin Hsu) | Frontend & 3D Pipeline | `frontend/`, R3F, Next.js shell, glTF pipeline, Hongyu coordination |
| **Steven** (Suochun Fang) | UX & Voice Interaction | UX flows, agent personas, voice IO patterns, visitor research, curator dashboard usability |
| **Alina** (Qingman Li) | Multi-Agent Backend | `backend/`, FastAPI + LangGraph persona agents (Bedrock / Claude Sonnet 4-6), RAG on Postgres + pgvector |
| **Yaoyi** (Yaoyi Wang) | DevOps, Cloud & Observability | `infra/`, AWS, Terraform, CI/CD, OTel → Honeycomb, CloudWatch, $1,000 budget |

**Supporting:** Hao Wu (TA, weekly), Prof. Lino (weekly), Prof. Coady (milestones), Ashley Smith (VMM, biweekly), Hongyu (3D assets).

---

## Where work lives

We use **GitHub Projects** for planning and tracking. Everything in one tool — code, PRs, issues, board, AI dev logs.

- **GitHub Issues** — every task is an issue, assigned to one of us
- **GitHub Projects board** — kanban view of what's in flight, what's blocked, what's done
- **GitHub Pull Requests** — every change to `main` goes through a PR
- **`dev-log/<name>/<week>.md`** — weekly AI-assisted development log (Prof. Coady evaluates this)

---

## Branch & PR rules

These are non-negotiable. Branch protection enforces most of them.

- **Nobody pushes directly to `main`.** Always open a feature branch.
- **Every change goes through a PR**, even one-line fixes.
- **Each PR needs 1 approval before merge.** Cross-track changes should be reviewed by the affected track's owner.
- **Squash and merge** is our default. One PR = one commit on `main`.
- **Branch naming:** `<your-name>/<short-kebab-description>`
  - Examples: `yaoyi/aws-bootstrap-script`, `kelly/r3f-scaffold`, `alina/pgvector-schema`
- **PR title:** clear and descriptive — `[infra] Add bootstrap.sh for S3 + DynamoDB backend`
- **PR body should include:** what changed, why, how it was tested, and any follow-up issues to file.

If branch protection accidentally blocks you, ping the team — don't disable it to push.

---

## Definition of done

A task is "done" when **all** of these are true:

- Code merged to `main` via PR
- CI is green (lint, tests, and `terraform plan` if applicable)
- The corresponding GitHub Issue is closed
- Any user-visible behavior is mentioned in the next demo

---

## AI-assisted development log

Prof. Coady's grading rubric evaluates **our process of using AI in development**, not just the product. Every contributor commits a weekly log:

- **Location:** `dev-log/<your-name>/<YYYY-WXX>.md`
- **Cadence:** committed **before Wednesday class** each week
- **Format:**

```markdown
# Week 4 (May 26 – June 1) — <your name>

## AI tools used
- Claude Sonnet — agent design conversations, architecture review
- Cursor — Python autocomplete, small refactors
- ...

## What worked
- Used Claude to draft the LangGraph dispatch node that routes on `persona_id` to
  the right persona agent. Needed two rounds of refinement but ended up cleaner
  than what I'd have written from scratch.

## What didn't
- Tried Cursor's edit-selection on a complex pgvector query — it kept inventing
  column names. Faster to write by hand.

## Token / cost notes
- ~$1.20 in Bedrock calls this week.

## Snippets worth saving
- [Optional: 1-2 useful prompts]
```

---

## Team rhythm

| When | What | Length |
|---|---|---|
| **Wednesday 3–4pm** | Sprint retro + next sprint planning (all four) | 60 min |
| Daily | Async standup in Teams | — |
| Sun/Mon evening | Optional mid-sprint sync if anyone's blocked | 30 min |
| Wednesday before class | Pre-class demo + alignment | 15 min |

Retro covers: what shipped last week, what blocked us, what's planned next.

---

## Things we never commit

These are in `.gitignore` and must stay there:

- **Donor data** — `data/raw/`, any `*.donor.csv`, the original `export_empress_of_japan.csv` from Ashley
- **AWS credentials** — `.env`, `.aws-credentials`, any `*.pem`
- **Terraform state** — `*.tfstate*`, `.terraform/`
- **Local secrets** of any kind

If you accidentally commit one of these: tell the team immediately on Teams/WeChat and rewrite history before pushing.

---

## Stakeholder contact

- **Ashley Smith (VMM curator):** Email + biweekly working session, ramping to weekly hallucination audits from W7. **Alina** primary liaison.
- **Prof. Coady:** Wednesday class + per-milestone reviews.
- **Hao Wu (TA) + Prof. Lino:** weekly standup.
- **Hongyu (3D pipeline):** Email as needed. **Kelly** coordinates the 3D asset handoff.

Log meaningful stakeholder communications as GitHub Issues with a `stakeholder` label so the team shares context.

---

## Week 1 (May 26 – June 1) — Phase 1: Foundation kickoff

Each of us has one or two starter tasks. The goal of Week 1 is **everyone can run their part of the stack locally**, even if it's empty.

**Phase 1 gate (June 9):** Infra green · data ingested · scaffold live.

### Yaoyi — DevOps & Observability
- [ ] AWS bootstrap script (S3 state + DynamoDB lock + OIDC IAM role)
- [ ] Two GitHub Actions workflows: `plan.yml` (on PR) and `apply.yml` (on merge)
- [ ] `CLAUDE.md` committed for the team's Claude Code setup
- [ ] AWS Innovation Sandbox credentials shared with Alina (for backend dev)

### Kelly — Frontend & 3D Pipeline
- [ ] Coordinate with Hongyu on glTF model format and first test handoff
- [ ] Scaffold Next.js + TypeScript + Tailwind project under `frontend/`
- [ ] Add React Three Fiber + drei dependencies; render a placeholder 3D scene with OrbitControls
- [ ] Document local-dev workflow in `frontend/README.md`

### Steven — UX & Voice Interaction
- [ ] Draft UX wireframes (Figma or hand-sketched) for visitor -> agent conversation flow
- [ ] First draft of agent persona descriptions (3–5 personas — Storyteller, Curator, plus a few passenger archetypes)
- [ ] Outline visitor research plan: who we interview, what we ask

### Alina — Multi-Agent Backend & Data
- [ ] Audit Ashley's CSV locally — confirm columns, record counts, donor field presence (do not commit the CSV)
- [ ] Design Postgres + pgvector schema for the knowledge base (document under `data/schema.md`)
- [ ] Draft follow-up email to Ashley with the three open questions:
  - One ship vs both? (Empress of Japan I vs II coverage)
  - Can we use passenger names from archival lists in AI content?
  - What languages should the experience support?
- [ ] Once schema is settled, sketch the ingest pipeline outline

---

## Quick links

- Project plan (full report) — `docs/project-plan.md` *(to be committed)*
- Architecture — `docs/architecture.md`
- TA's AWS team playbook (reference, not template) — https://github.com/wuhao2809/aws-team-playbook
