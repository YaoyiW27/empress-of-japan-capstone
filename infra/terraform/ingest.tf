# Private operator-managed inputs for the full knowledge-base ingest (issue #136).
# Terraform creates the bucket and least-privilege read policy, but deliberately
# does not put source data into Terraform state. Operators upload the approved
# CSV and classified workbook out of band using the documented exact keys.

resource "aws_s3_bucket" "ingest_sources" {
  bucket = "empress-ingest-sources-${data.aws_caller_identity.current.account_id}-${var.region}"

  tags = {
    Name = "empress-ingest-sources"
  }
}

resource "aws_s3_bucket_public_access_block" "ingest_sources" {
  bucket = aws_s3_bucket.ingest_sources.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ingest_sources" {
  bucket = aws_s3_bucket.ingest_sources.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ingest_sources" {
  bucket = aws_s3_bucket.ingest_sources.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "ingest_sources" {
  bucket = aws_s3_bucket.ingest_sources.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "ingest_sources_transport" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.ingest_sources.arn,
      "${aws_s3_bucket.ingest_sources.arn}/*",
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

resource "aws_s3_bucket_policy" "ingest_sources_transport" {
  bucket = aws_s3_bucket.ingest_sources.id
  policy = data.aws_iam_policy_document.ingest_sources_transport.json
}

data "aws_iam_policy_document" "worker_ingest_sources_read" {
  statement {
    sid     = "ReadApprovedIngestObjects"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.ingest_sources.arn}/${var.ingest_vmm_csv_key}",
      "${aws_s3_bucket.ingest_sources.arn}/${var.ingest_classified_workbook_key}",
    ]
  }
}

resource "aws_iam_policy" "worker_ingest_sources_read" {
  name        = "empress-worker-ingest-sources-read"
  description = "Allow the ingest worker to read only the approved VMM inputs."
  policy      = data.aws_iam_policy_document.worker_ingest_sources_read.json
}
