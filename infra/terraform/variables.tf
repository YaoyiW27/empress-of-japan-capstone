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

# --- Shared network (issue #25 / future Fargate, see network.tf) ---

variable "vpc_cidr" {
  description = "CIDR block for the sandbox application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs for backend/RDS resources. RDS subnet groups require at least two AZs."
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) >= 2
    error_message = "RDS subnet groups require at least two private subnet CIDRs."
  }
}

# --- Knowledge base RDS (issue #25, see rds.tf) ---

variable "kb_db_name" {
  description = "Initial database name for the knowledge base."
  type        = string
  default     = "empress"
}

variable "kb_db_username" {
  description = "RDS master username. Password is generated and stored by RDS in Secrets Manager."
  type        = string
  default     = "empress_admin"
}

variable "kb_db_instance_class" {
  description = "Smallest Graviton RDS class for the sandbox knowledge base."
  type        = string
  default     = "db.t4g.micro"
}

variable "kb_db_engine_version" {
  description = "PostgreSQL major version for RDS. Keep on 16+ for pgvector/HNSW support."
  type        = string
  default     = "16"
}

variable "kb_db_allocated_storage_gb" {
  description = "Initial RDS storage in GiB."
  type        = number
  default     = 20
}

variable "kb_db_max_allocated_storage_gb" {
  description = "Autoscaling storage ceiling in GiB."
  type        = number
  default     = 50
}

variable "kb_db_stop_schedule" {
  description = "EventBridge Scheduler expression that stops the RDS instance when the team is unlikely to use it."
  type        = string
  default     = "cron(0 22 ? * MON-FRI *)"
}

variable "kb_db_stop_schedule_timezone" {
  description = "Timezone for the RDS stop schedule."
  type        = string
  default     = "America/Vancouver"
}

# --- Bedrock embeddings (issue #48, see bedrock.tf) ---

variable "bedrock_embedding_model_id" {
  description = "Bedrock foundation model id for ingest embeddings. Mirrors backend/app/config.py (bedrock_embedding_model) — keep the two in sync."
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
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
