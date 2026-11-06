variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "s3_output_bucket" {
  type        = string
  description = "S3 bucket for Athena query results"
}

variable "database_name" {
  type        = string
  default     = "ecommerce_golden_db"
  description = "Glue database name"
}
