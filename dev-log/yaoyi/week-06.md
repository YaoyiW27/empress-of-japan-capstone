# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 6 (July 2 - July 8, 2026)
Date: 2026-07-05

## 1. Task / Goal
This week I focused on making the AWS demo path observable and safer to expose:

- **Issue #41** - repaired the Honeycomb collector deployment, rotated the
  ingest key, verified live backend traces, and added CloudWatch alarms for the
  API, jobs queue, and dead-letter queue.
- **Issue #109** - added a CloudFront HTTPS/WSS endpoint for the backend,
  restricted direct ALB access to CloudFront, configured the two current Vercel
  origins for CORS, and changed deployment health checks to use the public HTTPS
  endpoint.
- **Issue #63** - documented the decision to keep one AWS sandbox through the
  showcase, with concrete signals for when separate dev/demo environments would
  become worthwhile.
- **PR #113** - reviewed Alina's RAG retrieval and ingest enrichment changes and
  tested the backend before submitting a blocking database-configuration
  finding.

## 2. AI Tools Used
I used Codex as an implementation, review, and operations partner. It helped me
trace an ECS startup failure across Terraform and Secrets Manager, inspect PR
changes and run backend tests in an isolated worktree, plan the CloudFront and
alarm changes, check a real Terraform plan, and divide the work into small,
reviewable commits.

## 3. Prompts / Agent Workflow
For Honeycomb, I asked Codex to investigate why a collector that had worked the
previous week stopped sending data. We compared the ECS secret reference with
the actual Secrets Manager value and found that the secret was a JSON object,
while ECS was injecting the whole object as the API key. We changed the task
definition reference to select `api_key`, updated the variable documentation,
and validated the Terraform change before opening PR #106.

After that PR merged, I created a new Honeycomb ingest key and saved it as the
`api_key` field in the existing AWS secret. We redeployed and used a Honeycomb
query filtered to `service.name = empress-backend` to confirm live `/health`
traces. The old exposed/revoked key was not reused.

For PR #113, I asked Codex for a code review rather than an implementation. We
ran Ruff and the backend test suite in a temporary Python 3.12 environment, then
compared the application's database settings with the environment variables in
the ECS task definition. The code read `DATABASE_URL`, but ECS supplies
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. A live request to
`/health/db` returned 503, so I requested changes and described a safe way to
construct the SQLAlchemy URL without logging credentials.

For issues #63, #41, and #109, I kept the related infrastructure work on one
branch but asked Codex to split it into ten focused commits. I reviewed the
Terraform plan for destructive replacements, restored narrowly scoped Trivy
exceptions with written rationale, and waited for Gitleaks, Trivy, and the CI
Terraform plan to pass on PR #114.

## 4. Useful Output
- PR #106 makes ECS read `${secret_arn}:api_key::` instead of injecting the
  entire Honeycomb JSON secret.
- Honeycomb now receives real `empress-backend` traces, including `/health`
  requests, and displays trace duration and span relationships.
- PR #114 provisions a CloudFront `cloudfront.net` HTTPS/WSS endpoint without
  requiring a paid custom domain or a separate Cloudflare plan.
- The ALB remains a CloudFront origin, but its security group accepts port 80
  only from AWS's managed CloudFront origin-facing prefix list.
- ECS receives an exact CORS allowlist for the main and mobile Vercel sites.
- The deploy workflow retrieves the public API URL from SSM and checks `/health`
  over HTTPS.
- CloudWatch alarms cover target 5xx responses, latency, unhealthy targets,
  visible jobs, and the DLQ, using the existing SNS notification topic.
- The runbook includes a bounded autoscaling test and records the one-sandbox
  recommendation and future environment-split triggers.
- PR #114 has ten small commits; Gitleaks, Trivy, and Terraform plan all pass.

## 5. Human Review / Changes
- I kept the Honeycomb secret in AWS Secrets Manager and did not commit or paste
  the replacement key into repository files. The value remains a JSON object
  with the exact field name expected by ECS.
- I distinguished Honeycomb ingest keys from configuration keys: the collector
  needs a least-privilege ingest key, while a configuration key is for managing
  boards, triggers, and SLOs and should not be used for telemetry ingestion.
- I did not approve PR #113 just because its unit tests passed. The live 503 and
  the mismatch between application settings and ECS configuration were runtime
  evidence that the PR was not deployable yet.
- I did not add WAF to the bounded course sandbox. PR #114 documents the Trivy
  exception, restricts the ALB to CloudFront, and leaves application rate
  limiting tracked in issue #89. This avoids silently adding recurring AWS cost.
- I did not close issues #41 or #109 from code alone. Issue #109 still needs the
  merged Terraform apply plus Vercel HTTPS/CORS and WebSocket verification.
  Issue #41 still needs the bounded autoscaling test and worker trace validation.
  Issue #63 can close when the documented recommendation merges.
- I preserved the separation between Vercel and AWS: Vercel hosts the two web
  clients, AWS runs the API and managed services, and CloudFront is the secure
  public edge for the AWS backend.

## 6. Reflection
The most useful lesson this week was that observability must be verified with
real data, not inferred from Terraform resources. The collector, secret, and
dashboard all existed, but one incorrect JSON secret reference prevented the
task from starting. A successful Honeycomb query was the real definition of
done for that repair.

The same principle improved the PR review. Passing tests showed that retrieval
logic worked in isolation, but the deployed ECS configuration and live database
health check exposed an integration failure. AI accelerated the comparison
across code, Terraform, CI, GitHub, and AWS; human judgment was still needed to
decide which findings should block approval, which security exceptions were
reasonable for a credit-funded sandbox, and when an issue was genuinely ready
to close.
