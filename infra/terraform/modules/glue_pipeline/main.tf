data "aws_iam_policy_document" "glue_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "glue_service_role" {
  name               = "${var.project_name}-${var.environment}-glue-role"
  assume_role_policy = data.aws_iam_policy_document.glue_assume_role.json
}

resource "aws_iam_role_policy_attachment" "glue_service" {
  role       = aws_iam_role.glue_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

locals {
  s3_bucket_resource_arn = var.s3_bucket_arn != "" ? var.s3_bucket_arn : "arn:aws:s3:::${var.s3_scripts_bucket}"
  dynamodb_resource_arn  = var.dynamodb_table_arn != "" ? var.dynamodb_table_arn : "arn:aws:dynamodb:*:*:table/${var.project_name}-${var.environment}-user_recommendations"
}

resource "aws_iam_role_policy" "glue_least_privilege_data" {
  name = "${var.project_name}-${var.environment}-glue-data-policy"
  role = aws_iam_role.glue_service_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          local.s3_bucket_resource_arn,
          "${local.s3_bucket_resource_arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:BatchWriteItem", "dynamodb:PutItem", "dynamodb:DescribeTable"]
        Resource = [local.dynamodb_resource_arn]
      }
    ]
  })
}

# 1. S3 script upload & Glue Job for Feature Engineering
resource "aws_s3_object" "script_feature_engineering" {
  bucket = var.s3_scripts_bucket
  key    = "scripts/feature_engineering.py"
  source = "${path.module}/../../../../src/batch/glue/feature_engineering.py"
  etag   = filemd5("${path.module}/../../../../src/batch/glue/feature_engineering.py")
}

resource "aws_glue_job" "feature_engineering" {
  name              = "${var.project_name}-${var.environment}-feature-engineering"
  role_arn          = aws_iam_role.glue_service_role.arn
  glue_version      = "4.0"
  worker_type       = "G.1X"
  number_of_workers = 2
  timeout           = 30

  command {
    script_location = "s3://${var.s3_scripts_bucket}/${aws_s3_object.script_feature_engineering.key}"
    python_version  = "3"
  }

  default_arguments = {
    "--job-bookmark-option"              = "job-bookmark-enable"
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--S3_GOLDEN_BUCKET"                 = var.s3_scripts_bucket
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-glue-feature-job"
    CostPosture = "G.1X-2Workers-30mTimeout"
  }
}

# 2. S3 script upload & Glue Job for DynamoDB Batch Recommendations Publisher (C4 Remediation)
resource "aws_s3_object" "script_publish_dynamodb" {
  bucket = var.s3_scripts_bucket
  key    = "scripts/publish_dynamodb.py"
  source = "${path.module}/../../../../src/batch/glue/publish_dynamodb.py"
  etag   = filemd5("${path.module}/../../../../src/batch/glue/publish_dynamodb.py")
}

resource "aws_glue_job" "publish_batch_dynamodb" {
  name              = "${var.project_name}-${var.environment}-publish-batch-dynamodb"
  role_arn          = aws_iam_role.glue_service_role.arn
  glue_version      = "4.0"
  worker_type       = "G.1X"
  number_of_workers = 2
  timeout           = 30

  command {
    script_location = "s3://${var.s3_scripts_bucket}/${aws_s3_object.script_publish_dynamodb.key}"
    python_version  = "3"
  }

  default_arguments = {
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--DYNAMODB_TABLE_NAME"              = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-user_recommendations"
    "--S3_GOLDEN_BUCKET"                 = var.s3_scripts_bucket
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-glue-publish-dynamodb"
    CostPosture = "G.1X-2Workers-30mTimeout"
  }
}

# 3. S3 script upload & Glue Job for MemoryDB Vector Publisher (C4 Remediation)
resource "aws_s3_object" "script_publish_memorydb_vectors" {
  bucket = var.s3_scripts_bucket
  key    = "scripts/publish_memorydb_vectors.py"
  source = "${path.module}/../../../../src/batch/glue/publish_memorydb_vectors.py"
  etag   = filemd5("${path.module}/../../../../src/batch/glue/publish_memorydb_vectors.py")
}

resource "aws_glue_job" "publish_memorydb_vectors" {
  name              = "${var.project_name}-${var.environment}-publish-memorydb-vectors"
  role_arn          = aws_iam_role.glue_service_role.arn
  glue_version      = "4.0"
  worker_type       = "G.1X"
  number_of_workers = 2
  timeout           = 30

  command {
    script_location = "s3://${var.s3_scripts_bucket}/${aws_s3_object.script_publish_memorydb_vectors.key}"
    python_version  = "3"
  }

  default_arguments = {
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--MEMORYDB_CLUSTER_ENDPOINT"        = var.memorydb_cluster_endpoint
    "--S3_GOLDEN_BUCKET"                 = var.s3_scripts_bucket
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-glue-publish-memorydb"
    CostPosture = "G.1X-2Workers-30mTimeout"
  }
}
