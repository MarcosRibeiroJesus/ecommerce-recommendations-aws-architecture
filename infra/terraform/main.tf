terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      CostPosture = "Minimum-Cost-PoC"
    }
  }
}

# Module invocations will be connected as modules are implemented
module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name
  environment  = var.environment
}

module "s3_golden_dataset" {
  source        = "./modules/s3_golden_dataset"
  project_name  = var.project_name
  environment   = var.environment
  force_destroy = var.force_destroy
}

module "lake_formation" {
  source        = "./modules/lake_formation"
  project_name  = var.project_name
  environment   = var.environment
  s3_bucket_arn = module.s3_golden_dataset.bucket_arn
}

module "dynamodb_table" {
  source       = "./modules/dynamodb_table"
  project_name = var.project_name
  environment  = var.environment
}

module "memorydb_cluster" {
  source             = "./modules/memorydb_cluster"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.internal_sg_id]
}

module "sagemaker_endpoint" {
  source                      = "./modules/sagemaker_endpoint"
  project_name                = var.project_name
  environment                 = var.environment
  enable_serverless_inference = var.enable_serverless_inference
}

module "ecs_service" {
  source                    = "./modules/ecs_service"
  project_name              = var.project_name
  environment               = var.environment
  vpc_id                    = module.networking.vpc_id
  public_subnet_ids         = module.networking.public_subnet_ids
  private_subnet_ids        = module.networking.private_subnet_ids
  alb_security_group_id     = module.networking.alb_sg_id
  ecs_security_group_id     = module.networking.ecs_sg_id
  dynamodb_table_name       = module.dynamodb_table.table_name
  memorydb_cluster_endpoint = module.memorydb_cluster.cluster_endpoint
  sagemaker_endpoint_name   = module.sagemaker_endpoint.endpoint_name
}

module "athena_queries" {
  source           = "./modules/athena_queries"
  project_name     = var.project_name
  environment      = var.environment
  s3_output_bucket = module.s3_golden_dataset.bucket_name
  database_name    = module.lake_formation.database_name
}

module "glue_pipeline" {
  source            = "./modules/glue_pipeline"
  project_name      = var.project_name
  environment       = var.environment
  s3_scripts_bucket = module.s3_golden_dataset.bucket_name
}

module "sagemaker_training" {
  source         = "./modules/sagemaker_training"
  project_name   = var.project_name
  environment    = var.environment
  s3_bucket_arn  = module.s3_golden_dataset.bucket_arn
  s3_bucket_name = module.s3_golden_dataset.bucket_name
}

module "mwaa_orchestration" {
  source             = "./modules/mwaa_orchestration"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  s3_bucket_arn      = module.s3_golden_dataset.bucket_arn
  s3_bucket_name     = module.s3_golden_dataset.bucket_name
  enable_mwaa        = var.enable_mwaa
}

module "cloudwatch_monitoring" {
  source           = "./modules/cloudwatch_monitoring"
  project_name     = var.project_name
  environment      = var.environment
  ecs_service_name = module.ecs_service.service_name
  ecs_cluster_name = module.ecs_service.cluster_name
}
