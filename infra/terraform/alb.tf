# Internet-facing load balancer for the backend API (issue #42).
#
# CloudFront provides the browser-facing HTTPS/WSS endpoint because the project
# does not own a deployment domain. The ALB remains an HTTP origin and its
# security group accepts traffic only from AWS's CloudFront origin prefix list.

# The ALB must be internet-facing for CloudFront to use it as a custom origin.
# Direct public access is blocked by the CloudFront origin-facing prefix list.
#trivy:ignore:AVD-AWS-0053
resource "aws_lb" "backend" {
  name               = "empress-backend"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  drop_invalid_header_fields = true
  enable_http2               = true

  tags = {
    Name = "empress-backend"
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "empress-backend"
  port        = 8000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.app.id

  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Origin listener. Direct internet clients are blocked by the ALB security group;
# CloudFront redirects viewers to HTTPS before forwarding here.
# Origin TLS requires a custom domain and ACM certificate; viewer traffic is TLS.
#trivy:ignore:AVD-AWS-0054
resource "aws_lb_listener" "backend_http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
