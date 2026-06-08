variable "region" {
  description = "AWS region for all resources. Locked to us-west-2 for this project."
  type        = string
  default     = "us-west-2"
}

variable "canary_value" {
  description = "Value stored in the CI canary SSM parameter."
  type        = string
  default     = "bootstrap-verified-by-yaoyi"
}

# --- Cost tracking (issue #20, see budgets.tf) ---

variable "alert_emails" {
  description = "Recipients for budget alert emails. Each must confirm the SNS subscription before alerts arrive."
  type        = list(string)
  default = [
    "wang.yaoyi@northeastern.edu", # Yaoyi (DevOps)
    "hsu.chin@northeastern.edu",   # Kelly (Frontend & 3D)
    "fang.su@northeastern.edu",    # Steven (UX & Voice)
    "li.qingm@northeastern.edu",   # Alina (Backend)
  ]
}

variable "monthly_budget_limit" {
  description = "Monthly AWS cost budget in USD. Alert thresholds are a percentage of this."
  type        = number
  default     = 1000
}

variable "budget_thresholds" {
  description = "ACTUAL-spend alert thresholds, as a percentage of the monthly limit."
  type        = list(number)
  default     = [20, 50, 80]
}

variable "forecasted_thresholds" {
  description = "FORECASTED-spend alert thresholds, as a percentage of the monthly limit (early warning before spend is incurred)."
  type        = list(number)
  default     = [50, 80]
}
