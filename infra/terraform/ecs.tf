# ECS runtime foundation for the backend API (issue #42).
#
# This file defines the cluster and IAM/logging primitives. The task definition
# and service are added separately once the image and secret contract are wired.

resource "aws_ecs_cluster" "app" {
  name = "empress-app"

  tags = {
    Name = "empress-app"
  }
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by the ECS agent before the application starts: pull the ECR image,
# create the awslogs stream, and resolve database secrets for injection.
resource "aws_iam_role" "backend_execution" {
  name               = "empress-backend-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "backend_execution_managed" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "backend_execution_rds_secrets" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = aws_iam_policy.knowledge_base_secret_read.arn
}

# Credentials exposed to the FastAPI process itself. Keep application actions
# here and execution-time infrastructure actions on backend_execution above.
resource "aws_iam_role" "backend_task" {
  name               = "empress-backend-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "backend_task_titan" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.bedrock_titan_embed_invoke.arn
}

resource "aws_iam_role_policy_attachment" "backend_task_claude" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.bedrock_claude_chat_invoke.arn
}

resource "aws_iam_role_policy_attachment" "backend_task_sqs_send" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.sqs_jobs_send.arn
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/empress-backend"
  retention_in_days = var.backend_log_retention_days

  tags = {
    Name = "empress-backend"
  }
}
