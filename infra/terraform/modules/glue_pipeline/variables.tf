variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "s3_scripts_bucket" {
  type        = string
  description = "S3 bucket for Glue ETL Python scripts"
}

variable "s3_bucket_arn" {
  type        = string
  default     = ""
  description = "S3 Golden Dataset bucket ARN for least-privilege IAM access"
}

variable "dynamodb_table_name" {
  type        = string
  default     = ""
  description = "DynamoDB table name for batch recommendations publishing"
}

variable "dynamodb_table_arn" {
  type        = string
  default     = ""
  description = "DynamoDB table ARN for least-privilege IAM access"
}

variable "memorydb_cluster_endpoint" {
  type        = string
  default     = "localhost:6379"
  description = "MemoryDB cluster endpoint for vector publishing"
}
