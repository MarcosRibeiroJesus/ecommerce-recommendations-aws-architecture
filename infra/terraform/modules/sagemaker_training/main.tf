data "aws_iam_policy_document" "sagemaker_train_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["sagemaker.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sagemaker_train_role" {
  name               = "${var.project_name}-${var.environment}-sm-train-role"
  assume_role_policy = data.aws_iam_policy_document.sagemaker_train_assume_role.json
}

resource "aws_iam_policy" "sagemaker_s3_policy" {
  name = "${var.project_name}-${var.environment}-sm-s3-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [var.s3_bucket_arn, "${var.s3_bucket_arn}/*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "sagemaker_s3_attach" {
  role       = aws_iam_role.sagemaker_train_role.name
  policy_arn = aws_iam_policy.sagemaker_s3_policy.arn
}

resource "aws_s3_object" "train_script" {
  bucket = var.s3_bucket_name
  key    = "scripts/train_model.py"
  source = "${path.module}/../../../../src/batch/sagemaker/train_model.py"
  etag   = filemd5("${path.module}/../../../../src/batch/sagemaker/train_model.py")
}
