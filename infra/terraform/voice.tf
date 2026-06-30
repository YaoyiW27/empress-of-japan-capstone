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

# Polly synthesis and Transcribe streaming do not expose resource-level ARNs,
# so those two actions require Resource="*". S3 access remains scoped to the
# generated-audio prefix in this one private cache bucket.
data "aws_iam_policy_document" "backend_voice_runtime" {
  statement {
    sid    = "UseVoiceServices"
    effect = "Allow"
    actions = [
      "polly:SynthesizeSpeech",
      "transcribe:StartStreamTranscription",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  statement {
    sid    = "ReadWritePollyCache"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.voice_cache.arn}/${local.voice_cache_prefix}*"]
  }
}

resource "aws_iam_policy" "backend_voice_runtime" {
  name        = "empress-backend-voice-runtime"
  description = "Allow the backend to use Transcribe/Polly and cache generated narration audio."
  policy      = data.aws_iam_policy_document.backend_voice_runtime.json
}

resource "aws_iam_role_policy_attachment" "backend_task_voice_runtime" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.backend_voice_runtime.arn
}
