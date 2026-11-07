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
  description = "ARN of the S3 Golden Dataset bucket to register in Lake Formation"
}

variable "database_name" {
  type        = string
  default     = "ecommerce_golden_db"
  description = "Glue Catalog Database Name"
}
