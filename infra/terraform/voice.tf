# Private, short-lived cache for Amazon Polly narration audio (issue #96).
#
# Visitor microphone recordings are never stored here. The backend writes only
# generated Polly audio under polly-cache/ and returns short-lived presigned GET
# URLs to the frontend.

locals {
  voice_cache_prefix = "polly-cache/"
}

resource "aws_s3_bucket" "voice_cache" {
  bucket        = "empress-voice-cache-${data.aws_caller_identity.current.account_id}-${var.region}"
  force_destroy = true

  tags = {
    Name = "empress-voice-cache"
  }
}

resource "aws_s3_bucket_public_access_block" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  rule {
    id     = "expire-polly-cache"
    status = "Enabled"

    filter {
      prefix = local.voice_cache_prefix
    }

    expiration {
      days = 30
    }
  }
}
