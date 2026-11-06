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

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public Subnet IDs for ALB"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private Subnet IDs for ECS tasks"
}

variable "alb_security_group_id" {
  type        = string
  description = "ALB Security Group ID"
}

variable "ecs_security_group_id" {
  type        = string
  description = "ECS Security Group ID"
}

variable "dynamodb_table_name" {
  type        = string
  description = "DynamoDB table name"
}

variable "memorydb_cluster_endpoint" {
  type        = string
  description = "MemoryDB cluster endpoint"
}

variable "sagemaker_endpoint_name" {
  type        = string
  description = "SageMaker endpoint name"
}

variable "container_image" {
  type        = string
  default     = "public.ecr.aws/amazonlinux/amazonlinux:latest"
  description = "Recommendation Service container image"
}
