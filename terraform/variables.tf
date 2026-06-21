variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "siteguardian"
}

variable "cognito_callback_urls" {
  type    = list(string)
  default = ["http://localhost:3001"]
}

variable "cognito_logout_urls" {
  type    = list(string)
  default = ["http://localhost:3001"]
}

variable "alert_email" {
  type        = string
  description = "Email address for SES sender verification and alerts"
}

variable "scan_engine_image_uri" {
  type        = string
  description = "ECR image URI for the scan engine Lambda (built from lambda/scan-engine/Dockerfile)"
  default     = ""
}
