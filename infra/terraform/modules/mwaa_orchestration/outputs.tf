output "mwaa_arn" {
  value = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].arn : null
}

output "mwaa_webserver_url" {
  value = var.enable_mwaa ? aws_mwaa_environment.pipeline[0].webserver_url : null
}
