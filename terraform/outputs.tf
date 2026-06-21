output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_domain" {
  value = module.cognito.domain
}

output "api_lambda_url" {
  value = module.lambda.api_function_url
}

output "scan_engine_lambda_url" {
  value = module.lambda.scan_engine_function_url
}

output "screenshot_bucket" {
  value = module.s3.screenshot_bucket_name
}
