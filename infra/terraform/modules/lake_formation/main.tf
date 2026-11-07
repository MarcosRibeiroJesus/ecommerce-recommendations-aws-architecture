data "aws_caller_identity" "current" {}

resource "aws_glue_catalog_database" "ecommerce_golden_db" {
  name        = var.database_name
  description = "Glue Catalog Database for E-Commerce Golden Datasets governed by Lake Formation"

  parameters = {
    Classification = "parquet"
    Environment    = var.environment
    CostPosture    = "Minimum-Cost-PoC"
  }
}

resource "aws_lakeformation_resource" "golden_dataset" {
  arn = var.s3_bucket_arn
}

resource "aws_lakeformation_permissions" "database_permissions" {
  principal   = data.aws_caller_identity.current.arn
  permissions = ["ALL", "ALTER", "CREATE_TABLE", "DESCRIBE", "DROP"]

  database {
    name = aws_glue_catalog_database.ecommerce_golden_db.name
  }
}
