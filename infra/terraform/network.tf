# Shared sandbox network for deployed backend resources.
#
# Issue #25 needs the RDS database to be private and reachable only from the
# backend. The Fargate service is not created yet (#42), so this file creates
# the VPC, two isolated private subnets, and a backend security group that the
# future service can reuse.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  private_subnet_count = length(var.private_subnet_cidrs)
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
