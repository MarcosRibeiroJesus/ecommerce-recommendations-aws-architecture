output "database_name" {
  value = aws_glue_catalog_database.ecommerce_golden_db.name
}

output "database_arn" {
  value = aws_glue_catalog_database.ecommerce_golden_db.arn
}
