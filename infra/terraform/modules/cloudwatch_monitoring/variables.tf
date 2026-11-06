variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "ecs_service_name" {
  type        = string
  default     = ""
  description = "ECS Service Name"
}

variable "ecs_cluster_name" {
  type        = string
  default     = ""
  description = "ECS Cluster Name"
}
