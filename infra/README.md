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
| Alerts | SNS topic `empress-budget-alerts` | Fans notifications out to the team by email |
| Tagging | provider `default_tags` | Applies `Project = EmpressOfJapan` to Terraform-managed resources |

### Alert thresholds

- **ACTUAL** spend already incurred: **20% ($200), 50% ($500), 80% ($800)**.
- **FORECASTED** month-end spend: **50%, 80%** (early warning before the money's
  spent).

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

- **Budget status:** Billing and Cost Management → **Budgets** → `empress-monthly-cost`
  (shows current vs. forecasted spend and which thresholds have fired). Output
  `monthly_budget_name` echoes the name.
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
| `budget_thresholds` | `[20, 50, 80]` | ACTUAL-spend alert % |
| `forecasted_thresholds` | `[50, 80]` | FORECASTED-spend alert % |
| `alert_emails` | the 4 above | Who gets alerts (re-confirmation needed for new addresses) |

Thresholds are percentages of `monthly_budget_limit`, so raising the limit
rescales the dollar trigger points automatically.

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
