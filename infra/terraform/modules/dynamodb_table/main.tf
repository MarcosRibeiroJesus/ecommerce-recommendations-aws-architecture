resource "aws_dynamodb_table" "user_recommendations" {
  name         = "${var.project_name}-${var.environment}-${var.table_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  ttl {
    attribute_name = "ttlTimestamp"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-user-recommendations"
    CostPosture = "Minimum-Cost-PoC"
    FreeTier    = "Eligible"
  }
}
