resource "aws_athena_workgroup" "analytics" {
  name = "${var.project_name}-${var.environment}-workgroup"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    bytes_scanned_cutoff_per_query     = 10737418240 # 10 GB scan limit per Constitution Principle I & VI

    result_configuration {
      output_location = "s3://${var.s3_output_bucket}/athena_results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-athena-workgroup"
    CostPosture = "10GB-Scan-Limit"
  }
}

resource "aws_athena_named_query" "extract_curated_features" {
  name      = "${var.project_name}-${var.environment}-extract-features"
  workgroup = aws_athena_workgroup.analytics.id
  database  = var.database_name
  query     = file("${path.module}/../../../../src/batch/athena/extract_curated_features.sql")
}
