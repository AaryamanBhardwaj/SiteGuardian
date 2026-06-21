variable "project_name" {
  type = string
}

resource "aws_s3_bucket" "screenshots" {
  bucket = "${var.project_name}-screenshots"
}

resource "aws_s3_bucket_lifecycle_configuration" "screenshots" {
  bucket = aws_s3_bucket.screenshots.id

  rule {
    id     = "expire-old-screenshots"
    status = "Enabled"

    expiration {
      days = 90
    }

    filter {
      prefix = "screenshots/"
    }
  }

  rule {
    id     = "expire-old-diffs"
    status = "Enabled"

    expiration {
      days = 90
    }

    filter {
      prefix = "diffs/"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "screenshots" {
  bucket = aws_s3_bucket.screenshots.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "screenshot_bucket_name" {
  value = aws_s3_bucket.screenshots.bucket
}

output "screenshot_bucket_arn" {
  value = aws_s3_bucket.screenshots.arn
}
