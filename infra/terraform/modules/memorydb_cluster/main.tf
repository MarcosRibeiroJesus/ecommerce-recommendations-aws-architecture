resource "aws_memorydb_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-memdb-subnets"
  subnet_ids  = var.subnet_ids
  description = "MemoryDB subnet group across private subnets"
}

resource "aws_memorydb_parameter_group" "redis7" {
  name   = "${var.project_name}-${var.environment}-memdb-params"
  family = "memorydb_redis7"

  parameter {
    name  = "activedefrag"
    value = "yes"
  }
}

resource "aws_memorydb_cluster" "vector_cluster" {
  name                   = "${var.project_name}-${var.environment}-vec"
  acl_name               = "open-access"
  node_type              = var.node_type
  num_shards             = 1
  num_replicas_per_shard = 0
  port                   = 6379
  engine_version         = "7.1"
  parameter_group_name   = aws_memorydb_parameter_group.redis7.name
  subnet_group_name      = aws_memorydb_subnet_group.main.name
  security_group_ids     = var.security_group_ids
  tls_enabled            = false

  tags = {
    Name        = "${var.project_name}-${var.environment}-memorydb-vector"
    CostPosture = "Minimum-Cost-PoC"
    Replicas    = "0"
  }
}
