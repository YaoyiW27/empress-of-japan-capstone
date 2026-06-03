# CI canary — the first and (for now) only Terraform-managed resource.
# It gives the plan/apply pipeline something real but harmless to create so we
# can verify the end-to-end flow against the live S3 backend. Safe to delete
# once we have actual infrastructure to manage.
resource "aws_ssm_parameter" "ci_canary" {
  name        = "/empress/ci/canary"
  type        = "String"
  value       = var.canary_value
  description = "CI canary — created by GitHub Actions to verify plan/apply pipeline. Safe to delete after first successful apply."
}
