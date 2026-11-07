data "aws_iam_policy_document" "sagemaker_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["sagemaker.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sagemaker_execution" {
  name               = "${var.project_name}-${var.environment}-sagemaker-role"
  assume_role_policy = data.aws_iam_policy_document.sagemaker_assume_role.json

  tags = {
    Name = "${var.project_name}-${var.environment}-sagemaker-role"
  }
}

resource "aws_iam_role_policy_attachment" "sagemaker_full_access" {
  role       = aws_iam_role.sagemaker_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

# Dummy model artifact for PoC setup
resource "aws_sagemaker_model" "reranker" {
  name               = "${var.project_name}-${var.environment}-reranker-model"
  execution_role_arn = aws_iam_role.sagemaker_execution.arn

  primary_container {
    image = "683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-xgboost:1.7-1"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-reranker-model"
  }
}

resource "aws_sagemaker_endpoint_configuration" "reranker" {
  name = "${var.project_name}-${var.environment}-reranker-config"

  production_variants {
    variant_name           = "AllTraffic"
    model_name             = aws_sagemaker_model.reranker.name
    initial_instance_count = var.enable_serverless_inference ? null : 1
    instance_type          = var.enable_serverless_inference ? null : "ml.t3.medium"

    dynamic "serverless_config" {
      for_each = var.enable_serverless_inference ? [1] : []
      content {
        max_concurrency         = 5
        memory_size_in_mb       = 2048
        provisioned_concurrency = 0
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-reranker-endpoint-config"
    CostPosture = "Serverless-0-Idle"
  }
}

resource "aws_sagemaker_endpoint" "reranker" {
  name                 = "${var.project_name}-${var.environment}-reranker"
  endpoint_config_name = aws_sagemaker_endpoint_configuration.reranker.name

  tags = {
    Name        = "${var.project_name}-${var.environment}-reranker-endpoint"
    CostPosture = "Minimum-Cost-PoC"
  }
}
