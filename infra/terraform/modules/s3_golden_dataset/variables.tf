variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "force_destroy" {
  type        = bool
  default     = true
  description = "Force destroy bucket on teardown per Principle V"
}
