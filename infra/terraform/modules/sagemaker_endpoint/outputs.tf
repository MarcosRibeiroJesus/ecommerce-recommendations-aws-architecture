output "endpoint_name" {
  value = aws_sagemaker_endpoint.reranker.name
}

output "endpoint_arn" {
  value = aws_sagemaker_endpoint.reranker.arn
}
