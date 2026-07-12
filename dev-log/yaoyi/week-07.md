# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 7 (July 8 - July 14, 2026)
Date: 2026-07-08

## 1. Task / Goal
This week I focused on unblocking the RDS migration path, closing the last
runtime gaps that kept deployed features from matching local behavior, and
adding a cost guardrail ahead of the showcase:

- **Issue #128** - `alembic upgrade`/`current` against RDS crashed before any
  migration ran, which is the reason the cloud database was never migrated.
  Fix the URL handling so migrations can finally apply.
- **Issue #124** - `/voice/synthesize` returned 502 on the deployed backend
  while working locally. Grant the missing S3 permission so voice cache misses
  behave correctly.
- **Issue #62** - the DLQ and its alarm existed, but there was no written
  operator procedure. Document how to inspect and redrive dead-lettered jobs.
- **Issue #60** - the monthly budget only catches total spend crossing fixed
  thresholds. Add per-service anomaly detection and a cost-inspection runbook
  for the pre-demo checklist (PR #131).

## 2. AI Tools Used
I used Claude Code as an implementation, debugging, and operations partner. It
helped me reproduce a subtle Alembic crash locally, trace an IAM permission gap
across Terraform and a live deployed error, draft the DLQ and cost runbooks in
`infra/README.md`, and validate the Cost Anomaly Detection Terraform with a
real targeted plan before opening the PR.

## 3. Prompts / Agent Workflow
For issue #128, I asked Claude Code to help me understand why `alembic current` failed
against RDS but not obviously locally. We traced `backend/alembic/env.py` and
found it routed the database URL through `set_main_option`, which hands the
string to Alembic's `ConfigParser`. `BasicInterpolation` reads the `%` in a
URL-encoded password as interpolation syntax and raises "invalid interpolation
syntax", so the command died before running any migration. I reproduced the
`ValueError` on the old path, then changed `env.py` to pass the SQLAlchemy URL
object straight to `create_engine` (online) and to render it for
`context.configure` (offline), bypassing the ConfigParser entirely. I confirmed
the new path builds the engine with the password intact and that
`alembic current` still connects to the local DB.

For issue #124, I gave Claude Code the live 502 ("failed to check voice cache") and
asked it to compare the deployed IAM policy with the code path. The
`backend_voice_runtime` policy granted only object-level `s3:GetObject` and
`s3:PutObject`. On a cache miss, S3 `HeadObject` returns 403 instead of 404
without `s3:ListBucket`, and the cache check treats any non-404 `ClientError` as
a hard failure. Locally a broader SSO role hid this. I added a bucket-scoped
`s3:ListBucket` statement (no prefix condition, since HeadObject sends no
prefix) to `infra/terraform/voice.tf`.

For issue #62, I asked Claude Code to draft the DLQ runbook, then edited it down to
what an operator actually needs: what the `empress-jobs-dlq-visible` alarm means
and where it notifies, how to read a DLQ message without consuming it, the
redrive/discard/file-a-bug decision, how to redrive back to `empress-jobs` via
the SQS message-move task scoped `byQueue`, and why duplicate processing is safe
(ingest is idempotent by `content_hash`).

For issue #60 (PR #131), I asked for a plan first. We added `cost_anomaly.tf`
with a per-`SERVICE` anomaly monitor and a threshold subscription that alerts
the existing `empress-budget-alerts` SNS topic when an anomaly's impact meets a
configurable threshold (default $15), plus the `costalerts.amazonaws.com`
publish permission on the topic policy. I documented, in `infra/README.md`, how
to inspect AI/runtime cost by service (Bedrock, Fargate, RDS, ALB, logs, SQS,
voice) and a before-a-demo cost checklist. I ran `terraform fmt`/`validate` and
a targeted plan (2 to add, 1 in-place change, 0 to destroy).

## 4. Useful Output
- `backend/alembic/env.py` no longer crashes on passwords containing `%`; the
  URL object carries the encoded password safely into `create_engine`. This
  unblocks the cloud migration work in #129/#130.
- `infra/terraform/voice.tf` now grants bucket-scoped `s3:ListBucket`, so cache
  misses return 404 and `/voice/synthesize` proceeds. This unblocks the voice
  acceptance item in #109.
- `infra/README.md` gained a DLQ inspect/redrive runbook (#62) and an
  AI/runtime cost-inspection runbook plus pre-demo cost checklist (#60).
- `cost_anomaly.tf` adds free per-service Cost Anomaly Detection wired to the
  existing budget-alerts SNS topic, catching a single service (usually Bedrock
  or a left-running RDS) spiking above baseline before total spend would trip.

## 5. Human Review / Changes
- For the Alembic fix I did not stop at "it connects locally". The bug only
  reproduced with a `%`-encoded password, so I reproduced the exact `ValueError`
  on the old code path first, then verified the new path preserves the password
  rather than trusting that the command simply stopped erroring.
- For the S3 fix I kept the permission least-privilege: a bucket-scoped
  `s3:ListBucket` with no prefix condition, matching how HeadObject actually
  calls S3, instead of widening the object policy or the bucket scope.
- For the cost work I referenced the per-conversation assumptions from the
  operating-cost brief (`docs/visitor-ai-operating-cost-brief.pdf`, #55) rather
  than inventing new limits in the infra, per #60's acceptance criteria. I also
  documented that anomaly detection needs ~10 days of history to build
  baselines, so it stays quiet on a fresh account and should not be mistaken for
  "no anomalies".
- I did not commit any credentials while debugging the DB URL and voice IAM
  issues. The RDS password stays in Secrets Manager, and the fixes are about how
  the value is handled, not where it lives.
- These changes unblock rather than close their dependents: #128 unblocks the
  cloud migration (#129/#130), and #124 unblocks the `/voice/synthesize`
  acceptance item still tracked under #109.

## 6. Reflection
The recurring theme this week was "works locally, fails deployed", and in every
case the gap was an environment difference, not application logic. The Alembic
crash only appeared with a `%` in the password; the voice 502 only appeared
because the local SSO role was broader than the deployed task role. AI was
genuinely fast at proposing where to look once I framed each failure with the
live error, but the useful confirmation was always reproducing the specific
condition (the exact interpolation error, the 403-vs-404 on HeadObject) rather
than accepting a plausible explanation.

The cost work reinforced a similar point about signals: a monthly total-spend
budget is a lagging, coarse indicator, while per-service anomaly detection is
the earlier and more actionable signal for a demo-day budget. Writing the
runbook alongside the alarm mattered as much as the alarm itself, since the
value of a cost alert depends on someone knowing how to break spend down by
service when it fires.
