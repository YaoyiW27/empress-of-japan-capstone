# Private, short-lived cache for Amazon Polly narration audio (issue #96).
#
# Visitor microphone recordings are never stored here. The backend writes only
# generated Polly audio under polly-cache/ and returns short-lived presigned GET
# URLs to the frontend.

resource "aws_kms_key" "voice_cache" {
  description             = "Encrypt cached Polly narration audio"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "empress-voice-cache"
  }
}

resource "aws_kms_alias" "voice_cache" {
  name          = "alias/empress-voice-cache"
  target_key_id = aws_kms_key.voice_cache.key_id
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

resource "aws_s3_bucket_ownership_controls" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.voice_cache.arn
      sse_algorithm     = "aws:kms"
    }

    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "voice_cache" {
  bucket = aws_s3_bucket.voice_cache.id

  rule {
    id     = "expire-polly-cache"
    status = "Enabled"

    filter {
      prefix = var.voice_cache_prefix
    }

    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "voice_cache_transport" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    actions = [
      "s3:*",
    ]
    resources = [
      aws_s3_bucket.voice_cache.arn,
      "${aws_s3_bucket.voice_cache.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }

    condition {
      test     = "Bool"
      variable = "aws:PrincipalIsAWSService"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "voice_cache_transport" {
  bucket = aws_s3_bucket.voice_cache.id
  policy = data.aws_iam_policy_document.voice_cache_transport.json
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
    resources = ["${aws_s3_bucket.voice_cache.arn}/${var.voice_cache_prefix}*"]
  }

  # HeadObject on a cache miss returns 403 (not 404) unless the caller can list
  # the bucket, which the cache-check treats as a hard failure (issue #109).
  # No s3:prefix condition: HeadObject sends no prefix, so a condition would
  # keep returning 403 and defeat the fix. Bucket is a dedicated private cache.
  statement {
    sid       = "ListVoiceCache"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.voice_cache.arn]
  }

  statement {
    sid    = "UseVoiceCacheKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.voice_cache.arn]
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
