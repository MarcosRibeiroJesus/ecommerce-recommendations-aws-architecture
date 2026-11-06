variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "table_name" {
  type        = string
  default     = "user_recommendations"
  description = "DynamoDB table name for batch recommendation profiles"
}
