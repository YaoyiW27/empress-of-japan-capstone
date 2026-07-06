# Shared sandbox network for deployed backend resources.
#
# RDS stays in isolated private subnets. Issue #42 adds public subnets for the
# internet-facing ALB and first sandbox Fargate deployment. Tasks receive public
# IPs for outbound AWS/API access, avoiding the fixed cost of a NAT gateway, but
# their security group accepts inbound traffic only from the ALB.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  private_subnet_count = length(var.private_subnet_cidrs)
  public_subnet_count  = length(var.public_subnet_cidrs)
}

resource "aws_vpc" "app" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "empress-app-vpc"
  }
}

resource "aws_subnet" "private" {
  count = local.private_subnet_count

  vpc_id            = aws_vpc.app.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "empress-private-${count.index + 1}"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.app.id

  tags = {
    Name = "empress-private"
  }
}

resource "aws_route_table_association" "private" {
  count = local.private_subnet_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id

  tags = {
    Name = "empress-app"
  }
}

resource "aws_subnet" "public" {
  count = local.public_subnet_count

  vpc_id            = aws_vpc.app.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "empress-public-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.app.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.app.id
  }

  tags = {
    Name = "empress-public"
  }
}

resource "aws_route_table_association" "public" {
  count = local.public_subnet_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "backend" {
  name        = "empress-backend"
  description = "Security group for deployed backend tasks that need private RDS access."
  vpc_id      = aws_vpc.app.id

  tags = {
    Name = "empress-backend"
  }
}

resource "aws_vpc_security_group_egress_rule" "backend_all" {
  security_group_id = aws_security_group.backend.id
  description       = "Allow backend tasks to call AWS services and outbound APIs."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "alb" {
  name        = "empress-backend-alb"
  description = "Public HTTP entry point for the backend ALB."
  vpc_id      = aws_vpc.app.id

  tags = {
    Name = "empress-backend-alb"
  }
}

data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTP origin traffic only from CloudFront edge locations."
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
}

resource "aws_vpc_security_group_egress_rule" "alb_to_backend" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.backend.id
  description                  = "Forward ALB traffic to backend tasks."
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "backend_from_alb" {
  security_group_id            = aws_security_group.backend.id
  referenced_security_group_id = aws_security_group.alb.id
  description                  = "Backend API traffic from the ALB only."
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
}
