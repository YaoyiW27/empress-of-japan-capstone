# AWS Cost Anomaly Detection for the sandbox (issue #60).
#
# The monthly budget (budgets.tf) catches *total* spend crossing fixed
# thresholds. This catches *unexpected* spend — a single service (Bedrock,
# Fargate, RDS, ...) spiking above its learned baseline — which is the more
# useful signal before a demo. Cost Anomaly Detection itself is free; alerts
# reuse the existing empress-budget-alerts SNS topic.
#
# Cost Explorer / Cost Anomaly Detection are global services whose APIs resolve
# to us-east-1, so the default us-west-2 provider needs no alias (same as
# budgets.tf).

# Watch spend per AWS service so one runaway service is caught on its own.
resource "aws_ce_anomaly_monitor" "services" {
  name              = "empress-service-spend"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

# Notify the shared alert topic the moment an anomaly's total impact reaches the
# threshold. IMMEDIATE frequency delivers via SNS (email digests would need
# DAILY/WEEKLY); the topic already fans out to the team by email.
resource "aws_ce_anomaly_subscription" "spend" {
  name             = "empress-spend-anomalies"
  frequency        = "IMMEDIATE"
  monitor_arn_list = [aws_ce_anomaly_monitor.services.arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.budget_alerts.arn
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.cost_anomaly_alert_threshold_usd)]
    }
  }

  # The SNS topic policy must allow costalerts.amazonaws.com to publish before
  # the subscription can be created (see budgets.tf).
  depends_on = [aws_sns_topic_policy.budget_alerts]
}
