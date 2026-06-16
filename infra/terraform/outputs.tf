output "canary_parameter_name" {
  description = "Name of the CI canary SSM parameter."
  value       = aws_ssm_parameter.ci_canary.name
}

output "canary_parameter_arn" {
  description = "ARN of the CI canary SSM parameter."
  value       = aws_ssm_parameter.ci_canary.arn
}

output "budget_alerts_topic_arn" {
  description = "ARN of the SNS topic that fans out budget alerts to the team."
  value       = aws_sns_topic.budget_alerts.arn
}

output "monthly_budget_name" {
  description = "Name of the monthly cost budget (find it under Billing > Budgets)."
  value       = aws_budgets_budget.monthly.name
}

output "vpc_id" {
  description = "ID of the sandbox application VPC."
  value       = aws_vpc.app.id
}

output "backend_security_group_id" {
  description = "Security group for backend tasks. Attach future ECS/Fargate services here for private RDS access."
  value       = aws_security_group.backend.id
}

output "knowledge_base_db_endpoint" {
  description = "Private RDS endpoint for the knowledge-base database."
  value       = aws_db_instance.knowledge_base.endpoint
}

output "knowledge_base_connection_secret_arn" {
  description = "Secrets Manager ARN containing RDS connection metadata. The password is in the RDS-managed master secret referenced inside it."
  value       = aws_secretsmanager_secret.knowledge_base_connection.arn
}

output "knowledge_base_master_secret_arn" {
  description = "RDS-managed Secrets Manager ARN containing the master username/password."
  value       = aws_db_instance.knowledge_base.master_user_secret[0].secret_arn
  sensitive   = true
}

output "knowledge_base_secret_read_policy_arn" {
  description = "ARN of the policy that lets backend tasks read the knowledge-base RDS secrets. Attach to the Fargate task role in #42."
  value       = aws_iam_policy.knowledge_base_secret_read.arn
}
