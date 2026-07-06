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
          markdown = "# Empress backend observability\nAPI and worker health, ALB traffic, async queue depth, and recent runtime logs for the sandbox deployment."
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "ECS API and worker CPU/memory"
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
              {
                label = "API CPU"
              },
            ],
            [
              ".",
              "MemoryUtilization",
              ".",
              ".",
              ".",
              ".",
              {
                label = "API memory"
              },
            ],
            [
              "AWS/ECS",
              "CPUUtilization",
              "ClusterName",
              aws_ecs_cluster.app.name,
              "ServiceName",
              aws_ecs_service.worker.name,
              {
                label = "worker CPU"
              },
            ],
            [
              ".",
              "MemoryUtilization",
              ".",
              ".",
              ".",
              ".",
              {
                label = "worker memory"
              },
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
      {
        type   = "log"
        x      = 12
        y      = 20
        width  = 12
        height = 6
        properties = {
          title  = "Recent worker logs"
          region = var.region
          view   = "table"
          query  = "SOURCE '${aws_cloudwatch_log_group.worker.name}' | fields @timestamp, @message | sort @timestamp desc | limit 20"
        }
      },
    ]
  })
}

locals {
  backend_alarm_actions = [aws_sns_topic.budget_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "backend_target_5xx" {
  alarm_name          = "empress-backend-target-5xx"
  alarm_description   = "Backend targets returned at least ${var.backend_alarm_5xx_threshold} 5xx responses in five minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.backend_alarm_5xx_threshold
  evaluation_periods  = 1
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.backend_alarm_actions
  ok_actions          = local.backend_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.backend.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_latency" {
  alarm_name          = "empress-backend-sustained-latency"
  alarm_description   = "Average backend response time exceeded ${var.backend_alarm_latency_seconds} seconds for three minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.backend_alarm_latency_seconds
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.backend_alarm_actions
  ok_actions          = local.backend_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.backend.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_unhealthy_targets" {
  alarm_name          = "empress-backend-unhealthy-targets"
  alarm_description   = "At least one backend target remained unhealthy for two minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.backend_alarm_actions
  ok_actions          = local.backend_alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.backend.arn_suffix
    TargetGroup  = aws_lb_target_group.backend.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "jobs_queue_backlog" {
  alarm_name          = "empress-jobs-queue-backlog"
  alarm_description   = "Visible async jobs reached ${var.jobs_queue_alarm_threshold}; inspect worker health and queue age."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.jobs_queue_alarm_threshold
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.backend_alarm_actions
  ok_actions          = local.backend_alarm_actions

  dimensions = {
    QueueName = aws_sqs_queue.jobs.name
  }
}

resource "aws_cloudwatch_metric_alarm" "jobs_dlq_visible" {
  alarm_name          = "empress-jobs-dlq-visible"
  alarm_description   = "At least one failed async job reached the DLQ; inspect it before redrive."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.backend_alarm_actions
  ok_actions          = local.backend_alarm_actions

  dimensions = {
    QueueName = aws_sqs_queue.jobs_dlq.name
  }
}
