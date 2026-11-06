variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "s3_bucket_arn" {
  type        = string
  description = "S3 Golden Dataset bucket ARN"
}

variable "s3_bucket_name" {
  type        = string
  description = "S3 Golden Dataset bucket name"
}
