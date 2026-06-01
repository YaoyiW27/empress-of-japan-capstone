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
