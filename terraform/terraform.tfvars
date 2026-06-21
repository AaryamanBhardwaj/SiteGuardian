aws_region    = "us-east-1"
project_name  = "siteguardian"
alert_email   = "you@example.com"

cognito_callback_urls = ["http://localhost:3001"]
cognito_logout_urls   = ["http://localhost:3001"]

# Set this after building and pushing the scan engine Docker image to ECR:
# scan_engine_image_uri = "<account-id>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest"
