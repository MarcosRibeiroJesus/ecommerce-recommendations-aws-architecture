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
