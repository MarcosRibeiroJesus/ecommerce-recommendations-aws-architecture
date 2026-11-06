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

variable "subnet_ids" {
  type        = list(string)
  description = "Private Subnet IDs"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security Group IDs"
}

variable "node_type" {
  type        = string
  default     = "db.t4g.small"
  description = "MemoryDB node type (minimum cost for PoC)"
}
