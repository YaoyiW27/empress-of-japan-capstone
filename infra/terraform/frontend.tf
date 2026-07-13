# Static frontend hosting on S3 + CloudFront (replaces Vercel).
#
# The Next.js app is a pure client (frontend/next.config.ts `output: "export"`),
# so `next build` emits a static `out/` that deploy-frontend.yml syncs to a
# private S3 bucket. CloudFront serves it over HTTPS with the default
# cloudfront.net certificate (no custom-domain budget, same as the backend API
# distribution in cloudfront.tf). Origin access is locked down with an Origin
# Access Control so the bucket stays private.
#
# One distribution per entry in var.frontend_sites (default: a single "main"
# production site). Add another entry to restore a second deployment.

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# Lets CloudFront read the private bucket with SigV4; the bucket policy below
# scopes access to each distribution's ARN so nothing else can reach the objects.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "empress-frontend"
  description                       = "OAC for the static frontend S3 origins"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# `next build` with `trailingSlash: true` writes directory-style pages
# (out/explore/index.html). This viewer-request function maps request URIs to
# those objects so clean deep links (/explore/, /explore/captain_sinclair) resolve
# without a trailing-slash redirect. Hashed asset requests (which contain a dot)
# pass through untouched.
resource "aws_cloudfront_function" "frontend_rewrite" {
  name    = "empress-frontend-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Append index.html for directory-style static-export routes"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!uri.includes('.')) {
        request.uri += '/index.html';
      }
      return request;
    }
  EOT
}

resource "aws_s3_bucket" "frontend" {
  for_each = var.frontend_sites

  bucket        = "empress-frontend-${each.key}-${data.aws_caller_identity.current.account_id}-${var.region}"
  force_destroy = true

  tags = {
    Name = "empress-frontend-${each.key}"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  for_each = aws_s3_bucket.frontend

  bucket = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  for_each = aws_s3_bucket.frontend

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  for_each = aws_s3_bucket.frontend

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      # Public web assets carry no sensitive data; SSE-S3 keeps CloudFront reads
      # key-management-free (no KMS grant needed for the OAC principal).
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

data "aws_iam_policy_document" "frontend" {
  for_each = var.frontend_sites

  # Only this site's CloudFront distribution (via OAC) may read the objects.
  statement {
    sid     = "AllowCloudFrontRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.frontend[each.key].arn}/*",
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend[each.key].arn]
    }
  }

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    actions = [
      "s3:*",
    ]
    resources = [
      aws_s3_bucket.frontend[each.key].arn,
      "${aws_s3_bucket.frontend[each.key].arn}/*",
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
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  for_each = var.frontend_sites

  bucket = aws_s3_bucket.frontend[each.key].id
  policy = data.aws_iam_policy_document.frontend[each.key].json
}

# WAF is deferred for this bounded, credit-funded sandbox deployment (same
# rationale as the backend distribution; application rate limiting is #89).
#trivy:ignore:AVD-AWS-0011
resource "aws_cloudfront_distribution" "frontend" {
  for_each = var.frontend_sites

  enabled             = true
  is_ipv6_enabled     = true
  comment             = each.value.comment
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend[each.key].bucket_regional_domain_name
    origin_id                = "frontend-s3-${each.key}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3-${each.key}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.frontend_rewrite.arn
    }
  }

  # Missing objects (unknown routes, or S3 403 on a private key) render the
  # exported 404 page instead of raw S3 XML.
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Name = "empress-frontend-${each.key}"
  }
}

# Consumed by deploy-frontend.yml: it reads this map to know which bucket to sync
# and which distribution to invalidate for every configured site.
resource "aws_ssm_parameter" "frontend_sites" {
  name = "/empress/frontend/sites"
  type = "String"
  value = jsonencode({
    for k, dist in aws_cloudfront_distribution.frontend : k => {
      bucket          = aws_s3_bucket.frontend[k].bucket
      distribution_id = dist.id
      url             = "https://${dist.domain_name}"
    }
  })
  description = "Frontend site map (bucket, CloudFront distribution id, url) consumed by the deploy-frontend workflow."
}
