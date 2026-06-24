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

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for the ALB and NAT-free sandbox Fargate tasks."
  type        = list(string)
  default     = ["10.42.20.0/24", "10.42.21.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "An internet-facing ALB requires public subnets in at least two Availability Zones."
  }
}

# --- ECS backend runtime (issue #42 / #59) ---

variable "backend_log_retention_days" {
  description = "CloudWatch retention for backend ECS logs. Increase for production-like environments if required."
  type        = number
  default     = 14

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365], var.backend_log_retention_days)
    error_message = "Use a CloudWatch-supported retention period."
  }
}

variable "backend_task_cpu" {
  description = "Fargate CPU units for the backend API task."
  type        = number
  default     = 512
}

variable "backend_task_memory" {
  description = "Fargate memory in MiB for the backend API task."
  type        = number
  default     = 1024
}

variable "backend_bootstrap_image_tag" {
  description = "Initial immutable ECR image tag used by the Terraform task definition. The deploy workflow registers later commit-SHA revisions."
  type        = string
  default     = "bootstrap"
}

variable "backend_initial_desired_count" {
  description = "Initial task count before the first image deployment. CI scales the service to 2 after pushing the bootstrap image."
  type        = number
  default     = 0

  validation {
    condition     = var.backend_initial_desired_count == 0
    error_message = "Keep the Terraform bootstrap service at zero; the deployment workflow owns the running task count."
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

# --- Bedrock chat (issue #70, see bedrock.tf) ---

variable "bedrock_chat_inference_profile_id" {
  description = "US cross-Region inference profile for backend chat. Mirrors backend/app/config.py (bedrock_chat_model)."
  type        = string
  default     = "us.anthropic.claude-sonnet-4-6"

  validation {
    condition     = startswith(var.bedrock_chat_inference_profile_id, "us.anthropic.")
    error_message = "Chat must use a US Anthropic inference profile so destination Regions stay within the US geography."
  }
}

# --- Backend observability (issue #41, see monitoring.tf / ecs.tf) ---

variable "backend_otel_enabled" {
  description = "Enable OpenTelemetry trace export from the backend container."
  type        = bool
  default     = false
}

variable "backend_otel_service_name" {
  description = "OpenTelemetry service.name for backend traces."
  type        = string
  default     = "empress-backend"
}

variable "backend_otel_exporter_otlp_endpoint" {
  description = "OTLP/HTTP trace endpoint used by the backend. Defaults to the local OTel Collector sidecar."
  type        = string
  default     = "http://127.0.0.1:4318/v1/traces"
}

variable "backend_honeycomb_dataset" {
  description = "Honeycomb dataset for backend traces."
  type        = string
  default     = "empress-backend-sandbox"
}

variable "honeycomb_api_key_secret_arn" {
  description = "Optional Secrets Manager ARN containing the Honeycomb API key. Leave null until the key is provisioned."
  type        = string
  default     = null
}

variable "otel_collector_image" {
  description = "OpenTelemetry Collector sidecar image. The contrib distribution includes OTLP receivers, batch/memory processors, and OTLP/HTTP exporters."
  type        = string
  default     = "otel/opentelemetry-collector-contrib:0.104.0"
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
