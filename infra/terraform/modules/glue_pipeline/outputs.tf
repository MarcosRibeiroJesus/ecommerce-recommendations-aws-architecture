output "glue_job_name" {
  value = aws_glue_job.feature_engineering.name
}

output "glue_job_arn" {
  value = aws_glue_job.feature_engineering.arn
}

output "publish_dynamodb_job_name" {
  value = aws_glue_job.publish_batch_dynamodb.name
}

output "publish_memorydb_job_name" {
  value = aws_glue_job.publish_memorydb_vectors.name
}

output "glue_role_arn" {
  value = aws_iam_role.glue_service_role.arn
}
