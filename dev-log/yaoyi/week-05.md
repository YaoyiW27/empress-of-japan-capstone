# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 5 (June 25 - July 1, 2026)
Date: 2026-06-29

## 1. Task / Goal
This week I focused on two infrastructure areas and one cross-track review:

- **Issue #96 / PR #100** - provisioned the AWS voice runtime for Amazon
  Transcribe and Polly, including a private S3 audio cache, scoped IAM, runtime
  configuration, lifecycle cleanup, and KMS encryption.
- **Issue #41** - activated the existing OpenTelemetry-to-Honeycomb deployment
  path by passing the Secrets Manager ARN through GitHub Actions and enabling
  backend OTel for Terraform plan/apply.
- **PR #99** - reviewed the backend async ingest worker, its SQS trace
  propagation, retry behavior, and administrative security boundary.

## 2. AI Tools Used
Codex was used as a step-by-step engineering and review partner. It helped me
inspect the current repository and live AWS state, design least-privilege IAM,
interpret CI findings, review another track's PR, and keep the work split into
small commits that I could inspect before committing.

## 3. Prompts / Agent Workflow
For the voice infrastructure, I asked Codex to implement one small piece at a
time: create the private cache, add runtime permissions, inject configuration,
then harden and validate it. After each step I reviewed the diff and created a
separate commit.

For PR #99, I asked Codex to review the code rather than only summarize the PR.
We checked the worker entrypoint, public API boundary, SQS retry/delete behavior,
and parent-child span relationships. After Qingman addressed the findings, I
reviewed the follow-up commit and approved the backend code scope.

For Honeycomb, we compared the merged Terraform code with the active ECS task
definition in AWS. This revealed that the observability components existed but
the deployed service still had `OTEL_ENABLED=false` and no Honeycomb secret
injection. We then wired the repository variable into plan/apply instead of
making an undocumented manual AWS change.

## 4. Useful Output
- PR #100 adds a private Polly cache with public access blocked, HTTPS enforced,
  a 30-day lifecycle, and a dedicated rotating KMS key.
- The backend task role receives scoped Polly, Transcribe Streaming, S3-prefix,
  and KMS permissions. Raw visitor microphone audio is not stored.
- Voice runtime settings are injected through ECS, while AWS credentials remain
  provided by the task role.
- Terraform plan/apply now read `HONEYCOMB_API_KEY_SECRET_ARN` from a GitHub
  repository variable and enable backend OpenTelemetry. The actual ingest key
  remains in AWS Secrets Manager.
- PR #99 now initializes telemetry in the standalone worker, protects the ingest
  endpoint with an admin token, uses server-controlled source paths/embedder,
  and keeps process/delete spans connected to the originating SQS trace.

## 5. Human Review / Changes
- Trivy rejected the first S3 encryption configuration because it used the AWS
  managed AES256 default. I changed the cache to a customer-managed KMS key,
  enabled rotation and bucket keys, and scoped the backend's KMS permissions.
- I requested changes on PR #99 because the worker did not initialize telemetry,
  the public ingest endpoint had no authorization, clients could choose paths
  and Bedrock usage, and the delete span left the extracted trace context.
- I kept PR #99 as `Refs #35/#98` because its worker is not yet deployed and
  runtime traces are not yet verified.
- I also kept PR #100 as `Refs #41` instead of `Closes #41`. Issue #41 should
  close only after ECS is redeployed, Honeycomb receives API/worker traces, and
  autoscaling behavior is validated.
- Local PR #99 tests could not run in my current Python environment because the
  backend dependencies were not installed, so I separated that environment
  limitation from the code review and checked the available GitHub CI results.

## 6. Reflection
The main lesson this week was the difference between provisioning a capability
and operating it. PR #90 had already created the collector sidecar, dashboard,
and secret wiring, but the live ECS revision still used the disabled defaults.
Checking the actual AWS task definition prevented me from incorrectly claiming
that Honeycomb was already receiving traces.

AI was most useful for tracing behavior across repository code, CI, GitHub, and
AWS runtime state. Human review was still necessary to decide what should block
a merge, where secrets belong, and when an issue is genuinely complete rather
than only implemented in code.
