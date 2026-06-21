variable "project_name" {
  type = string
}

variable "scheduler_lambda_arn" {
  type = string
}

resource "aws_iam_role" "scheduler" {
  name = "${var.project_name}-eventbridge-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "${var.project_name}-scheduler-invoke"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = var.scheduler_lambda_arn
    }]
  })
}

output "scheduler_role_arn" {
  value = aws_iam_role.scheduler.arn
}
