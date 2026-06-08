# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 2 (June 3 – June 9, 2026)
Date: 2026-06-08

## 1. Task / Goal
Issue #20 — [infra] AWS Budgets + Cost Explorer for $1,000 spend tracking. Stand
up cost guardrails on the shared Innovation Sandbox so we don't blow the $1,000
budget unnoticed: an account-wide monthly cost budget, SNS email alerts to all
four of us at spend thresholds, and the `Project` cost-allocation tag activated
so Cost Explorer can break spend down per project. Built on top of the
Terraform + plan/apply CI from Week 1.

## 2. AI Tools Used
Claude Code (Opus), same explore-first / plan-then-code workflow as Week 1.

## 3. Prompts / Agent Workflow
Four phases, with two deliberate gates before any code:
1. **Explore** — had Claude `ls` the existing `infra/` and read every Terraform
   file (`providers.tf`, `variables.tf`, the canary `main.tf`) plus both CI
   workflows, so the new resources would match our conventions instead of
   inventing new ones. This caught that `Project = EmpressOfJapan` is already a
   `default_tags` value — i.e. the cost-allocation tag is activatable as-is.
2. **Decide** — Claude surfaced one genuinely blocking decision (how to supply
   the alert emails, given CI applies with no `-var-file`) as a multiple-choice
   question rather than guessing. Picked "default list in `variables.tf`" so the
   no-var-file CI apply keeps working. Also locked two design calls: add
   FORECASTED alerts at 50/80% on top of the three ACTUAL thresholds, and keep
   cost-anomaly detection out of scope for this issue.
3. **Plan** — got a concrete file plan (new `budgets.tf`, edits to
   `variables.tf` / `outputs.tf` / `tfvars.example` / `README.md`) before code.
4. **Code → review → ship** — wrote the files, then ran a review pass *before*
   committing, then `fmt` / `validate` / commit / push / PR.

The reusable bit this week: forcing the **decision gate before the plan**. The
email-sourcing question had a real CI consequence (a variable with no default
breaks the non-interactive apply) that I'd not have thought about until the
pipeline failed.

## 4. Useful Output
- `infra/terraform/budgets.tf` — the whole feature in one file: SNS topic +
  topic policy + 4 email subscriptions (`for_each`), the `$1000` MONTHLY COST
  budget with a `dynamic "notification"` block, and the `Project`
  cost-allocation tag activation.
- `variables.tf` — `alert_emails`, `monthly_budget_limit`, `budget_thresholds`,
  `forecasted_thresholds`, all defaulted so CI applies cleanly.
- `outputs.tf` — SNS topic ARN + budget name. `tfvars.example` override
  examples. `README.md` — console viewing steps, threshold table, recipient
  list, and the SNS-confirmation + forecast-lag caveats.
- Branch `yaoyi/aws-budgets-cost-tracking`, PR #32.

## 5. Human Review / Changes
- **The credits catch (most important).** On the pre-commit review pass, Claude
  flagged that it had left `cost_types` at the provider default, which *includes*
  credits. Our sandbox is credit-funded, so a default budget would measure spend
  **net of credits** — net ≈ $0 — and the alerts would essentially never fire.
  Approved adding `cost_types { include_credit = false, include_refund = false }`
  so the budget tracks **gross** usage against the $1,000. This is the kind of
  thing that would have looked "green" forever while silently doing nothing.
- **SNS topic policy.** Confirmed Claude included an `aws_sns_topic_policy`
  letting `budgets.amazonaws.com` publish — without it budget→SNS delivery drops
  silently with no error in the budget. Good catch to have by default.
- **FORECASTED alerts are dormant at first** — AWS needs weeks of history to
  forecast, so those two won't fire on a fresh account. Made sure that's written
  in the README as expected behavior, not a bug, so nobody "fixes" it later.
- **Notification wiring** — approved the keyed-map `dynamic "notification"`
  (ACTUAL 20/50/80 + FORECASTED 50/80) over positional blocks, so adding/removing
  a threshold doesn't churn the others in the plan.
- **Verification** — `terraform fmt` clean and `terraform validate` passes.
  Could **not** run a live `terraform plan`: my `aws sso login` session had
  expired and I didn't re-auth, so I'm relying on the CI `plan` job on the PR.
  Noted in the PR body so the reviewer knows to check the plan output.
- **Post-merge action flagged for the team** — every recipient must click the
  SNS confirmation email or they get no alerts; the `Project` tag breakdown in
  Cost Explorer can take ~24h to populate. Both documented.

## 6. Reflection
The review-before-commit step earned its keep this week: the `cost_types`/credits
issue would have shipped a budget that looks correct in every plan and never
alerts — the worst kind of bug, because nothing visibly fails. Lesson is that for
billing/observability resources the default behavior is often the opposite of
what you want (credits netting spend down, forecasts silently dormant), so the
real review question isn't "is the syntax right" but "will this actually fire
when it should." Next time I'll re-auth SSO up front so I can run a local plan
before pushing instead of leaning on the CI loop — same Phase-A logic from last
week, I just skipped it because the session had lapsed.
