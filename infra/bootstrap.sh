#!/usr/bin/env bash
#
# bootstrap.sh — Create the Terraform remote-state backend + GitHub OIDC auth
#                for the Empress of Japan capstone.
#
# This script provisions the primitives Terraform itself cannot bootstrap
# (because they ARE the state backend). It is deliberately Terraform-free and
# uses the AWS CLI exclusively. It is idempotent: re-running reconciles state
# rather than failing.
#
# Resources created (all prefixed `empress-`):
#   - S3 bucket   empress-tfstate-9823   (versioned, AES256, public access blocked)
#   - DynamoDB    empress-tflock         (LockID hash key — Terraform state lock)
#   - OIDC IdP    token.actions.githubusercontent.com  (GitHub Actions federation)
#   - IAM role    empress-gha-deploy     (assumed by CI via OIDC)
#
# At the end it sets three GitHub repo secrets so CI can find the backend:
#   AWS_DEPLOY_ROLE_ARN, TF_STATE_BUCKET, TF_LOCK_TABLE
#
# TODO(security): the deploy role is granted AdministratorAccess because this
# runs against an isolated AWS Innovation Sandbox (contained blast radius).
# SCOPE THIS DOWN to a least-privilege policy before using on any non-sandbox
# / shared / production account.
#
# Usage:
#   ./bootstrap.sh [ACCOUNT_ID] [REPO]
#   ACCOUNT_ID=260256919823 REPO=YaoyiW27/empress-of-japan-capstone ./bootstrap.sh
#   FORCE=1 ./bootstrap.sh            # skip the confirmation prompt (for CI)
#   ./bootstrap.sh --yes              # same as FORCE=1
#
set -euo pipefail

# --- 1. Config -------------------------------------------------------------
# Account ID and repo come from args or env, never hardcoded into logic.
# Region is locked to us-west-2 for this project.

# Allow `--yes` as an alias for FORCE=1, then strip it from the positionals.
FORCE="${FORCE:-0}"
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --yes|-y) FORCE=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done
set -- "${ARGS[@]:-}"

ACCOUNT_ID="${1:-${ACCOUNT_ID:-260256919823}}"
REPO="${2:-${REPO:-YaoyiW27/empress-of-japan-capstone}}"
REGION="us-west-2"

# Derived resource names — reproducible (9823 = last 4 of the account ID).
BUCKET="empress-tfstate-9823"
LOCK_TABLE="empress-tflock"
ROLE="empress-gha-deploy"
OIDC_HOST="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRUST_TMPL="${SCRIPT_DIR}/bootstrap/iam-trust-policy.json.tmpl"

# --- helpers ---------------------------------------------------------------
say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[1;32m✓\033[0m %s\n' "$*"; }
skip() { printf '    \033[1;33m•\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- 2. Preflight ----------------------------------------------------------
say "Preflight checks"
for tool in aws gh jq; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed."
done
ok "aws, gh, jq present"

CALLER_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
  || die "Could not call AWS STS. Is AWS_PROFILE set (expected: empress) and SSO logged in? Try: aws sso login --profile empress"
[ "$CALLER_ACCOUNT" = "$ACCOUNT_ID" ] \
  || die "AWS credentials point at account $CALLER_ACCOUNT but expected $ACCOUNT_ID. Check AWS_PROFILE."
ok "AWS identity confirmed on account $ACCOUNT_ID"

gh auth status >/dev/null 2>&1 || die "GitHub CLI not authenticated. Run: gh auth login"
ok "GitHub CLI authenticated"

[ -f "$TRUST_TMPL" ] || die "Trust policy template not found at $TRUST_TMPL"
ok "Trust policy template found"

# --- 3. Confirm ------------------------------------------------------------
cat <<EOF

This will create / reconcile the following in AWS account ${ACCOUNT_ID} (${REGION}):
    S3 bucket      : ${BUCKET}
    DynamoDB table : ${LOCK_TABLE}
    OIDC provider  : ${OIDC_HOST}
    IAM role       : ${ROLE}  (AdministratorAccess — sandbox only)
    GitHub repo    : ${REPO}  (3 secrets will be set)
EOF

if [ "$FORCE" != "1" ]; then
  read -r -p $'\nProceed? [y/N] ' reply
  case "$reply" in
    [yY]|[yY][eE][sS]) ;;
    *) die "Aborted by user." ;;
  esac
fi

# --- 4. S3 state bucket ----------------------------------------------------
say "S3 state bucket: ${BUCKET}"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  skip "bucket already exists"
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  ok "bucket created"
fi

# These settings are declarative — safe to re-apply on every run.
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled >/dev/null
ok "versioning enabled"

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null
ok "default AES256 encryption set"

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null
ok "public access blocked"

# --- 5. DynamoDB lock table ------------------------------------------------
say "DynamoDB lock table: ${LOCK_TABLE}"
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" >/dev/null 2>&1; then
  skip "table already exists"
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --region "$REGION" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST >/dev/null
  ok "table created — waiting for ACTIVE..."
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
  ok "table is ACTIVE"
fi

# --- 6. GitHub OIDC provider ----------------------------------------------
say "GitHub OIDC provider: ${OIDC_HOST}"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  skip "OIDC provider already exists"
else
  # aud (client ID) = sts.amazonaws.com. Modern AWS verifies GitHub's cert via
  # its trust store, but a thumbprint is still required by the API; GitHub's
  # well-known root thumbprint is used here.
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
  ok "OIDC provider created"
fi

# --- 7. IAM deploy role ----------------------------------------------------
say "IAM deploy role: ${ROLE}"
# Render the trust policy from the template (substitute account + repo).
TRUST_JSON="$(sed -e "s|__ACCOUNT_ID__|${ACCOUNT_ID}|g" -e "s|__REPO__|${REPO}|g" "$TRUST_TMPL")"

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  skip "role already exists — reconciling trust policy"
  aws iam update-assume-role-policy \
    --role-name "$ROLE" \
    --policy-document "$TRUST_JSON" >/dev/null
  ok "trust policy updated"
else
  aws iam create-role \
    --role-name "$ROLE" \
    --assume-role-policy-document "$TRUST_JSON" \
    --description "GitHub Actions OIDC deploy role for ${REPO} (sandbox)" >/dev/null
  ok "role created"
fi

# AdministratorAccess is the ONLY policy attached. See TODO(security) above.
# attach-role-policy is idempotent — re-attaching the same ARN is a no-op.
aws iam attach-role-policy \
  --role-name "$ROLE" \
  --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" >/dev/null
ok "AdministratorAccess attached (sandbox only)"

# --- 8. GitHub repo secrets ------------------------------------------------
say "GitHub repo secrets on ${REPO}"
gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$ROLE_ARN" >/dev/null
ok "AWS_DEPLOY_ROLE_ARN set"
gh secret set TF_STATE_BUCKET --repo "$REPO" --body "$BUCKET" >/dev/null
ok "TF_STATE_BUCKET set"
gh secret set TF_LOCK_TABLE --repo "$REPO" --body "$LOCK_TABLE" >/dev/null
ok "TF_LOCK_TABLE set"

# --- 9. Summary ------------------------------------------------------------
cat <<EOF

======================================================================
 Bootstrap complete.
======================================================================

Resources (account ${ACCOUNT_ID}, ${REGION}):
    S3 state bucket : ${BUCKET}
    DynamoDB lock   : ${LOCK_TABLE}
    OIDC provider   : ${OIDC_ARN}
    Deploy role     : ${ROLE_ARN}

GitHub secrets set on ${REPO}:
    AWS_DEPLOY_ROLE_ARN, TF_STATE_BUCKET, TF_LOCK_TABLE

----------------------------------------------------------------------
 Next steps for teammates (you do NOT need to re-run this script)
----------------------------------------------------------------------
The backend above is shared. To get AWS CLI access to the same sandbox
account, configure an SSO profile named 'empress' locally:

    aws configure sso

When prompted, use these values:
    SSO start URL    : <ASK YAOYI — the sandbox SSO start URL>
    SSO region       : ${REGION}
    Account ID       : ${ACCOUNT_ID}
    CLI default region: ${REGION}
    CLI profile name : empress

Then add this to your ~/.zshrc so the CLI picks it up automatically:

    export AWS_PROFILE=empress

Log in (and re-run whenever the session expires):

    aws sso login --profile empress

Verify you are on the right account:

    aws sts get-caller-identity      # Account should be ${ACCOUNT_ID}

Terraform itself will read the backend from the TF_* values above (wired
up in the plan/apply workflows — separate task). You do not create the
bucket, table, role, or OIDC provider yourself; they already exist.
EOF
