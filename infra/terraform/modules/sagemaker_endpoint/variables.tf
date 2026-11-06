variable "project_name" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name"
}

variable "enable_serverless_inference" {
  type        = bool
  default     = true
  description = "Enable Serverless Inference ($0 idle cost for PoC posture)"
}
