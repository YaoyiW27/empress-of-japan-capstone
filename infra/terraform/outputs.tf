output "canary_parameter_name" {
  description = "Name of the CI canary SSM parameter."
  value       = aws_ssm_parameter.ci_canary.name
}

output "canary_parameter_arn" {
  description = "ARN of the CI canary SSM parameter."
  value       = aws_ssm_parameter.ci_canary.arn
}
