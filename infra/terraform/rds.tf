# Shared knowledge-base database for deployed backend environments (issue #25).
#
# Local development stays on Docker. This RDS instance is private, single-AZ,
# and intentionally small for the AWS sandbox. The master password is generated
# by RDS and stored in Secrets Manager, so Terraform code never contains a DB
# password and no committed file contains credentials.

locals {
  kb_db_identifier = "empress-knowledge-base"
}

resource "aws_db_subnet_group" "knowledge_base" {
  name        = "empress-knowledge-base"
  description = "Private subnets for the Empress knowledge-base RDS instance."
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "empress-knowledge-base"
  }
}

resource "aws_security_group" "knowledge_base_db" {
  name        = "empress-knowledge-base-db"
  description = "Allow PostgreSQL only from backend tasks."
  vpc_id      = aws_vpc.app.id

  tags = {
    Name = "empress-knowledge-base-db"
  }
}

resource "aws_vpc_security_group_ingress_rule" "knowledge_base_db_from_backend" {
  security_group_id            = aws_security_group.knowledge_base_db.id
  referenced_security_group_id = aws_security_group.backend.id
  description                  = "PostgreSQL from backend tasks only."
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "knowledge_base" {
  identifier = local.kb_db_identifier

  engine         = "postgres"
  engine_version = var.kb_db_engine_version
  instance_class = var.kb_db_instance_class

  db_name  = var.kb_db_name
  username = var.kb_db_username

  manage_master_user_password = true

  allocated_storage     = var.kb_db_allocated_storage_gb
  max_allocated_storage = var.kb_db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.knowledge_base.name
  vpc_security_group_ids = [aws_security_group.knowledge_base_db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period   = 7
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "empress-knowledge-base-final"

  auto_minor_version_upgrade      = true
  apply_immediately               = false
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "empress-knowledge-base"
    CostControl = "nightly-stop"
  }
}

resource "aws_secretsmanager_secret" "knowledge_base_connection" {
  name        = "/empress/rds/knowledge_base_connection"
  description = "Non-password RDS connection metadata. Password lives in the RDS-managed master secret."
}

resource "aws_secretsmanager_secret_version" "knowledge_base_connection" {
  secret_id = aws_secretsmanager_secret.knowledge_base_connection.id

  secret_string = jsonencode({
    engine                         = "postgres"
    host                           = aws_db_instance.knowledge_base.address
    port                           = aws_db_instance.knowledge_base.port
    dbname                         = var.kb_db_name
    username                       = var.kb_db_username
    master_user_secret_arn         = aws_db_instance.knowledge_base.master_user_secret[0].secret_arn
    connection_string_template     = "postgresql://${var.kb_db_username}:<password>@${aws_db_instance.knowledge_base.address}:${aws_db_instance.knowledge_base.port}/${var.kb_db_name}"
    sqlalchemy_connection_template = "postgresql+psycopg://${var.kb_db_username}:<password>@${aws_db_instance.knowledge_base.address}:${aws_db_instance.knowledge_base.port}/${var.kb_db_name}"
  })
}

data "aws_iam_policy_document" "knowledge_base_secret_read" {
  statement {
    sid    = "ReadKnowledgeBaseConnectionSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.knowledge_base_connection.arn,
      aws_db_instance.knowledge_base.master_user_secret[0].secret_arn,
    ]
  }
}

resource "aws_iam_policy" "knowledge_base_secret_read" {
  name        = "empress-rds-knowledge-base-secret-read"
  description = "Allow backend tasks to read RDS connection metadata and the RDS-managed master secret (issue #25)."
  policy      = data.aws_iam_policy_document.knowledge_base_secret_read.json
}

data "aws_iam_policy_document" "rds_stop_scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_stop_scheduler" {
  name               = "empress-rds-stop-scheduler"
  assume_role_policy = data.aws_iam_policy_document.rds_stop_scheduler_assume.json
}

data "aws_iam_policy_document" "rds_stop_scheduler" {
  statement {
    sid       = "StopKnowledgeBaseDb"
    effect    = "Allow"
    actions   = ["rds:StopDBInstance"]
    resources = [aws_db_instance.knowledge_base.arn]
  }
}

resource "aws_iam_role_policy" "rds_stop_scheduler" {
  name   = "empress-rds-stop-scheduler"
  role   = aws_iam_role.rds_stop_scheduler.id
  policy = data.aws_iam_policy_document.rds_stop_scheduler.json
}

resource "aws_scheduler_schedule" "knowledge_base_stop" {
  name                         = "empress-knowledge-base-stop"
  description                  = "Stops the sandbox RDS instance on a weekday evening schedule to limit idle spend."
  schedule_expression          = var.kb_db_stop_schedule
  schedule_expression_timezone = var.kb_db_stop_schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
    role_arn = aws_iam_role.rds_stop_scheduler.arn

    input = jsonencode({
      DbInstanceIdentifier = aws_db_instance.knowledge_base.identifier
    })
  }
}
