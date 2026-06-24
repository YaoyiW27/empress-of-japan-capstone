# Baseline observability dashboard for the deployed backend.
#
# This is intentionally CloudWatch-only for the first pass: it uses metrics and
# logs already emitted by ECS, ALB, SQS, and awslogs. Deeper request traces are
# tracked separately via the OTel/Honeycomb follow-up.

resource "aws_cloudwatch_dashboard" "backend_observability" {
  dashboard_name = "empress-backend-observability"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2
        properties = {
          markdown = "# Empress backend observability\nFargate service health, ALB traffic, async queue depth, and recent backend logs for the sandbox deployment."
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "ECS backend CPU and memory"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          period  = 60
          stat    = "Average"
          metrics = [
            [
              "AWS/ECS",
              "CPUUtilization",
              "ClusterName",
              aws_ecs_cluster.app.name,
              "ServiceName",
              aws_ecs_service.backend.name,
            ],
            [
              ".",
              "MemoryUtilization",
              ".",
              ".",
              ".",
              ".",
            ],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "ALB traffic and latency"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          period  = 60
          metrics = [
            [
              "AWS/ApplicationELB",
              "RequestCount",
              "LoadBalancer",
              aws_lb.backend.arn_suffix,
              {
                stat = "Sum"
              },
            ],
            [
              ".",
              "TargetResponseTime",
              ".",
              ".",
              {
                stat  = "Average"
                yAxis = "right"
              },
            ],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "ALB errors"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          period  = 60
          stat    = "Sum"
          metrics = [
            [
              "AWS/ApplicationELB",
              "HTTPCode_Target_5XX_Count",
              "LoadBalancer",
              aws_lb.backend.arn_suffix,
            ],
            [
              ".",
              "HTTPCode_ELB_5XX_Count",
              ".",
              ".",
            ],
            [
              ".",
              "HTTPCode_Target_4XX_Count",
              ".",
              ".",
            ],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "Backend target health"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          period  = 60
          stat    = "Average"
          metrics = [
            [
              "AWS/ApplicationELB",
              "HealthyHostCount",
              "TargetGroup",
              aws_lb_target_group.backend.arn_suffix,
              "LoadBalancer",
              aws_lb.backend.arn_suffix,
            ],
            [
              ".",
              "UnHealthyHostCount",
              ".",
              ".",
              ".",
              ".",
            ],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "Async jobs queue depth"
          region  = var.region
          view    = "timeSeries"
          stacked = false
          period  = 60
          stat    = "Average"
          metrics = [
            [
              "AWS/SQS",
              "ApproximateNumberOfMessagesVisible",
              "QueueName",
              aws_sqs_queue.jobs.name,
              {
                label = "jobs visible"
              },
            ],
            [
              ".",
              ".",
              ".",
              aws_sqs_queue.jobs_dlq.name,
              {
                label = "DLQ visible"
              },
            ],
            [
              ".",
              "ApproximateAgeOfOldestMessage",
              ".",
              aws_sqs_queue.jobs.name,
              {
                label = "oldest jobs message age"
                yAxis = "right"
              },
            ],
          ]
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title  = "Recent backend logs"
          region = var.region
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.backend.name}' | fields @timestamp, @message | sort @timestamp desc | limit 20"
        }
      },
    ]
  })
}
