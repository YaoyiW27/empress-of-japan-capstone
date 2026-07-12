# Cost tracking for the $1,000/month AWS Innovation Sandbox budget (issue #20).
#
# A single account-wide MONTHLY COST budget fans out to an SNS topic, which
# emails the four team members when ACTUAL spend crosses 20/50/80% and when
# FORECASTED spend is on track to cross 50/80%. The `Project` tag is applied to
# resources through provider default_tags; activating that tag in Cost Explorer
# is an out-of-band management-account task because the sandbox SCP denies it.
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

  statement {
    sid       = "AllowCloudWatchAlarmsPublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.budget_alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Cost Anomaly Detection reuses this topic (issue #60, cost_anomaly.tf).
  statement {
    sid       = "AllowCostAnomalyPublish"
    effect    = "Allow"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.budget_alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
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
# Monthly cost budgets + notifications.
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

# Cost Anomaly Detection does not monitor third-party AWS Marketplace charges,
# including Anthropic Claude models surfaced through Amazon Bedrock. Keep the
# account-wide budget above, then add this narrower budget so Claude spend still
# triggers SNS alerts even when anomaly detection is blind to it.
resource "aws_budgets_budget" "anthropic_marketplace" {
  name         = "empress-anthropic-marketplace-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.anthropic_marketplace_budget_limit)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name = "BillingEntity"
    values = [
      "AWS Marketplace",
    ]
  }

  cost_filter {
    name = "LegalEntityName"
    values = [
      "Anthropic, PBC",
    ]
  }

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

# Cost Explorer note:
# The AWS Innovation Sandbox's Organizations SCP explicitly denies
# ce:UpdateCostAllocationTagsStatus from this member account, so Terraform
# cannot manage aws_ce_cost_allocation_tag here. If per-project Cost Explorer
# breakdowns are needed, an administrator in the management account must activate
# the `Project` cost allocation tag manually. Resource tagging itself still
# happens through providers.tf default_tags.
