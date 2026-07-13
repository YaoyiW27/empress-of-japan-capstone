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

variable "worker_task_cpu" {
  description = "Fargate CPU units for the async ingest worker task."
  type        = number
  default     = 512
}

variable "worker_task_memory" {
  description = "Fargate memory in MiB for the async ingest worker task."
  type        = number
  default     = 1024
}

variable "worker_desired_count" {
  description = "Worker tasks activated by the deploy workflow after a real image is available."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_desired_count == 1
    error_message = "Keep one worker in the bounded sandbox until queue-based autoscaling is tested."
  }
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

variable "backend_autoscaling_min_capacity" {
  description = "Minimum backend Fargate tasks activated by the deploy workflow after the first image is healthy."
  type        = number
  default     = 2

  validation {
    condition     = var.backend_autoscaling_min_capacity >= 1
    error_message = "Backend autoscaling minimum capacity must be at least 1."
  }
}

variable "backend_autoscaling_max_capacity" {
  description = "Maximum backend Fargate tasks for sandbox cost control. This is a guardrail, not a proven concurrent-user limit."
  type        = number
  default     = 6

  validation {
    condition     = var.backend_autoscaling_max_capacity >= var.backend_autoscaling_min_capacity
    error_message = "Backend autoscaling maximum capacity must be greater than or equal to the minimum capacity."
  }
}

variable "backend_autoscaling_cpu_target_percent" {
  description = "Average ECS service CPU percentage for target tracking. Start below saturation to leave latency headroom; tune with load tests."
  type        = number
  default     = 60

  validation {
    condition     = var.backend_autoscaling_cpu_target_percent >= 30 && var.backend_autoscaling_cpu_target_percent <= 80
    error_message = "Backend CPU target should stay between 30 and 80 percent for this sandbox."
  }
}

variable "backend_cors_origins" {
  description = "EXTRA browser origins allowed to call the deployed backend, on top of the AWS frontend CloudFront origins (wired in automatically from frontend.tf). Transitional: holds the legacy Vercel URLs during the Vercel->AWS cutover. Empty this list once Vercel is retired. Keep entries explicit; never use a wildcard for the public API."
  type        = list(string)
  default = [
    "https://empress-of-japan-capstone.vercel.app",
    "https://empress-gyro-test.vercel.app",
  ]

  validation {
    condition = alltrue([
      for origin in var.backend_cors_origins : startswith(origin, "https://") && !endswith(origin, "/")
    ])
    error_message = "Backend CORS origins must be exact HTTPS origins without a trailing slash."
  }
}

# --- Static frontend hosting (Vercel -> AWS migration, see frontend.tf) ---

variable "frontend_sites" {
  description = "Static frontend sites to host on S3 + CloudFront, keyed by short name. Each entry becomes its own private bucket and CloudFront distribution serving the same built assets. Defaults to a single production site; add another entry (e.g. gyro-test) to restore a second deployment."
  type = map(object({
    comment = string
  }))
  default = {
    main = {
      comment = "Empress of Japan production frontend (static export)"
    }
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

# --- Full ingest inputs (issue #136, see ingest.tf) ---

variable "ingest_vmm_csv_key" {
  description = "Exact private S3 key for the operator-uploaded VMM catalogue CSV."
  type        = string
  default     = "vmm/export_empress-of-japan.csv"

  validation {
    condition     = startswith(var.ingest_vmm_csv_key, "vmm/") && !endswith(var.ingest_vmm_csv_key, "/")
    error_message = "The VMM CSV key must be a file below the vmm/ prefix."
  }
}

variable "ingest_classified_workbook_key" {
  description = "Exact private S3 key for the operator-uploaded classified workbook."
  type        = string
  default     = "vmm/Empress_of_Japan_records_classified.xlsx"

  validation {
    condition     = startswith(var.ingest_classified_workbook_key, "vmm/") && !endswith(var.ingest_classified_workbook_key, "/")
    error_message = "The classified workbook key must be a file below the vmm/ prefix."
  }
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

# --- Voice interaction (issue #96, see voice.tf / ecs.tf) ---

variable "voice_cache_prefix" {
  description = "S3 object prefix reserved for generated Polly narration audio."
  type        = string
  default     = "polly-cache/"

  validation {
    condition = (
      length(var.voice_cache_prefix) > 1 &&
      !startswith(var.voice_cache_prefix, "/") &&
      endswith(var.voice_cache_prefix, "/")
    )
    error_message = "Voice cache prefix must be a non-empty relative prefix ending in '/'."
  }
}

variable "voice_polly_engine" {
  description = "Amazon Polly synthesis engine selected by the backend voice adapter."
  type        = string
  default     = "neural"

  validation {
    condition = contains(
      ["standard", "neural", "long-form", "generative"],
      var.voice_polly_engine,
    )
    error_message = "Use a supported Amazon Polly engine."
  }
}

variable "voice_transcribe_language_code" {
  description = "Initial Amazon Transcribe language for the English museum demo."
  type        = string
  default     = "en-US"
}

variable "voice_audio_url_ttl_seconds" {
  description = "Lifetime of presigned S3 URLs returned for generated narration audio."
  type        = number
  default     = 900

  validation {
    condition     = var.voice_audio_url_ttl_seconds >= 60 && var.voice_audio_url_ttl_seconds <= 3600
    error_message = "Voice audio URL TTL must stay between 60 and 3600 seconds."
  }
}

variable "voice_max_text_length" {
  description = "Maximum narrator-response characters accepted by the Polly adapter."
  type        = number
  default     = 1000

  validation {
    condition     = var.voice_max_text_length >= 1 && var.voice_max_text_length <= 3000
    error_message = "Voice text length must stay between 1 and 3000 characters."
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
  description = "Optional Secrets Manager ARN for a JSON secret whose api_key field contains the Honeycomb ingest API key."
  type        = string
  default     = null
}

variable "otel_collector_image" {
  description = "OpenTelemetry Collector sidecar image. The contrib distribution includes OTLP receivers, batch/memory processors, and OTLP/HTTP exporters."
  type        = string
  default     = "otel/opentelemetry-collector-contrib:0.104.0"
}

variable "backend_alarm_5xx_threshold" {
  description = "Target 5xx responses within five minutes that trigger the backend error alarm."
  type        = number
  default     = 5
}

variable "backend_alarm_latency_seconds" {
  description = "Average ALB target response time that triggers the sustained-latency alarm."
  type        = number
  default     = 2
}

variable "jobs_queue_alarm_threshold" {
  description = "Visible async jobs that trigger a queue-backlog alarm."
  type        = number
  default     = 10
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

variable "anthropic_marketplace_budget_limit" {
  description = "Monthly AWS Marketplace / Anthropic cost budget in USD. Covers Claude charges that Cost Anomaly Detection does not monitor."
  type        = number
  default     = 200
}

variable "budget_thresholds" {
  description = "ACTUAL-spend alert thresholds, as a percentage of each budget's monthly limit."
  type        = list(number)
  default     = [20, 50, 80]
}

variable "forecasted_thresholds" {
  description = "FORECASTED-spend alert thresholds, as a percentage of each budget's monthly limit (early warning before spend is incurred)."
  type        = list(number)
  default     = [50, 80]
}

# --- Cost anomaly detection (issue #60, see cost_anomaly.tf) ---

variable "cost_anomaly_alert_threshold_usd" {
  description = "Minimum total anomalous spend (USD) that triggers a Cost Anomaly Detection alert. Small for the sandbox so a single service spiking is caught early."
  type        = number
  default     = 15
}
