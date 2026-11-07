output "bucket_id" {
  value = aws_s3_bucket.golden_dataset.id
}

output "bucket_name" {
  value = aws_s3_bucket.golden_dataset.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.golden_dataset.arn
}

output "kms_key_arn" {
  value = aws_kms_key.golden_dataset.arn
}
