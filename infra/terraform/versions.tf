terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.51"
    }
  }

  # Partial backend config: only the state key and encryption flag live in the
  # repo. bucket / region / dynamodb_table are injected at init time via
  # `terraform init -backend-config=backend.hcl`, where backend.hcl is generated
  # in CI from the repo secrets (TF_STATE_BUCKET, TF_LOCK_TABLE). This keeps all
  # environment-specific / account-specific values out of version control.
  backend "s3" {
    key     = "empress/terraform.tfstate"
    encrypt = true
  }
}
