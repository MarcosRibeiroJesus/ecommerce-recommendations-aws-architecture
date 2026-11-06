resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "${var.project_name}-${var.environment}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["Ecommerce/Recommendations", "DegradedModeCount", { stat = "Sum", label = "Degraded Mode Invocations" }],
            ["Ecommerce/Recommendations", "SageMakerFallbackCount", { stat = "Sum", label = "SageMaker Timeouts / Fallbacks" }],
            ["Ecommerce/Recommendations", "MemoryDbFallbackCount", { stat = "Sum", label = "MemoryDB Outages / Fallbacks" }],
            ["Ecommerce/Recommendations", "DynamoDbFallbackCount", { stat = "Sum", label = "DynamoDB Fallbacks" }]
          ]
          period = 60
          region = "us-east-1"
          title  = "Operational Resilience & Graceful Degradation (Zero 500s)"
          yAxis = {
            left = { min = 0 }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "p95", label = "P95 Latency (ms)" }],
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "p99", label = "P99 Latency (ms)" }]
          ]
          period = 60
          region = "us-east-1"
          title  = "API Latency SLA (<60ms P95 Target)"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "api_latency_alarm" {
  alarm_name          = "${var.project_name}-${var.environment}-high-p95-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0.060 # 60ms P95 target
  alarm_description   = "Alarm when P95 latency exceeds 60ms SLA target"

  tags = {
    Name = "${var.project_name}-${var.environment}-latency-alarm"
  }
}
