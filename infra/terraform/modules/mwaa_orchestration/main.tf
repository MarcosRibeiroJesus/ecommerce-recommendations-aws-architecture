data "aws_iam_policy_document" "mwaa_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["airflow.amazonaws.com", "airflow-env.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "mwaa_execution_role" {
  count              = var.enable_mwaa ? 1 : 0
  name               = "${var.project_name}-${var.environment}-mwaa-role"
  assume_role_policy = data.aws_iam_policy_document.mwaa_assume_role.json
}

resource "aws_security_group" "mwaa" {
  count       = var.enable_mwaa ? 1 : 0
  name        = "${var.project_name}-${var.environment}-mwaa-sg"
  description = "Security group for MWAA environment"
  vpc_id      = var.vpc_id

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mwaa-sg"
  }
}

# Upload Airflow DAG to S3
resource "aws_s3_object" "pipeline_dag" {
  bucket = var.s3_bucket_name
  key    = "dags/daily_hybrid_recommendation_pipeline.py"
  source = "${path.module}/../../../../src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py"
  etag   = filemd5("${path.module}/../../../../src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py")
}

resource "aws_mwaa_environment" "pipeline" {
  count                 = var.enable_mwaa ? 1 : 0
  name                  = "${var.project_name}-${var.environment}-mwaa"
  airflow_version       = "2.8.1"
  environment_class     = "mw1.small"
  execution_role_arn    = aws_iam_role.mwaa_execution_role[0].arn
  source_bucket_arn     = var.s3_bucket_arn
  dag_s3_path           = "dags"
  min_workers           = 1
  max_workers           = 2
  webserver_access_mode = "PUBLIC_ONLY"

  network_configuration {
    security_group_ids = [aws_security_group.mwaa[0].id]
    subnet_ids         = slice(var.private_subnet_ids, 0, 2)
  }

  logging_configuration {
    dag_processing_logs {
      enabled   = true
      log_level = "INFO"
    }
    task_logs {
      enabled   = true
      log_level = "INFO"
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-mwaa"
    CostPosture = "mw1.small-Ephemeral"
  }
}
