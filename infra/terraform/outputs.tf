output "s3_golden_dataset_bucket" {
  description = "Name of the S3 Golden Dataset bucket"
  value       = module.s3_golden_dataset.bucket_name
}

output "dynamodb_table_name" {
  description = "DynamoDB batch recommendation profiles table name"
  value       = module.dynamodb_table.table_name
}

output "memorydb_cluster_endpoint" {
  description = "MemoryDB vector search cluster endpoint"
  value       = module.memorydb_cluster.cluster_endpoint
}

output "sagemaker_endpoint_name" {
  description = "SageMaker Serverless Inference endpoint name"
  value       = module.sagemaker_endpoint.endpoint_name
}

output "ecs_service_alb_dns" {
  description = "Application Load Balancer DNS name for the recommendation serving API"
  value       = module.ecs_service.alb_dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for the Recommendation Service container image"
  value       = module.ecs_service.ecr_repository_url
}

output "athena_workgroup_name" {
  description = "Athena analytical workgroup name"
  value       = module.athena_queries.workgroup_name
}

output "glue_job_name" {
  description = "Glue feature engineering job name"
  value       = module.glue_pipeline.glue_job_name
}

output "glue_publish_dynamodb_job_name" {
  description = "Glue DynamoDB batch recommendations publisher job name"
  value       = module.glue_pipeline.publish_dynamodb_job_name
}

output "glue_publish_memorydb_job_name" {
  description = "Glue MemoryDB vector publisher job name"
  value       = module.glue_pipeline.publish_memorydb_job_name
}

output "sagemaker_train_script_uri" {
  description = "S3 URI for SageMaker Spot collaborative filtering training script"
  value       = module.sagemaker_training.train_script_s3_uri
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch monitoring dashboard name"
  value       = module.cloudwatch_monitoring.dashboard_name
}
