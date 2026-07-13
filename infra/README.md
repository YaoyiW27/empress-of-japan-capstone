# infra/ — AWS backend & teammate access

DevOps track (Yaoyi). This directory holds the Terraform remote-state backend
bootstrap and (soon) the Terraform config + CI workflows.

The backend was bootstrapped **once** against our shared AWS Innovation Sandbox
by running `./bootstrap.sh`. **You do not need to re-run it** — the resources
below already exist and are shared by all four of us.

---

## What exists in the sandbox

| Resource | Name / ARN | Purpose |
|---|---|---|
| AWS account | `260256919823` | Shared sandbox (`us-west-2`) |
| S3 bucket | `empress-tfstate-9823` | Terraform state (versioned, AES256, public access blocked) |
| DynamoDB table | `empress-tflock` | Terraform state lock (`LockID` hash key) |
| OIDC provider | `token.actions.githubusercontent.com` | GitHub Actions federation |
| IAM role | `empress-gha-deploy` | Assumed by CI via OIDC (no static keys) |

CI finds these through three GitHub repo secrets — `AWS_DEPLOY_ROLE_ARN`,
`TF_STATE_BUCKET`, `TF_LOCK_TABLE` — already set on the repo.

The deploy role currently has `AdministratorAccess` because the sandbox is an
isolated, contained blast radius. **TODO:** scope this down to least-privilege
before any non-sandbox account. See the `TODO(security)` note in `bootstrap.sh`.

---

## Get AWS CLI access (one-time setup)

We all use AWS SSO against the same account with a profile named `empress`.

### 1. Configure the SSO profile

```bash
aws configure sso
```

Answer the prompts with these values:

| Prompt | Value |
|---|---|
| SSO session name | `empress-capstone` |
| SSO start URL | `https://identitycenter.amazonaws.com/ssoins-79070b803cca0005` |
| SSO region | `us-west-2` |
| SSO registration scopes | *(accept default: `sso:account:access`)* |
| Account | `260256919823` |
| Role | `myisb_IsbUsersPS` |
| CLI default client region | `us-west-2` |
| CLI default output format | `json` |
| CLI profile name | `empress` |

### 2. Make the CLI pick it up automatically

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
export AWS_PROFILE=empress
```

Open a new shell, or `source ~/.zshrc`.

### 3. Log in (repeat whenever the session expires)

```bash
aws sso login --profile empress
```

### 4. Verify

```bash
aws sts get-caller-identity     # "Account" should be 260256919823
```

---

## Cost tracking — $1,000/month budget (issue #20)

A Terraform-managed monthly **cost budget** (`budgets.tf`) watches our $1,000
sandbox spend and emails the whole team as we approach it. Terraform applies the
`Project = EmpressOfJapan` tag to managed resources; activating that tag inside
Cost Explorer is a management-account/manual step because the Innovation Sandbox
SCP denies `ce:UpdateCostAllocationTagsStatus` from this member account.

| Piece | Resource | What it does |
|---|---|---|
| Budget | `aws_budgets_budget.monthly` | `$1000` MONTHLY COST budget, account-wide |
| Anthropic budget | `aws_budgets_budget.anthropic_marketplace` | Filtered MONTHLY COST budget for Anthropic Marketplace charges |
| Alerts | SNS topic `empress-budget-alerts` | Fans notifications out to the team by email |
| Tagging | provider `default_tags` | Applies `Project = EmpressOfJapan` to Terraform-managed resources |

### Alert thresholds

- **ACTUAL** spend already incurred: **20% ($200), 50% ($500), 80% ($800)**.
- **FORECASTED** month-end spend: **50%, 80%** (early warning before the money's
  spent).
- The Anthropic Marketplace budget uses the same alert percentages against its
  own default **$200/month** limit, so it warns at **$40, $100, and $160**
  actual spend.

> ℹ️ FORECASTED alerts stay dormant for the first few weeks: AWS needs enough
> usage history to project month-end spend, so on a fresh account they simply
> won't fire yet. That's expected, not a misconfiguration. The ACTUAL alerts
> work immediately. The budget also tracks **gross** usage — credits and refunds
> are excluded (`cost_types` in `budgets.tf`) so a credit-funded sandbox doesn't
> net spend down to $0 and suppress every alert.

### Alert recipients (confirm your subscription!)

Alerts go to all four of us:

| Member | Email |
|---|---|
| Yaoyi (DevOps) | `wang.yaoyi@northeastern.edu` |
| Kelly (Frontend & 3D) | `hsu.chin@northeastern.edu` |
| Steven (UX & Voice) | `fang.su@northeastern.edu` |
| Alina (Backend) | `li.qingm@northeastern.edu` |

> ⚠️ After the first `apply`, AWS emails each of you an **"AWS Notification –
> Subscription Confirmation"**. **Click the confirm link** — until you do, your
> subscription is `PendingConfirmation` and you get no alerts. Check spam.

### View budget & costs in the console

- **Budget status:** Billing and Cost Management → **Budgets** →
  `empress-monthly-cost` and `empress-anthropic-marketplace-cost` (shows current
  vs. forecasted spend and which thresholds have fired). Outputs
  `monthly_budget_name` and `anthropic_marketplace_budget_name` echo the names.
- **Daily breakdown by service:** Cost Management → **Cost Explorer** → set
  *Granularity = Daily*, *Group by = Service*.
- **By project:** same view, *Group by = Tag → `Project`*, after a management
  account/admin user activates the `Project` cost allocation tag. Terraform
  cannot activate it from this sandbox member account because the organization
  SCP explicitly denies `ce:UpdateCostAllocationTagsStatus`. Cost Explorer can
  take **~24h** after activation to backfill it into breakdowns.

### Change the budget or thresholds

All knobs are variables (`variables.tf`) with defaults; edit and open a PR —
`apply` on merge picks them up:

| Variable | Default | Controls |
|---|---|---|
| `monthly_budget_limit` | `1000` | Total monthly budget in USD |
| `anthropic_marketplace_budget_limit` | `200` | Filtered monthly budget for Anthropic Marketplace charges |
| `budget_thresholds` | `[20, 50, 80]` | ACTUAL-spend alert % |
| `forecasted_thresholds` | `[50, 80]` | FORECASTED-spend alert % |
| `alert_emails` | the 4 above | Who gets alerts (re-confirmation needed for new addresses) |

Thresholds are percentages of each budget's own limit, so raising either limit
rescales that budget's dollar trigger points automatically.

### Catch unexpected spend spikes (issue #60)

The budget above watches *total* spend against fixed thresholds. **Cost Anomaly
Detection** (`cost_anomaly.tf`) catches the more useful signal — a single
service spiking above its learned baseline — and alerts the same
`empress-budget-alerts` SNS topic. It is a free service.

| Piece | Resource | What it does |
|---|---|---|
| Monitor | `aws_ce_anomaly_monitor.services` | Learns a per-`SERVICE` spend baseline |
| Subscription | `aws_ce_anomaly_subscription.spend` | Alerts when an anomaly's total impact ≥ `cost_anomaly_alert_threshold_usd` (default `$15`) |

> ℹ️ Anomaly detection needs ~10 days of history to build baselines, so it stays
> quiet on a fresh account — expected, not a misconfiguration. Tune sensitivity
> with `cost_anomaly_alert_threshold_usd` in `variables.tf`. Console view:
> Cost Management → **Cost Anomaly Detection**.
>
> ⚠️ AWS Cost Anomaly Detection does **not** monitor third-party AWS Marketplace
> products and services, including Anthropic Claude models used through Amazon
> Bedrock. The filtered `empress-anthropic-marketplace-cost` budget covers that
> gap by tracking charges where *Billing entity = AWS Marketplace* and *Legal
> entity = Anthropic, PBC*. Keep both guardrails: anomaly detection is still
> useful for native AWS services, while the Anthropic budget catches the main AI
> marketplace cost risk. AWS documents this limitation in
> [Detecting unusual spend with AWS Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html).

### Inspect AI / runtime cost

Cost Explorer (Cost Management → **Cost Explorer**, *Granularity = Daily*,
*Group by = Service*) is the fastest way to see where money goes. The drivers to
watch for this stack:

| Driver | Shows up as | Notes |
|---|---|---|
| Bedrock (chat + embeddings) | *Amazon Bedrock* | Usage-based; scales with conversation volume + ingest re-embeds. The main AI cost. |
| Fargate (API + worker) | *Amazon Elastic Container Service* | Runs continuously; driven by desired counts + task size |
| RDS | *Amazon Relational Database Service* | Billed whenever the instance is running — **keep it stopped when unused** |
| ALB / CloudFront | *EC2-Other* / *Amazon CloudFront* | Mostly fixed |
| CloudWatch Logs | *AmazonCloudWatch* | Grows with log retention/volume |
| SQS | *Amazon Simple Queue Service* | Negligible at demo scale |
| Voice | *Amazon Polly*, *Amazon Transcribe*, *S3* | Per-request; Polly cache limits repeat synthesis |

Per-conversation cost assumptions (visitor session volume, tokens per turn) come
from the operating-cost brief in `docs/visitor-ai-operating-cost-brief.pdf`
(issue #55) — use those numbers rather than inventing new ones here.

### Before a demo or stakeholder pilot — cost checklist

- [ ] Budget status is green: Billing → **Budgets** → `empress-monthly-cost`.
- [ ] No open anomaly in **Cost Anomaly Detection**, and everyone confirmed the
  `empress-budget-alerts` SNS subscription.
- [ ] **RDS is started only if the demo needs RAG/ingest** — and stopped again
  afterward (`aws rds stop-db-instance --db-instance-identifier empress-knowledge-base`).
- [ ] Fargate desired counts / autoscaling floor are at steady-state, not left
  scaled up from load testing.
- [ ] CloudWatch log retention hasn't been bumped to something expensive.

---

## Bedrock model access

Terraform creates standalone least-privilege policies for the backend task role:

| Workload | Model/profile | Policy output |
|---|---|---|
| RAG embeddings | `amazon.titan-embed-text-v2:0` | `bedrock_titan_embed_policy_arn` |
| Persona chat | `us.anthropic.claude-sonnet-4-6` | `bedrock_claude_chat_policy_arn` |

Claude Sonnet 4.6 has no in-Region endpoint in `us-west-2`, so chat uses the US
cross-Region inference profile. Bedrock may process a request in `us-east-1`,
`us-east-2`, or `us-west-2`; the IAM policy grants only those destination model
ARNs and requires calls to go through that inference profile.

Before the first Anthropic invocation, complete the Anthropic first-time-use
form and ensure the sandbox has the required AWS Marketplace subscription
permissions. These are account-level steps and are not granted to the Fargate
runtime role. Attach both policy outputs to that role in #42.

---

## Backend deployment runbook (issue #57)

Use this section to answer three operator questions: **Is the backend up? Where
are its logs? How do we roll it back?** Commands assume the `empress` AWS CLI
profile and `us-west-2` region configured above.

### Find the backend URL

Terraform exposes the CloudFront HTTPS/WSS endpoint without revealing
credentials:

```bash
cd infra/terraform
AWS_PROFILE=empress terraform output -raw backend_public_api_base_url
```

Verify the browser-facing endpoint directly:

```bash
curl --fail --show-error "$(AWS_PROFILE=empress terraform output -raw backend_public_api_base_url)/health"
```

A healthy response is `{"status":"ok"}`. CloudFront supplies its default
`cloudfront.net` certificate because the team has no separate custom-domain
budget. The ALB remains an HTTP origin but accepts inbound traffic only from the
AWS-managed CloudFront origin prefix list. The ECS task definition allows only
the two approved Vercel origins through `CORS_ORIGINS`.

### Deploy and check ECS health

Application releases use the GitHub Actions
[`deploy-backend`](../.github/workflows/deploy-backend.yml) workflow. Run it on
`main`; it builds and scans an immutable image, renders the latest
Terraform-owned task definition, deploys it, restores the autoscaling floor,
waits for ECS stability, and calls `/health`.

Check the live service from the CLI:

```bash
AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 \
  --cluster empress-app \
  --services empress-backend \
  --query 'services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,taskDefinition:taskDefinition,deployments:deployments[*].{status:status,rollout:rolloutState,taskDefinition:taskDefinition,running:runningCount,failed:failedTasks}}'
```

Healthy steady state means `status = ACTIVE`, `running = desired`, `pending =
0`, and the primary deployment is `COMPLETED`. If not, inspect recent service
events before retrying or changing desired count:

```bash
AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 \
  --cluster empress-app \
  --services empress-backend \
  --query 'services[0].events[0:10].[createdAt,message]' \
  --output table
```

### Read CloudWatch logs and traces

Backend and OTel Collector stdout/stderr share `/ecs/empress-backend`, with
`api/` and `otel/` stream prefixes. Terraform keeps these logs for **14 days**
through `backend_log_retention_days`.

```bash
# Follow all new backend/collector events.
AWS_PROFILE=empress aws logs tail /ecs/empress-backend \
  --region us-west-2 --since 30m --follow

# Find the newest streams when one task is failing.
AWS_PROFILE=empress aws logs describe-log-streams \
  --region us-west-2 \
  --log-group-name /ecs/empress-backend \
  --order-by LastEventTime --descending --max-items 20
```

Collector startup is healthy when its new stream says `Everything is ready`
and shows no exporter authentication errors. For request-level diagnosis, open
Honeycomb environment `test`, dataset `empress-backend`, and filter on
`service.name = empress-backend`. CloudWatch remains the source for ECS runtime
logs and AWS metrics; Honeycomb connects spans for one request.

CloudWatch alarms notify the existing `empress-budget-alerts` SNS subscribers
for sustained backend latency, target 5xx responses, unhealthy targets, jobs
queue backlog, and any visible DLQ message. Each teammate must have confirmed
the SNS email subscription to receive both alarm and recovery notifications.

### Validate the async ingest worker

The deploy workflow updates both `empress-backend` and `empress-worker` from the
same immutable image. The worker has no public listener; healthy steady state is
one running task and no pending task:

```bash
AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 \
  --cluster empress-app \
  --services empress-worker \
  --query 'services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,taskDefinition:taskDefinition,events:events[0:5].[createdAt,message]}'
```

Follow worker and collector startup before enqueueing a job:

```bash
AWS_PROFILE=empress aws logs tail /ecs/empress-worker \
  --region us-west-2 --since 30m --follow
```

The ingest endpoint is an operator-only API. Retrieve its generated token into
the current shell without printing it, enqueue only the repository-controlled
external source, and then unset it:

```bash
ADMIN_TOKEN=$(AWS_PROFILE=empress aws secretsmanager get-secret-value \
  --region us-west-2 \
  --secret-id /empress/backend/ingest_admin_token \
  --query SecretString --output text | jq -r '.token')
PUBLIC_API_BASE_URL=$(AWS_PROFILE=empress aws ssm get-parameter \
  --region us-west-2 \
  --name /empress/backend/public_api_base_url \
  --query 'Parameter.Value' --output text)

curl --fail --show-error \
  -X POST "$PUBLIC_API_BASE_URL/ingest/jobs" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"include_external":true}'

unset ADMIN_TOKEN
```

The API should return HTTP `202` with a `job_id`. A successful end-to-end run
then has all of these signals:

1. `/ecs/empress-worker` logs `processing job_id=...` followed by
   `completed job_id=...`.
2. The jobs queue returns to zero visible and zero in-flight messages:

   ```bash
   JOBS_QUEUE_URL=$(AWS_PROFILE=empress aws ssm get-parameter \
     --region us-west-2 \
     --name /empress/sqs/jobs_queue_url \
     --query 'Parameter.Value' --output text)
   AWS_PROFILE=empress aws sqs get-queue-attributes \
     --region us-west-2 \
     --queue-url "$JOBS_QUEUE_URL" \
     --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
   ```

3. The DLQ remains at zero visible messages.
4. Honeycomb environment `test` shows `service.name = empress-worker` with
   `jobs.worker.receive`, `jobs.worker.process`, and `jobs.worker.delete` spans.
   The process span should have `job.status = completed`, and its trace should
   continue the context injected by the API producer.

Do not put the ingest admin token in either Vercel project or a committed file.
It is for an operator smoke test, not a browser feature.

### Upload and run the full knowledge ingest

Terraform creates a private, encrypted, versioned ingest-source bucket. It does
not manage the source objects, so the private CSV/workbook contents never enter
Terraform state or the application image. The worker role can read only the two
exact keys configured by `ingest_vmm_csv_key` and
`ingest_classified_workbook_key`.

Upload the reviewed source files from a trusted operator machine:

```bash
INGEST_BUCKET=$(AWS_PROFILE=empress terraform -chdir=infra/terraform \
  output -raw ingest_sources_bucket_name)

AWS_PROFILE=empress aws s3 cp \
  'data/export_empress of japan.csv' \
  "s3://$INGEST_BUCKET/vmm/export_empress-of-japan.csv" \
  --region us-west-2 \
  --sse aws:kms --sse-kms-key-id alias/empress-ingest-sources

AWS_PROFILE=empress aws s3 cp \
  data/Empress_of_Japan_records_classified.xlsx \
  "s3://$INGEST_BUCKET/vmm/Empress_of_Japan_records_classified.xlsx" \
  --region us-west-2 \
  --sse aws:kms --sse-kms-key-id alias/empress-ingest-sources
```

If either Terraform key variable is overridden, use that exact output key
instead. Confirm the current object versions and sizes before enqueueing; never
make this bucket public or place credentials in object metadata.

The same admin endpoint then creates one server-controlled full-ingest job. It
does not accept paths, buckets, keys, or embedder overrides from the request:

```bash
curl --fail --show-error \
  -X POST "$PUBLIC_API_BASE_URL/ingest/jobs" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"include_csv":true,"include_external":true}'
```

For the current reviewed inputs, successful logs should report 296 documents
(285 VMM and 11 external), 336 chunks, zero errors, and the configured Titan V2
model. Repeat the identical job to verify idempotency, then confirm both the
source queue and DLQ are empty. Investigate source-count drift before treating a
different total as success.

### Validate target-tracking autoscaling

The service targets 60% average CPU, scales between 2 and 6 tasks, waits two
minutes before another scale-out, and waits five minutes before scale-in. Use a
non-sensitive endpoint and stop the test if error rate or cost looks abnormal:

```bash
PUBLIC_API_BASE_URL=$(AWS_PROFILE=empress terraform output -raw backend_public_api_base_url)

# In terminal 1, watch desired/running task count and deployment events.
watch -n 15 "AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 --cluster empress-app --services empress-backend \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'"

# In terminal 2, if `hey` is installed, apply bounded load for at most 8 minutes.
hey -z 8m -c 100 "$PUBLIC_API_BASE_URL/health"
```

Capture the ECS desired-count change, the target-tracking alarm/activity, and
the later return to the two-task floor. Do not run a load test immediately
before a class or stakeholder demo.

### Confirm runtime IAM access

The application task role owns Bedrock, SQS, Polly, Transcribe, S3 voice-cache,
and KMS permissions. The execution role owns ECR/log delivery plus Secrets
Manager reads used to inject the RDS and Honeycomb values before startup.

```bash
AWS_PROFILE=empress aws iam list-attached-role-policies \
  --role-name empress-backend-task \
  --query 'AttachedPolicies[].PolicyName' --output table

AWS_PROFILE=empress aws iam list-attached-role-policies \
  --role-name empress-backend-execution \
  --query 'AttachedPolicies[].PolicyName' --output table

AWS_PROFILE=empress aws iam list-role-policies \
  --role-name empress-backend-execution --output table
```

Expected task-role policies include the Claude and Titan Bedrock policies,
`empress-sqs-jobs-send`, and `empress-backend-voice-runtime`. Expected execution
access includes the managed ECS execution policy, the RDS secret-read policy,
and the inline Honeycomb secret-read policy. Never test access by copying a
secret or AWS credential to a laptop or GitHub Actions variable.

### Run and verify RDS migrations

Run the GitHub Actions
[`migrate-backend`](../.github/workflows/migrate-backend.yml) workflow manually
on `main` and confirm its migration input. It copies the task definition used by
the service, changes its command to `alembic upgrade head`, and starts a one-off
Fargate task inside the same VPC and security group.

The workflow must finish successfully before code that requires a new schema is
deployed. If it fails, inspect the workflow summary and the newest `migration/`
stream under `/ecs/empress-backend`; database credentials remain injected from
Secrets Manager and never pass through GitHub or a developer laptop.

### Roll back a bad backend image

First identify the current and recent active task definitions:

```bash
AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 --cluster empress-app --services empress-backend \
  --query 'services[0].taskDefinition' --output text

AWS_PROFILE=empress aws ecs list-task-definitions \
  --region us-west-2 --family-prefix empress-backend \
  --status ACTIVE --sort DESC --max-items 10
```

Inspect the candidate revision and its backend image before selecting it. Then
point the service at that known-good revision and wait for stability:

```bash
AWS_PROFILE=empress aws ecs update-service \
  --region us-west-2 \
  --cluster empress-app \
  --service empress-backend \
  --task-definition empress-backend:<known-good-revision> \
  --force-new-deployment

AWS_PROFILE=empress aws ecs wait services-stable \
  --region us-west-2 --cluster empress-app --services empress-backend
```

Re-run `/health`, check the newest `api/` and `otel/` streams, and record the
rolled-back revision in the incident/PR. Do not deregister revisions during the
incident. A later `deploy-backend` run will deploy from the latest active family
revision, so fix or deregister the bad revision only after the service is safe.

### Inspect SQS and the DLQ

Queue URLs are Terraform outputs and contain no credentials:

```bash
cd infra/terraform
JOBS_QUEUE_URL=$(AWS_PROFILE=empress terraform output -raw sqs_jobs_queue_url)
JOBS_DLQ_URL=$(AWS_PROFILE=empress aws ssm get-parameter \
  --region us-west-2 --name /empress/sqs/jobs_dlq_url \
  --query 'Parameter.Value' --output text)

AWS_PROFILE=empress aws sqs get-queue-attributes \
  --region us-west-2 --queue-url "$JOBS_QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages \
    ApproximateNumberOfMessagesNotVisible

AWS_PROFILE=empress aws sqs get-queue-attributes \
  --region us-west-2 --queue-url "$JOBS_DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

Messages in the DLQ are evidence, not rubbish. Inspect the worker failure and
check payload privacy **before** starting a redrive. Never paste raw message
bodies or donor/private source data into logs, issue comments, or screenshots
(see the privacy rules in CLAUDE.md).

### When the DLQ alarm fires

The `empress-jobs-dlq-visible` CloudWatch alarm fires the moment
`ApproximateNumberOfMessagesVisible` on `empress-jobs-dlq` reaches 1 and
notifies the `empress-budget-alerts` SNS topic (the shared alert channel — make
sure you accepted its subscription). Work the queue down to zero visible
messages; the alarm returns to OK on its own once the DLQ is empty.

### Read a DLQ message without consuming it

Peek at the oldest messages with a zero visibility timeout so they stay
available for a later redrive:

```bash
AWS_PROFILE=empress aws sqs receive-message \
  --region us-west-2 --queue-url "$JOBS_DLQ_URL" \
  --max-number-of-messages 10 --visibility-timeout 0 \
  --message-attribute-names All --attribute-names All
```

Cross-reference the `job_id` in the body with the worker logs to find the
failure (search by id, not by dumping payloads):

```bash
AWS_PROFILE=empress aws logs filter-log-events \
  --region us-west-2 --log-group-name /ecs/empress-worker \
  --filter-pattern '"<job_id>"' --query 'events[*].message' --output text
```

### Decide: redrive, discard, or file a bug

- **Redrive** when the failure was transient or environmental and is now fixed —
  e.g. RDS was stopped/unreachable, a dependency timed out, or a deploy was
  mid-rollout. The payload is valid; it just needs to run again.
- **Discard** (delete from the DLQ) when the message is not safe or not useful
  to reprocess — malformed payload, a job superseded by a later run, or anything
  whose reprocessing would violate the privacy rules. Record why in the
  incident/PR before deleting.
- **File a backend bug** when the failure is a code/logic defect that will just
  fail again on redrive. Capture the `job_id`, the log excerpt, and the failure
  class (never the raw payload) in a `track:backend` issue before redriving.

### Redrive messages back to the main queue

Use the SQS message-move task to move messages from the DLQ back onto
`empress-jobs`. The `empress-jobs-dlq` redrive-allow policy is scoped `byQueue`
to the main queue, so that is the only permitted destination:

```bash
JOBS_DLQ_ARN=$(AWS_PROFILE=empress aws sqs get-queue-attributes \
  --region us-west-2 --queue-url "$JOBS_DLQ_URL" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# Start the move (DLQ -> its configured source queue, empress-jobs)
AWS_PROFILE=empress aws sqs start-message-move-task \
  --region us-west-2 --source-arn "$JOBS_DLQ_ARN"

# Watch progress (or capture the TaskHandle to cancel with cancel-message-move-task)
AWS_PROFILE=empress aws sqs list-message-move-tasks \
  --region us-west-2 --source-arn "$JOBS_DLQ_ARN" --max-results 1
```

Only one move task runs per source queue at a time. To redrive a single message
instead of the whole DLQ, delete the others first, or receive the target message
and re-send it to `$JOBS_QUEUE_URL`, then start the move.

### Avoid duplicate processing on redrive

Redriving re-runs the job, so confirm a partially-successful original run won't
double-write. The ingest pipeline is **idempotent** by `content_hash` (unchanged
rows are skipped; only a model swap re-embeds — see `data/ingest-pipeline.md`),
so redriving an ingest job is safe. For any future non-idempotent job type,
confirm the handler dedupes (or the payload carries an idempotency key) **before**
redriving; otherwise discard it and enqueue a fresh job instead.

### Check budget alerts and cost spikes

In AWS, open Billing and Cost Management → Budgets →
`empress-monthly-cost`; then use Cost Explorer with daily granularity grouped by
Service. Confirm that each teammate accepted the
`empress-budget-alerts` SNS subscription. The full thresholds and known sandbox
limitations are documented in [Cost tracking](#cost-tracking--1000month-budget-issue-20).

---

## Deployment environment decision (issue #63)

**Decision, July 2026: keep one AWS `sandbox` backend through the capstone
showcase.** Do not duplicate ECS, ALB/CloudFront, RDS, Secrets Manager, queues,
or observability into `dev` and `demo` yet. The team has one $1,000 AWS sandbox
allocation and no separate domain/hosting budget; a second always-on stack adds
cost and operational surface before usage demonstrates a need.

The two Vercel URLs are clients of this one backend, not separate AWS
environments:

- `empress-of-japan-capstone.vercel.app` is the production/demo frontend.
- `empress-gyro-test.vercel.app` is a temporary mobile/gyro integration client;
  merge the responsive behavior into the primary project rather than creating a
  second backend.

Stability comes from workflow, not duplicated infrastructure:

- feature branches use local tests and Vercel previews;
- only merged `main` backend changes run `deploy-backend`;
- stop risky merges before scheduled stakeholder demos;
- use immutable ECR tags and the rollback procedure above;
- use CloudWatch alarms and Honeycomb traces to verify each deployment.

Revisit a `dev`/`demo` split only when at least one trigger is true:

1. routine development repeatedly disrupts scheduled museum/class demos;
2. integration tests require destructive or incompatible database data;
3. simultaneous releases need independent rollback windows;
4. the stakeholder provides a stable domain/hosting requirement and the budget
   can support duplicated compute, data, and observability.

If a split becomes necessary, parameterize an `app_env` module and isolate ECS
services, SSM/Secrets paths, logs, and queues by environment. Prefer separate
Postgres schemas/databases on the existing RDS instance first; provision a
second RDS instance only when data isolation or measured load justifies its
cost. Keep shared Terraform modules rather than copying resource blocks.

---

## Knowledge-base RDS (issue #25)

Terraform provisions the shared/deployed Postgres database for the RAG knowledge
base. Local development still uses `backend/docker-compose.yml`; this RDS
instance exists for deployed backend environments and shared testing.

| Piece | Resource | What it does |
|---|---|---|
| VPC | `aws_vpc.app` | Isolated sandbox network for backend/RDS resources |
| Private subnets | `aws_subnet.private[*]` | Two-AZ subnet group for RDS |
| Backend SG | `aws_security_group.backend` | Future ECS/Fargate backend tasks attach here |
| DB SG | `aws_security_group.knowledge_base_db` | Allows PostgreSQL only from the backend SG |
| RDS | `aws_db_instance.knowledge_base` | Postgres 16, `db.t4g.micro`, private, encrypted |
| Secrets | RDS-managed master secret + `/empress/rds/knowledge_base_connection` | DB password stays in Secrets Manager; metadata secret points at it |
| IAM | `aws_iam_policy.knowledge_base_secret_read` | Future backend task role attaches this to read DB secrets via IAM |
| Cost control | `aws_scheduler_schedule.knowledge_base_stop` | Stops the sandbox DB at 10pm America/Vancouver on weekdays |

The DB is intentionally **not public**. To connect manually, use a bastion,
SSM port forwarding, or an ECS task inside the VPC once backend deployment lands.
Do not open the DB security group to your home IP for convenience.

### Apply the schema

Alina/backend owns applying the schema after the DB is provisioned. The same DDL
used by Docker applies unchanged to RDS:

```bash
psql "<rds-endpoint-or-secret-derived-url>" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql "<rds-endpoint-or-secret-derived-url>" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
```

`backend/db/schema.sql` already includes `CREATE EXTENSION IF NOT EXISTS vector;`
so the first command is mainly a quick permissions/allowlist smoke test.

### pgvector version check

After connecting to the RDS database, verify the extension allowlist and
installed version before applying production data:

```sql
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name = 'vector';
```

HNSW indexes require pgvector `>= 0.5.0`. Keep `kb_db_engine_version` on
Postgres 16+ unless AWS RDS release notes confirm an older minor has the needed
extension version.

### Cost note

The first sandbox shape is single-AZ `db.t4g.micro` with 20 GiB gp3 storage.
Budget tracking should record it as roughly a low double-digit monthly RDS cost
when left running continuously, plus storage/backup charges. The weekday 10pm
stop schedule keeps idle spend lower, but RDS automatically restarts a stopped
instance after 7 days, so the schedule is kept in Terraform instead of relying
on one-off manual stops.

---

## Notes

- **Never commit** Terraform state (`*.tfstate*`, `.terraform/`), `*.tfvars`
  (except `*.tfvars.example`), or any AWS credentials. State lives in S3 +
  DynamoDB — that's the only source of truth.
- Terraform will read the backend from the `TF_*` values above (wired up in the
  plan/apply workflows — a separate task). You never create the bucket, table,
  role, or OIDC provider yourself.
- If your tooling shells out without loading `~/.zshrc` (some IDEs, CI-like
  runners), pass the profile explicitly: `AWS_PROFILE=empress <command>`.
- Re-running `bootstrap.sh` is safe (it's idempotent) but unnecessary for
  day-to-day work — only the DevOps owner runs it, and only to change the
  backend itself.
