output "training_role_arn" {
  value = aws_iam_role.sagemaker_train_role.arn
}

output "train_script_s3_uri" {
  value = "s3://${var.s3_bucket_name}/${aws_s3_object.train_script.key}"
}
