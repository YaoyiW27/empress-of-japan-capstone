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

# --- Async jobs messaging (issue #39, see sqs.tf) ---

output "sqs_jobs_queue_url" {
  description = "URL of the empress-jobs SQS queue."
  value       = aws_sqs_queue.jobs.url
}

output "sqs_jobs_queue_arn" {
  description = "ARN of the empress-jobs SQS queue."
  value       = aws_sqs_queue.jobs.arn
}

output "sqs_jobs_dlq_arn" {
  description = "ARN of the empress-jobs dead-letter queue."
  value       = aws_sqs_queue.jobs_dlq.arn
}

output "sqs_jobs_send_policy_arn" {
  description = "ARN of the SendMessage policy. Attach to the API task role in #42."
  value       = aws_iam_policy.sqs_jobs_send.arn
}

output "sqs_jobs_consume_policy_arn" {
  description = "ARN of the receive/delete policy. Attach to the worker task role in #42."
  value       = aws_iam_policy.sqs_jobs_consume.arn
}
