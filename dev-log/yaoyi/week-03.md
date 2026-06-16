# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 3 (June 11 – June 17, 2026)
Date: 2026-06-15

## 1. Task / Goal
Three things this week, all hanging off Alina's backend scaffold landing:

- **Cross-track review of PR #47** — [backend] FastAPI scaffold + SQLAlchemy/Alembic
  + ingest pipeline. As the infra owner I reviewed it for the things that bite *us*
  later: DATABASE_URL / region / Bedrock IAM compatibility, Alembic migration
  correctness against RDS, and whether the privacy pipeline actually fails *closed*.
- **Issue #48** — [infra] `bedrock:InvokeModel` IAM for Titan Embeddings V2 in
  `us-west-2`, so the ingest pipeline's `BedrockTitanEmbedder` can produce real
  1024-dim vectors instead of the `FakeEmbedder` stand-in. This was the only
  P1-this-week issue on my plate.
- **Issue #39** — [infra] SQS jobs queue + DLQ + scoped producer/consumer IAM for
  the async worker (#35). P3, pulled forward because it's fully self-contained
  infra and cheap at idle.
- **Issue #25** — [infra] shared/deployed RDS Postgres + pgvector path for the
  knowledge base. This is the first real cloud database shape: private RDS,
  Secrets Manager credentials, backend-only security-group access, schema apply
  notes, and an explicit cost-control story.

## 2. AI Tools Used
Claude Code (Opus 4.8), same explore-first / decision-gate / plan-then-code /
review-before-ship workflow as Weeks 1–2.

## 3. Prompts / Agent Workflow
- **Review first, build second.** Had Claude read the full `main...alina/backend-scaffold`
  diff *and* re-read all of `infra/terraform/` before saying anything, so the review
  was grounded in our actual conventions (region lock, OIDC/SSO cred path) rather
  than generic advice. Asked for the output **as GitHub PR review comments** pinned
  to file:line — that format forced specificity instead of a vague summary.
- **Decision gate before submitting the review.** Submitting an approval on a
  teammate's PR is an outward action, so Claude asked *how* to submit (approve +
  comments / approve clean / comment-only / request-changes) rather than guessing.
  I picked approve-clean with the findings as non-blocking notes — the privacy
  issues are "fix before the real ingest run," not merge blockers.
- **Plan gate before #48 code.** Made Claude lay out the file plan and, importantly,
  surface the one real scoping decision (see §5) before writing any Terraform.
- **#39** reused the same shape: read the issue, match `budgets.tf`/`bedrock.tf`
  conventions, write one focused file, `fmt`/`validate`, PR.
- **#25 had a bigger design gate.** The issue looked like "add RDS," but the repo
  did not have VPC/ECS/Fargate networking yet. I had Claude stop and reason about
  whether to wait for #42, use the default VPC, or create a small private network
  now. We picked the smallest reusable option: a sandbox VPC, two private subnets,
  a backend security group, and a DB security group that only trusts that backend
  SG. That lets #42 consume the network cleanly later without making the DB public
  or hardcoding a temporary personal IP.

One-branch-per-issue discipline held: #48 → `yaoyi/bedrock-titan-invoke-iam` (PR #49),
#39 → `yaoyi/sqs-jobs-queue` (PR #50), #25 → `yaoyi/rds-pgvector-secrets`, this log
rides with #25 because it describes the work done on that same branch. I explicitly
did *not* pile multiple infra issues onto one branch, to keep each squash-merge
revertible.

## 4. Useful Output
- **Review of PR #47** — approved, with a handful of findings logged for follow-up
  (see §5). Confirmed the things I most needed to: backend defaults `AWS_REGION=us-west-2`
  and `amazon.titan-embed-text-v2:0`, both matching our Terraform region lock, and the
  Bedrock client uses the default credential chain (no static keys) — clean against the
  OIDC/SSO path.
- **`infra/terraform/bedrock.tf`** (PR #49) — least-privilege `aws_iam_policy` granting
  `bedrock:InvokeModel` scoped to the single Titan V2 foundation-model ARN in `us-west-2`,
  plus a `bedrock_embedding_model_id` variable mirroring `backend/app/config.py` and an
  ARN output for #42 to consume.
- **`infra/terraform/sqs.tf`** (PR #50) — `empress-jobs` queue + `empress-jobs-dlq`
  (redrive at `maxReceiveCount=5`, `byQueue`-locked), two least-privilege send/consume
  policies, and SSM params for the queue URLs.
- **`infra/terraform/network.tf` + `rds.tf`** (#25) — a private sandbox VPC shape
  for the deployed backend path, plus `aws_db_instance.knowledge_base` on Postgres
  16 / `db.t4g.micro`, encrypted storage, no public endpoint, RDS-managed master
  password in Secrets Manager, a separate connection-metadata secret, and a
  standalone IAM policy for the future backend task role to read both secrets.
- **Cost-control schedule for RDS.** Added an EventBridge Scheduler target that
  stops the DB at 10pm America/Vancouver on weekdays. This is not perfect — RDS
  restarts stopped instances after 7 days — but it is a concrete sandbox guardrail
  until we know whether a constantly warm shared DB is needed.
- **RDS documentation.** Updated `infra/README.md` with how Alina/backend should
  apply `backend/db/schema.sql`, how to check `pg_available_extensions` for
  `vector`, why HNSW needs pgvector `>= 0.5.0`, and how to connect only from inside
  the VPC instead of opening Postgres to the internet.

## 5. Human Review / Changes
- **The privacy gate is fail-*open* on misclassification (most important finding on #47).**
  The Alembic view excludes passenger rows whose `voyage_date IS NULL`, and that column is
  always NULL today, so *tagged* passenger rows are correctly hidden. But `sensitivity`
  defaults to `'public'` and the only thing that promotes a row to `passenger_archival` is
  `material_type ∈ {"passenger_list"}` — a single value. Anything passenger-ish that
  normalizes to a different string defaults to public and becomes retrievable. Flagged as
  a follow-up (deny-by-default + a test), non-blocking only because `FakeEmbedder` + the
  NULL `voyage_date` mask it right now.
- **Donor blocklist drops short surnames.** The redactor requires tokens ≥4 chars / phrases
  ≥3, so names like "Ng"/"Li"/"Wu" never enter the blocklist — exactly the short romanized
  CJK surnames likely in this trans-Pacific collection. Real leak, logged for the backend
  track.
- **A guardrail that isn't wired in.** `assert_no_sensitive_columns` is defined but never
  called — noted so it gets connected or moved into a test.
- **Scoping call on #48 and #39 (the decision gate).** There is nothing to attach these IAM
  policies to yet: the Fargate task roles don't exist (#42, unstarted), and local dev runs
  under the AWS-Identity-Center-managed SSO permission set, which our Terraform can't touch.
  So both policies are **standalone + exported by ARN**, with #42 set up to attach them. I
  rejected attaching to the existing `empress-gha-deploy` role — it already has
  AdministratorAccess and doesn't run the pipeline, so it'd be a meaningless no-op.
- **Verification.** `terraform fmt -check` and `terraform validate` pass on both PRs. This
  week I actually fixed last week's miss: re-authed (`aws sso login --profile empress`) and
  ran a real local `terraform plan` against the shared state for both branches.
  - #48: **4 to add, 0 to change, 0 to destroy** — my `aws_iam_policy.bedrock_titan_embed_invoke`
    is the only resource the branch introduces.
  - #39: **10 to add, 0 to change, 0 to destroy** — my 7 resources (2 queues, the
    redrive-allow policy, 2 IAM policies, 2 SSM params) plus 2 policy-doc data reads.
  - Both show **0 change / 0 destroy**, confirming the changes are purely additive and touch
    nothing existing.
- **The local plan caught real drift (the payoff for re-authing).** Both plans also wanted to
  create 3 resources unrelated to my branches: the `Project` cost-allocation tag and 2 of the
  4 budget email subscriptions (Steven, Kelly). Those two never confirmed their SNS email, so
  the pending subscriptions expired and Terraform now wants to recreate them — i.e. our budget
  alerts are partially broken right now. `terraform validate` would never have surfaced this;
  only a plan against live state does. Flagged to the team as a separate fix (confirm the
  emails), not something to fold into these PRs.
- **Out-of-band step recorded.** Bedrock model access for Titan V2 has to be enabled once in
  the console (Bedrock → Model access) for the sandbox — not Terraformable — so I documented
  it in the #48 PR rather than pretending the policy alone unblocks the embedding run.
- **RDS secrets design changed during review.** My first instinct was to create a
  generated password secret directly in Terraform. Claude pushed on the state-file
  implications, and I switched to `manage_master_user_password = true` so RDS owns
  the password and stores it in Secrets Manager. Terraform still knows the managed
  secret ARN, but it does not need to generate or commit any password material.
- **The DB is deliberately not reachable from my laptop.** That made local smoke
  testing of `psql` impossible by design, but it is the right security posture for
  the acceptance criteria. The manual schema step is documented for an in-VPC path
  later: ECS task, SSM port forwarding, or a bastion if we add one.
- **Verification for #25.** `terraform fmt`, `terraform validate`, and a real local
  `terraform plan -no-color` against shared state all pass. The plan for the #25
  branch shows **21 to add, 0 to change, 0 to destroy**: VPC/subnets/route table,
  backend + DB security groups, RDS subnet group, RDS instance, Secrets Manager
  metadata secret/version, secret-read IAM policy, and the RDS stop scheduler role
  + schedule. It also still shows the unrelated budget drift from above, so I called
  that out rather than hiding it in the PR.

## 6. Reflection
The win this week was treating the cross-track review as real infra work, not a courtesy:
reading the backend diff against our own Terraform is what surfaced that the privacy gate
leans entirely on positive tagging while the column default is the permissive value — the
same "looks green, silently wrong" failure mode as last week's `cost_types`/credits bug,
just in a privacy context instead of billing. The recurring lesson is that the dangerous
defaults are the ones nothing complains about.

I also closed last week's loop: instead of leaning on CI for the plan again, I re-authed SSO
and ran the plan locally — and it immediately paid off by surfacing the expired budget-email
subscriptions, which "validate passes" would have hidden indefinitely. That's the concrete
proof of the point I keep making to myself: "validate passes" only checks syntax; a plan
against live state is the only thing that shows the diff you're actually about to apply *and*
the drift that's already there. Two clean, self-contained PRs shipped (#49, #50); both
intentionally stop short of the cross-track and #42 work they depend on, which is the right
scope boundary rather than a gap.

#25 added a second version of the same lesson: secure infra sometimes means the
happy-path demo is less immediate. A public RDS endpoint would have let me `psql`
from my laptop and feel done, but it would violate the actual acceptance criteria.
The better outcome was to make the network boundary explicit, document the in-VPC
schema-apply path, and export the exact security group / secret-read policy that
the future Fargate work can attach to. The useful AI move here was not writing HCL
faster; it was forcing the design question before the first resource existed.
