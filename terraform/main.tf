module "dynamodb" {
  source       = "./modules/dynamodb"
  project_name = var.project_name
}

module "s3" {
  source       = "./modules/s3"
  project_name = var.project_name
}

module "cognito" {
  source        = "./modules/cognito"
  project_name  = var.project_name
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
}

module "lambda" {
  source       = "./modules/lambda"
  project_name = var.project_name
  aws_region   = var.aws_region

  scan_engine_image_uri = var.scan_engine_image_uri

  projects_table_name           = module.dynamodb.projects_table_name
  projects_table_arn            = module.dynamodb.projects_table_arn
  scan_results_table_name       = module.dynamodb.scan_results_table_name
  scan_results_table_arn        = module.dynamodb.scan_results_table_arn
  regression_events_table_name  = module.dynamodb.regression_events_table_name
  regression_events_table_arn   = module.dynamodb.regression_events_table_arn
  explanation_cache_table_name  = module.dynamodb.explanation_cache_table_name
  explanation_cache_table_arn   = module.dynamodb.explanation_cache_table_arn
  rate_limit_table_name         = module.dynamodb.rate_limit_table_name
  rate_limit_table_arn          = module.dynamodb.rate_limit_table_arn

  screenshot_bucket_name = module.s3.screenshot_bucket_name
  screenshot_bucket_arn  = module.s3.screenshot_bucket_arn

  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_issuer       = module.cognito.issuer
}

module "eventbridge" {
  source       = "./modules/eventbridge"
  project_name = var.project_name

  scheduler_lambda_arn = module.lambda.scheduler_lambda_arn
}

module "ses" {
  source      = "./modules/ses"
  alert_email = var.alert_email
}
