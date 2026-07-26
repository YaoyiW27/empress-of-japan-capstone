# HTTPS/WSS browser entry point for the backend API (issue #109).
#
# The team has no separate custom-domain budget, so CloudFront's default
# cloudfront.net certificate provides TLS to the two Vercel frontends. API
# responses are never cached, and all viewer headers/query strings/cookies are
# forwarded so CORS and WebSocket upgrades reach FastAPI unchanged.

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

# WAF is deferred for this bounded, credit-funded sandbox deployment. The ALB
# accepts only CloudFront origin traffic, and application rate limiting is #89.
#trivy:ignore:AVD-AWS-0011
resource "aws_cloudfront_distribution" "backend_api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "HTTPS and WebSocket entry point for the Empress backend API"
  price_class     = "PriceClass_100"
  # WebSocket upgrades only succeed over HTTP/1.1: the /voice/transcribe
  # handshake returns 101 over h1.1 but is proxied unupgraded (origin 404s)
  # over h2. Chrome/Firefox silently downgrade for WS; iOS Safari does not, so
  # it fails with "network connection was lost". Pin the distribution to h1.1
  # so every viewer's WS reaches FastAPI. Regular API calls still work here.
  http_version = "http1.1"

  origin {
    domain_name = aws_lb.backend.dns_name
    origin_id   = "empress-backend-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id         = "empress-backend-alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
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
    Name = "empress-backend-api"
  }
}

resource "aws_ssm_parameter" "backend_public_api_base_url" {
  name        = "/empress/backend/public_api_base_url"
  type        = "String"
  value       = "https://${aws_cloudfront_distribution.backend_api.domain_name}"
  description = "CloudFront HTTPS base URL used by the Vercel frontends."
}
