variable "project_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "scan_engine_image_uri" {
  type    = string
  default = ""
}

variable "projects_table_name" { type = string }
variable "projects_table_arn" { type = string }
variable "scan_results_table_name" { type = string }
variable "scan_results_table_arn" { type = string }
variable "regression_events_table_name" { type = string }
variable "regression_events_table_arn" { type = string }
variable "explanation_cache_table_name" { type = string }
variable "explanation_cache_table_arn" { type = string }
variable "rate_limit_table_name" { type = string }
variable "rate_limit_table_arn" { type = string }
variable "screenshot_bucket_name" { type = string }
variable "screenshot_bucket_arn" { type = string }
variable "cognito_user_pool_id" { type = string }
variable "cognito_issuer" { type = string }
