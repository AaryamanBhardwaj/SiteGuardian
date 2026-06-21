variable "project_name" {
  type = string
}

resource "aws_dynamodb_table" "projects" {
  name         = "${title(var.project_name)}-Projects"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "projectId"

  attribute {
    name = "projectId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "scan_results" {
  name         = "${title(var.project_name)}-ScanResults"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "projectId"
  range_key    = "scanTimestamp"

  attribute {
    name = "projectId"
    type = "S"
  }

  attribute {
    name = "scanTimestamp"
    type = "S"
  }
}

resource "aws_dynamodb_table" "regression_events" {
  name         = "${title(var.project_name)}-RegressionEvents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "projectId"
  range_key    = "eventTimestamp"

  attribute {
    name = "projectId"
    type = "S"
  }

  attribute {
    name = "eventTimestamp"
    type = "S"
  }
}

resource "aws_dynamodb_table" "explanation_cache" {
  name         = "${title(var.project_name)}-ExplanationCache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "signatureHash"

  attribute {
    name = "signatureHash"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "rate_limit_counters" {
  name         = "${title(var.project_name)}-RateLimitCounters"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "dateKey"

  attribute {
    name = "dateKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

output "projects_table_name" {
  value = aws_dynamodb_table.projects.name
}
output "projects_table_arn" {
  value = aws_dynamodb_table.projects.arn
}
output "scan_results_table_name" {
  value = aws_dynamodb_table.scan_results.name
}
output "scan_results_table_arn" {
  value = aws_dynamodb_table.scan_results.arn
}
output "regression_events_table_name" {
  value = aws_dynamodb_table.regression_events.name
}
output "regression_events_table_arn" {
  value = aws_dynamodb_table.regression_events.arn
}
output "explanation_cache_table_name" {
  value = aws_dynamodb_table.explanation_cache.name
}
output "explanation_cache_table_arn" {
  value = aws_dynamodb_table.explanation_cache.arn
}
output "rate_limit_table_name" {
  value = aws_dynamodb_table.rate_limit_counters.name
}
output "rate_limit_table_arn" {
  value = aws_dynamodb_table.rate_limit_counters.arn
}
