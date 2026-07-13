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

output "anthropic_marketplace_budget_name" {
  description = "Name of the filtered Anthropic Marketplace cost budget (find it under Billing > Budgets)."
  value       = aws_budgets_budget.anthropic_marketplace.name
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

output "ingest_admin_secret_arn" {
  description = "Secrets Manager ARN containing the admin token for enqueueing ingest jobs."
  value       = aws_secretsmanager_secret.ingest_admin.arn
}

output "bedrock_titan_embed_policy_arn" {
  description = "ARN of the bedrock:InvokeModel policy for Titan Embed V2. Attach to the Fargate task role in #42."
  value       = aws_iam_policy.bedrock_titan_embed_invoke.arn
}

output "bedrock_claude_chat_policy_arn" {
  description = "ARN of the Claude chat inference policy. Attach to the Fargate task role in #42."
  value       = aws_iam_policy.bedrock_claude_chat_invoke.arn
}

output "backend_ecr_repository_url" {
  description = "ECR repository URL for the backend API image."
  value       = aws_ecr_repository.backend.repository_url
}

output "public_subnet_ids" {
  description = "Public subnet IDs for the ALB and NAT-free sandbox Fargate tasks."
  value       = aws_subnet.public[*].id
}

output "backend_alb_dns_name" {
  description = "Public DNS name of the backend application load balancer."
  value       = aws_lb.backend.dns_name
}

output "backend_public_api_base_url" {
  description = "CloudFront HTTPS base URL for browser and WebSocket clients."
  value       = "https://${aws_cloudfront_distribution.backend_api.domain_name}"
}

output "backend_target_group_arn" {
  description = "Target group ARN used by the backend ECS service."
  value       = aws_lb_target_group.backend.arn
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster hosting the backend service."
  value       = aws_ecs_cluster.app.arn
}

output "worker_ecs_service_name" {
  description = "ECS service running the async ingest worker."
  value       = aws_ecs_service.worker.name
}

output "backend_execution_role_arn" {
  description = "ECS task execution role ARN for ECR, CloudWatch Logs, and secret injection."
  value       = aws_iam_role.backend_execution.arn
}

output "backend_task_role_arn" {
  description = "Application task role ARN for Bedrock and SQS access."
  value       = aws_iam_role.backend_task.arn
}

output "worker_task_role_arn" {
  description = "Worker task role ARN for Titan embeddings and SQS consumption."
  value       = aws_iam_role.worker_task.arn
}

output "ingest_sources_bucket_name" {
  description = "Private bucket for operator-managed VMM ingest inputs."
  value       = aws_s3_bucket.ingest_sources.bucket
}

output "worker_ingest_sources_read_policy_arn" {
  description = "Least-privilege policy allowing the worker to read approved ingest objects."
  value       = aws_iam_policy.worker_ingest_sources_read.arn
}

output "backend_log_group_name" {
  description = "CloudWatch log group for backend container logs."
  value       = aws_cloudwatch_log_group.backend.name
}

output "backend_task_definition_arn" {
  description = "ARN of the bootstrap backend ECS task definition."
  value       = aws_ecs_task_definition.backend.arn
}

output "backend_ecs_service_name" {
  description = "Name of the backend ECS service managed by the deployment workflow."
  value       = aws_ecs_service.backend.name
}

output "voice_cache_bucket_name" {
  description = "Private S3 bucket used to cache generated Polly narration audio."
  value       = aws_s3_bucket.voice_cache.bucket
}

output "backend_voice_runtime_policy_arn" {
  description = "IAM policy granting the backend scoped Polly, Transcribe, and voice-cache access."
  value       = aws_iam_policy.backend_voice_runtime.arn
}
