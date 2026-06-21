variable "alert_email" {
  type = string
}

resource "aws_ses_email_identity" "alert" {
  email = var.alert_email
}

output "ses_identity_arn" {
  value = aws_ses_email_identity.alert.arn
}
