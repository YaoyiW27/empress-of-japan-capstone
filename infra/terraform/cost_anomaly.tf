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
#
# DISABLED BY DEFAULT: the org Service Control Policy
# (arn:aws:organizations::123896930307:policy/.../p-9n6l6a99) explicitly denies
# ce:CreateAnomalyMonitor for our deploy role, so creating these resources fails
# `terraform apply` with an AccessDeniedException. Gated behind
# var.enable_cost_anomaly_detection (default false) so apply succeeds; flip it on
# if the SCP is ever relaxed to allow Cost Explorer writes. The monthly budget
# guardrail in budgets.tf keeps working regardless.

# Watch spend per AWS service so one runaway service is caught on its own.
resource "aws_ce_anomaly_monitor" "services" {
  count             = var.enable_cost_anomaly_detection ? 1 : 0
  name              = "empress-service-spend"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

# Notify the shared alert topic the moment an anomaly's total impact reaches the
# threshold. IMMEDIATE frequency delivers via SNS (email digests would need
# DAILY/WEEKLY); the topic already fans out to the team by email.
resource "aws_ce_anomaly_subscription" "spend" {
  count            = var.enable_cost_anomaly_detection ? 1 : 0
  name             = "empress-spend-anomalies"
  frequency        = "IMMEDIATE"
  monitor_arn_list = [aws_ce_anomaly_monitor.services[0].arn]

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
