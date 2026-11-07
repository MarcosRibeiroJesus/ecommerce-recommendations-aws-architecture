data "aws_region" "current" {}

resource "aws_ecr_repository" "app" {
  name                 = "${var.project_name}-${var.environment}-serving"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-serving-ecr"
    CostPosture = "Minimum-Cost-PoC"
  }
}

locals {
  effective_container_image = var.container_image != "" ? var.container_image : "${aws_ecr_repository.app.repository_url}:latest"
  dynamodb_resource_arn     = var.dynamodb_table_arn != "" ? var.dynamodb_table_arn : "arn:aws:dynamodb:${data.aws_region.current.region}:*:table/${var.dynamodb_table_name}"
  sagemaker_resource_arn    = var.sagemaker_endpoint_arn != "" ? var.sagemaker_endpoint_arn : "arn:aws:sagemaker:${data.aws_region.current.region}:*:endpoint/${var.sagemaker_endpoint_name}"
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cluster"
    CostPosture = "Minimum-Cost-PoC"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 80
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 20
    base              = 1
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-logs"
  }
}

# IAM Task Execution Role
data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution_role" {
  name               = "${var.project_name}-${var.environment}-ecs-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

# Least-privilege task policy scoped to explicit DynamoDB & SageMaker ARNs and CloudWatch namespace
resource "aws_iam_policy" "ecs_task_policy" {
  name = "${var.project_name}-${var.environment}-ecs-task-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:BatchGetItem"]
        Resource = [local.dynamodb_resource_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["sagemaker:InvokeEndpoint"]
        Resource = [local.sagemaker_resource_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "EcommerceRecommendations"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_policy_attach" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_task_policy.arn
}

# ALB & Target Group
resource "aws_lb" "alb" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name = "${var.project_name}-${var.environment}-alb"
  }
}

resource "aws_lb_target_group" "app" {
  name        = "${var.project_name}-${var.environment}-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Task Definition (0.5 vCPU = 512, 1 GB RAM = 1024)
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-${var.environment}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "recommendation-service"
      image     = local.effective_container_image
      essential = true
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = "8080" },
        { name = "AWS_REGION", value = data.aws_region.current.region },
        { name = "DYNAMODB_TABLE_NAME", value = var.dynamodb_table_name },
        { name = "MEMORYDB_CLUSTER_ENDPOINT", value = var.memorydb_cluster_endpoint },
        { name = "SAGEMAKER_ENDPOINT_NAME", value = var.sagemaker_endpoint_name },
        { name = "LOG_LEVEL", value = "info" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Name        = "${var.project_name}-${var.environment}-task"
    CostPosture = "Fargate-Spot-Minimum"
  }
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-${var.environment}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 80
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 20
    base              = 1
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "recommendation-service"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.http]

  tags = {
    Name = "${var.project_name}-${var.environment}-service"
  }
}
