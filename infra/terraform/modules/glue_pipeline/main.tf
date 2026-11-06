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

# S3 script upload for feature engineering
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
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-glue-job"
    CostPosture = "G.1X-2Workers-30mTimeout"
  }
}
