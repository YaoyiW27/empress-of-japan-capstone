# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 1 (May 26 – June 3, 2026)
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

---

# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 1 (May 26 – June 1, 2026)
Date: 2026-06-02

## 1. Task / Goal
Issue #13 — [infra] GitHub Actions `terraform plan`/`apply` workflows + a
Terraform "canary" module. Wire up the CI half of the infra story on top of
yesterday's bootstrapped backend: a real (if minimal) Terraform module that
proves the remote state + OIDC path end-to-end, and the two workflows that run
`plan` on PRs and `apply` on merge to `main`.

## 2. AI Tools Used
Claude Code (Opus), again driven in explore-first / plan-then-code mode.

## 3. Prompts / Agent Workflow
Same explore-first framing as yesterday, but split the *code* phase into two
gated phases to fail fast:
- **Phase A** — write the Terraform module first (versions / providers /
  variables / main / outputs / tfvars.example), then **pause** so I could run
  `terraform init`/`plan` locally before any workflow YAML existed.
- **Phase B** — only after the module compiled locally, write the two GitHub
  workflows and the `.gitignore` update.

The reusable pattern worth saving: *"pause after Phase A and let me run
`terraform init`/`plan` locally before you write the workflows."* It decouples
module bugs from workflow bugs — when something breaks you know which layer it's
in, instead of debugging a Terraform error through the CI feedback loop.

## 4. Useful Output
- **6 Terraform files** for the canary module: `versions.tf`, `providers.tf`,
  `variables.tf`, `main.tf`, `outputs.tf`, `terraform.tfvars.example`.
- **2 GitHub workflows**: `plan.yml` (PR-triggered) and `apply.yml`
  (merge-to-`main`-triggered).
- **`.gitignore` update** for Terraform artifacts (`*.tfstate*`, `.terraform/`,
  `*.tfvars`).
- Claude's clean adaptations from the TA playbook: path filters scoped to
  `infra/`, ECR steps stripped out (we don't need them yet), and a partial
  backend config for `terraform init`.

## 5. Human Review / Changes
- **Pushed back on the one-shot write.** Claude wanted to write all 8 files at
  once; I insisted on Phase A → local `terraform plan` → Phase B so module and
  workflow problems stay separable. Verified the module compiled locally before
  pushing anything.
- **Approved the sticky-comment-via-HTML-marker pattern** for posting the
  `plan` output back onto the PR (find-and-update a comment tagged with a hidden
  HTML marker, instead of spamming a new comment each run).
- **Issues hit and resolved:**
  1. **Terraform version mismatch** — Homebrew ships 1.5.7, but we want the
     1.15.x line from the `hashicorp/tap`. Installed via the tap; along the way
     learned about Terraform's BSL license change (the reason Homebrew's
     formula lags). Phase A's local-plan pause caught this early.
  2. **`dynamodb_table` parameter deprecation warning** — deliberately deferred;
     fixing it properly means touching `bootstrap.sh`, out of scope here.
  3. **Node.js 20 deprecation warning** in the workflow actions — not blocking
     before the Aug 10 handoff, noted and left.

## 6. Reflection
Explore-first paid off again — Claude proposed clean playbook adaptations (path
filters, stripped ECR, partial backend) *before* writing code, so the structure
was right the first time. The bigger win was the Phase A pause: it surfaced the
local Terraform version mismatch immediately, which would have been a real waste
of cycles if I'd only discovered it through a failed CI run. Decoupling module
bugs from workflow bugs is now my default for any "module + CI" change.
