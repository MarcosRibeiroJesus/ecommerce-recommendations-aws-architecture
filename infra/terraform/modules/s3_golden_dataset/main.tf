data "aws_caller_identity" "current" {}

resource "aws_kms_key" "golden_dataset" {
  description             = "KMS key for Golden Dataset S3 encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-${var.environment}-s3-kms"
  }
}

resource "aws_s3_bucket" "golden_dataset" {
  bucket        = "${var.project_name}-${var.environment}-golden-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy

  tags = {
    Name        = "${var.project_name}-${var.environment}-golden-dataset"
    DataTier    = "Golden"
    CostPosture = "Minimum-Cost-PoC"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.golden_dataset.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "golden_dataset" {
  bucket = aws_s3_bucket.golden_dataset.id

  rule {
    id     = "archive-raw-and-expire-scratch"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }

  rule {
    id     = "expire-scratch"
    status = "Enabled"

    filter {
      prefix = "scratch/"
    }

    expiration {
      days = 14
    }
  }
}

# Prefixes for Parquet datasets
resource "aws_s3_object" "prefix_catalog" {
  bucket = aws_s3_bucket.golden_dataset.id
  key    = "catalog/"
}

resource "aws_s3_object" "prefix_interactions" {
  bucket = aws_s3_bucket.golden_dataset.id
  key    = "interactions/"
}

resource "aws_s3_object" "prefix_user_features" {
  bucket = aws_s3_bucket.golden_dataset.id
  key    = "user_features/"
}

resource "aws_s3_object" "prefix_recommendations" {
  bucket = aws_s3_bucket.golden_dataset.id
  key    = "recommendations/"
}
