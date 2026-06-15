# Async-jobs messaging for the backend worker (issue #39).
#
# The backend offloads ingest / heavy jobs to a worker (backend #35): the API
# SendMessage's to the jobs queue, the worker ReceiveMessage/DeleteMessage's
# from it. Messages that fail repeatedly fall through to a dead-letter queue so
# a poison message can't be retried forever and stays inspectable.
#
# IAM here is split into two least-privilege producer/consumer policies. Like
# the Bedrock policy (bedrock.tf), they are standalone + exported by ARN and
# intentionally NOT attached — the API and worker task roles don't exist yet
# (#42, Fargate); that PR attaches send→API role, consume→worker role.
#
# Local dev: the backend develops against a local SQS-compatible endpoint
# (LocalStack / elasticmq) rather than this live queue — the app reads the queue
# URL from config/SSM, so pointing it at a local endpoint needs no infra change.

# ------------------------------------------------------------------
# Queues — dead-letter first so the main queue can reference its ARN.
# ------------------------------------------------------------------
resource "aws_sqs_queue" "jobs_dlq" {
  name = "empress-jobs-dlq"
  # Hold failed messages long enough to inspect/redrive them (max is 14 days).
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "jobs" {
  name = "empress-jobs"

  # Heavy ingest jobs can run minutes — keep a message invisible while a worker
  # processes it so it isn't redelivered mid-run. Tune alongside backend #35.
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600 # 4 days (default)

  # After maxReceiveCount failed receives, SQS moves the message to the DLQ.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 5
  })
}

# Restrict who can feed the DLQ to just our main queue's redrive (defense in
# depth — nothing else should be writing dead letters).
resource "aws_sqs_queue_redrive_allow_policy" "jobs_dlq" {
  queue_url = aws_sqs_queue.jobs_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.jobs.arn]
  })
}

# ------------------------------------------------------------------
# Least-privilege IAM — producer (API) and consumer (worker).
# ------------------------------------------------------------------
data "aws_iam_policy_document" "sqs_jobs_send" {
  statement {
    sid       = "SendToJobsQueue"
    effect    = "Allow"
    actions   = ["sqs:SendMessage", "sqs:GetQueueUrl", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

resource "aws_iam_policy" "sqs_jobs_send" {
  name        = "empress-sqs-jobs-send"
  description = "Allow the API to SendMessage to the empress-jobs queue (issue #39)."
  policy      = data.aws_iam_policy_document.sqs_jobs_send.json
}

data "aws_iam_policy_document" "sqs_jobs_consume" {
  statement {
    sid    = "ConsumeJobsQueue"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

resource "aws_iam_policy" "sqs_jobs_consume" {
  name        = "empress-sqs-jobs-consume"
  description = "Allow the worker to receive/delete messages on the empress-jobs queue (issue #39)."
  policy      = data.aws_iam_policy_document.sqs_jobs_consume.json
}

# ------------------------------------------------------------------
# Surface endpoints to the app via SSM (queue URLs/ARNs are not secrets, but
# config belongs in the parameter store, not hardcoded — CLAUDE.md).
# ------------------------------------------------------------------
resource "aws_ssm_parameter" "jobs_queue_url" {
  name        = "/empress/sqs/jobs_queue_url"
  type        = "String"
  value       = aws_sqs_queue.jobs.url
  description = "URL of the empress-jobs SQS queue (backend #35 producer/consumer)."
}

resource "aws_ssm_parameter" "jobs_dlq_url" {
  name        = "/empress/sqs/jobs_dlq_url"
  type        = "String"
  value       = aws_sqs_queue.jobs_dlq.url
  description = "URL of the empress-jobs dead-letter queue."
}
