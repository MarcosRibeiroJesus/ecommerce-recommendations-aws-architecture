variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private Subnet IDs for MWAA (2 AZs required)"
}

variable "s3_bucket_arn" {
  type        = string
  description = "S3 Golden Dataset bucket ARN"
}

variable "s3_bucket_name" {
  type        = string
  description = "S3 Golden Dataset bucket name"
}

variable "enable_mwaa" {
  type        = bool
  default     = false # Ephemeral lifecycle control: false by default to prevent $447.90/mo idle burn
  description = "Enable MWAA environment on demand for verification"
}
