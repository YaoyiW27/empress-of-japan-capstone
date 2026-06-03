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
