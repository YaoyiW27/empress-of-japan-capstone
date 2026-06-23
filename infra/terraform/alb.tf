# Internet-facing load balancer for the backend API (issue #42).
#
# The first sandbox endpoint uses HTTP because the project does not yet own a
# deployment domain/certificate. Add an ACM certificate + HTTPS listener before
# treating this endpoint as production-like or sending sensitive visitor data.

# Public exposure is intentional: this is the visitor API entry point. Inbound
# access still terminates at the ALB security group; tasks accept only ALB traffic.
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

# Temporary sandbox listener while the project has no deployment domain or ACM
# certificate. Do not send donor/sensitive data; replace with HTTPS before a
# production-like pilot.
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
