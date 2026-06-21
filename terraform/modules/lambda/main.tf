data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  all_table_arns = [
    var.projects_table_arn,
    var.scan_results_table_arn,
    var.regression_events_table_arn,
    var.explanation_cache_table_arn,
    var.rate_limit_table_arn,
  ]
  all_table_index_arns = [for arn in local.all_table_arns : "${arn}/index/*"]
}

# ─── IAM Role: API Lambda ─────────────────────────────────────────────

resource "aws_iam_role" "api_lambda" {
  name = "${var.project_name}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "${var.project_name}-api-lambda-policy"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query",
        ]
        Resource = concat(local.all_table_arns, local.all_table_index_arns)
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${var.screenshot_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/siteguardian/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = "*"
      },
    ]
  })
}

# ─── IAM Role: Scan Engine Lambda ──────────────────────────────────────

resource "aws_iam_role" "scan_engine_lambda" {
  name = "${var.project_name}-scan-engine-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scan_engine_lambda" {
  name = "${var.project_name}-scan-engine-policy"
  role = aws_iam_role.scan_engine_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
    }]
  })
}

# ─── IAM Role: Scheduler Lambda ───────────────────────────────────────

resource "aws_iam_role" "scheduler_lambda" {
  name = "${var.project_name}-scheduler-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_lambda" {
  name = "${var.project_name}-scheduler-policy"
  role = aws_iam_role.scheduler_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
          "dynamodb:Query",
        ]
        Resource = concat(local.all_table_arns, local.all_table_index_arns)
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${var.screenshot_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/siteguardian/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = "*"
      },
    ]
  })
}

# ─── API Lambda (zip deploy) ──────────────────────────────────────────

data "archive_file" "api_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/api"
  output_path = "${path.module}/.build/api.zip"
  excludes    = ["node_modules/.cache", ".build"]
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.api_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.api_lambda.output_path
  source_code_hash = data.archive_file.api_lambda.output_base64sha256

  environment {
    variables = {
      PROJECTS_TABLE           = var.projects_table_name
      SCAN_RESULTS_TABLE       = var.scan_results_table_name
      REGRESSION_EVENTS_TABLE  = var.regression_events_table_name
      EXPLANATION_CACHE_TABLE  = var.explanation_cache_table_name
      RATE_LIMIT_TABLE         = var.rate_limit_table_name
      SCREENSHOT_BUCKET        = var.screenshot_bucket_name
      COGNITO_ISSUER           = var.cognito_issuer
      SCAN_ENGINE_URL          = aws_lambda_function_url.scan_engine.function_url
      GEMINI_SSM_KEY           = "/siteguardian/gemini-api-key"
    }
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }
}

# ─── Scan Engine Lambda (container image) ──────────────────────────────

resource "aws_lambda_function" "scan_engine" {
  function_name = "${var.project_name}-scan-engine"
  role          = aws_iam_role.scan_engine_lambda.arn
  package_type  = "Image"
  image_uri     = var.scan_engine_image_uri != "" ? var.scan_engine_image_uri : "placeholder:latest"
  timeout       = 120
  memory_size   = 2048

  environment {
    variables = {
      CHROMIUM_PATH = "/usr/bin/chromium-browser"
    }
  }

  lifecycle {
    ignore_changes = [image_uri]
  }
}

resource "aws_lambda_function_url" "scan_engine" {
  function_name      = aws_lambda_function.scan_engine.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 86400
  }
}

# ─── Scheduler Lambda (zip deploy) ────────────────────────────────────

data "archive_file" "scheduler_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/scheduler"
  output_path = "${path.module}/.build/scheduler.zip"
  excludes    = ["node_modules/.cache", ".build", "seed-demo-data.mjs"]
}

resource "aws_lambda_function" "scheduler" {
  function_name    = "${var.project_name}-scheduler"
  role             = aws_iam_role.scheduler_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 120
  memory_size      = 512
  filename         = data.archive_file.scheduler_lambda.output_path
  source_code_hash = data.archive_file.scheduler_lambda.output_base64sha256

  environment {
    variables = {
      PROJECTS_TABLE           = var.projects_table_name
      SCAN_RESULTS_TABLE       = var.scan_results_table_name
      REGRESSION_EVENTS_TABLE  = var.regression_events_table_name
      EXPLANATION_CACHE_TABLE  = var.explanation_cache_table_name
      RATE_LIMIT_TABLE         = var.rate_limit_table_name
      SCREENSHOT_BUCKET        = var.screenshot_bucket_name
      SCAN_ENGINE_URL          = aws_lambda_function_url.scan_engine.function_url
      GEMINI_SSM_KEY           = "/siteguardian/gemini-api-key"
    }
  }
}

# ─── Outputs ──────────────────────────────────────────────────────────

output "api_function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "scan_engine_function_url" {
  value = aws_lambda_function_url.scan_engine.function_url
}

output "scheduler_lambda_arn" {
  value = aws_lambda_function.scheduler.arn
}
