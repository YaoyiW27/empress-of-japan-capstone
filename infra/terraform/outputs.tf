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

output "bedrock_titan_embed_policy_arn" {
  description = "ARN of the bedrock:InvokeModel policy for Titan Embed V2. Attach to the Fargate task role in #42."
  value       = aws_iam_policy.bedrock_titan_embed_invoke.arn
}
