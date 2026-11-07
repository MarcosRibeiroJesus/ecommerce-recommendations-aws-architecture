output "workgroup_name" {
  value = aws_athena_workgroup.analytics.name
}

output "workgroup_arn" {
  value = aws_athena_workgroup.analytics.arn
}

output "named_query_id" {
  value = aws_athena_named_query.extract_curated_features.id
}
