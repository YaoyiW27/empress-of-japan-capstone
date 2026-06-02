# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 1 (May 26 – June 1, 2026)
Date: 2026-06-01

## 1. Task / Goal
Issue #15 — [infra] AWS bootstrap script (S3 state + DynamoDB lock + OIDC IAM
role). Stand up the shared Terraform remote-state backend in our AWS Innovation
Sandbox so all four of us can collaborate on infrastructure safely, with CI
authenticating via GitHub OIDC instead of static keys.

## 2. AI Tools Used
Claude Code (Opus), driven in an explore-first / plan-then-code workflow.

## 3. Prompts / Agent Workflow
Three deliberate phases, no code until the design was agreed:
1. **Explore** — had Claude read `CLAUDE.md` + `CONTRIBUTING.md`, `WebFetch` the
   TA's `aws-team-playbook` to extract its bootstrap pattern (resources, OIDC
   trust-policy shape, IAM permission structure), and list our empty `infra/`.
   Then a one-paragraph proposal: what to build, adapt, and *not* copy.
2. **Plan** — locked decisions (Admin vs scoped IAM, OIDC sub tightening,
   naming, region, idempotency, secret-setting) and got a concrete file plan
   before writing.
3. **Code + run** — wrote the two files, ran `bootstrap.sh` against the live
   sandbox, verified every resource by hand, then wrote the teammate onboarding
   README from the real run values.

The most reusable prompt: *"Before we write any code, explore: read CLAUDE.md,
WebFetch the reference repo, list our infra/, then propose in one paragraph what
to build / adapt / not copy. DO NOT write code yet."* This explore-first framing
saved real time and surfaced design issues up front.

## 4. Useful Output
- `infra/bootstrap.sh` — idempotent, AWS-CLI-only backend bootstrap (S3 +
  DynamoDB + OIDC provider + IAM role + 3 GitHub secrets).
- `infra/bootstrap/iam-trust-policy.json.tmpl` — templated OIDC trust policy.
- `infra/README.md` — teammate AWS-SSO onboarding doc, written from real values.
- **Live infrastructure** in the sandbox (account 260256919823, us-west-2):
  bucket `empress-tfstate-9823`, table `empress-tflock`, the GitHub OIDC
  provider, and role `empress-gha-deploy` — all verified.

## 5. Human Review / Changes
- **AdministratorAccess vs scoped IAM** — pushed back on the playbook's blanket
  Admin grant. Decided to keep Admin for sandbox simplicity (contained blast
  radius) but required a `TODO(security)` to scope down before any non-sandbox
  use. Confirmed Admin is the *only* attached policy.
- **OIDC `sub` tightening** — approved Claude's design to restrict the trust
  policy to `ref:refs/heads/main` (apply path) and `pull_request` events (plan
  path), instead of the playbook's `repo:…:*`. Random feature branches cannot
  assume the role. Kept `StringLike` so we can add environment-scoped patterns
  later without restructuring.
- **README content (SSO start URL + account ID)** — flagged as mild internal-info
  leakage. **Decision:** repo is private and stays private through the capstone,
  so we leave these in for teammate convenience. *If we ever make the repo
  public, that is the trigger to rotate to a `.env`-pattern / placeholders.*
  Recording here for the paper trail.
- **Verification** — confirmed all four resources by hand:
  `aws iam list-open-id-connect-providers`, `aws s3 ls`,
  `aws dynamodb list-tables`, and `gh secret list` (3 secrets present).
- **AWS_PROFILE gotcha** — non-interactive shells don't load `~/.zshrc`, so the
  run needed an explicit `AWS_PROFILE=empress`. Noted for the upcoming
  plan/apply CI work (OIDC assume-role doesn't use profiles, but script-driven
  `terraform init` re-runs will).

## 6. Reflection
Explore-first clearly paid off: the very first proposal already caught both the
AdministratorAccess concern and the OIDC-scope tightness without me prompting
for them — exactly the design conversations I'd want a senior reviewer to raise.
The step-by-step walkthrough of the trust-policy condition keys (`aud` exact-match
vs `sub` StringLike, and *why*) taught me the AWS IAM web-identity federation
model in a way the AWS docs hadn't. Next time: lock the real GitHub issue number
up front — I referred to it as "#2" but it was actually #15.
