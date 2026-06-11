# Cost tracking for the $1,000/month AWS Innovation Sandbox budget (issue #20).
#
# A single account-wide MONTHLY COST budget fans out to an SNS topic, which
# emails the four team members when ACTUAL spend crosses 20/50/80% and when
# FORECASTED spend is on track to cross 50/80%. The `Project` cost-allocation
# tag is activated so Cost Explorer can break spend down per project.
#
# Budgets + Cost Explorer are global services; their APIs resolve to us-east-1
# automatically, so the existing us-west-2 provider needs no alias.

# ------------------------------------------------------------------
# SNS topic — the delivery channel for every budget notification.
# ------------------------------------------------------------------
resource "aws_sns_topic" "budget_alerts" {
  name = "empress-budget-alerts"
}

# AWS Budgets must be allowed to publish to the topic, or notifications are
# dropped silently (no error surfaces in the budget itself).
data "aws_iam_policy_document" "budget_sns" {
  statement {
    sid       = "AllowBudgetsPublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.budget_alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "budget_alerts" {
  arn    = aws_sns_topic.budget_alerts.arn
  policy = data.aws_iam_policy_document.budget_sns.json
}

# One email subscription per team member. Each recipient must click the
# confirmation link AWS emails them — until then the subscription stays
# PendingConfirmation and no alerts arrive.
resource "aws_sns_topic_subscription" "budget_emails" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.budget_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# ------------------------------------------------------------------
# Monthly cost budget + notifications.
# ------------------------------------------------------------------
# ACTUAL alerts fire on spend already incurred; FORECASTED alerts fire when AWS
# projects month-end spend will cross the threshold — earlier warning.
locals {
  budget_notifications = concat(
    [for t in var.budget_thresholds : {
      key       = "actual-${t}"
      type      = "ACTUAL"
      threshold = t
    }],
    [for t in var.forecasted_thresholds : {
      key       = "forecasted-${t}"
      type      = "FORECASTED"
      threshold = t
    }],
  )
}

resource "aws_budgets_budget" "monthly" {
  name         = "empress-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_limit)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Track GROSS usage against the $1,000 allocation. The sandbox is credit-funded,
  # so leaving credits/refunds in (the provider default) would net spend down
  # toward $0 and the alerts would never fire.
  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = { for n in local.budget_notifications : n.key => n }
    content {
      notification_type         = notification.value.type
      comparison_operator       = "GREATER_THAN"
      threshold                 = notification.value.threshold
      threshold_type            = "PERCENTAGE"
      subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
    }
  }
}

# ------------------------------------------------------------------
# Cost Explorer — activate the `Project` tag for per-project breakdowns.
# ------------------------------------------------------------------
# The `Project = EmpressOfJapan` default tag (providers.tf) is already applied
# to our resources, so the key is activatable here. Cost Explorer can take ~24h
# to backfill the tag into its breakdowns after activation.
resource "aws_ce_cost_allocation_tag" "project" {
  tag_key = "Project"
  status  = "Active"
}
