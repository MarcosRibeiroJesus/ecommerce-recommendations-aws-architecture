variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment posture environment (poc, dev, prod)"
  type        = string
  default     = "poc"
}

variable "project_name" {
  description = "Project name prefix for resource tagging and identification"
  type        = string
  default     = "ecommerce-recommendations"
}

variable "enable_serverless_inference" {
  description = "Enable SageMaker Serverless Inference ($0 idle cost for PoC posture)"
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Force destroy S3 buckets and state to prevent teardown failure per Principle V"
  type        = bool
  default     = true
}

variable "enable_mwaa" {
  description = "Enable MWAA environment on demand for verification (71.2% cost driver - false by default for ephemeral PoC posture)"
  type        = bool
  default     = false
}
