# ECS runtime foundation for the backend API (issue #42).
#
# This file defines the cluster and IAM/logging primitives. The task definition
# and service are added separately once the image and secret contract are wired.

resource "aws_ecs_cluster" "app" {
  name = "empress-app"

  tags = {
    Name = "empress-app"
  }
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by the ECS agent before the application starts: pull the ECR image,
# create the awslogs stream, and resolve database secrets for injection.
resource "aws_iam_role" "backend_execution" {
  name               = "empress-backend-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "backend_execution_managed" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "backend_execution_rds_secrets" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = aws_iam_policy.knowledge_base_secret_read.arn
}

resource "aws_iam_role_policy" "backend_execution_honeycomb_secret_read" {
  count = var.honeycomb_api_key_secret_arn == null ? 0 : 1

  name = "empress-backend-honeycomb-secret-read"
  role = aws_iam_role.backend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadHoneycombApiKey"
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
        ]
        Resource = var.honeycomb_api_key_secret_arn
      }
    ]
  })
}

# Credentials exposed to the FastAPI process itself. Keep application actions
# here and execution-time infrastructure actions on backend_execution above.
resource "aws_iam_role" "backend_task" {
  name               = "empress-backend-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "backend_task_titan" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.bedrock_titan_embed_invoke.arn
}

resource "aws_iam_role_policy_attachment" "backend_task_claude" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.bedrock_claude_chat_invoke.arn
}

resource "aws_iam_role_policy_attachment" "backend_task_sqs_send" {
  role       = aws_iam_role.backend_task.name
  policy_arn = aws_iam_policy.sqs_jobs_send.arn
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/empress-backend"
  retention_in_days = var.backend_log_retention_days

  tags = {
    Name = "empress-backend"
  }
}

locals {
  otel_collector_config = yamlencode({
    receivers = {
      otlp = {
        protocols = {
          grpc = {
            endpoint = "0.0.0.0:4317"
          }
          http = {
            endpoint = "0.0.0.0:4318"
          }
        }
      }
    }

    processors = {
      memory_limiter = {
        check_interval         = "1s"
        limit_percentage       = 75
        spike_limit_percentage = 20
      }
      batch = {
        timeout             = "5s"
        send_batch_size     = 512
        send_batch_max_size = 1024
      }
      resource = {
        attributes = [
          {
            action = "upsert"
            key    = "deployment.environment"
            value  = "sandbox"
          },
        ]
      }
    }

    exporters = {
      otlphttp = {
        endpoint = "https://api.honeycomb.io"
        headers = {
          "x-honeycomb-team"    = "$${env:HONEYCOMB_API_KEY}"
          "x-honeycomb-dataset" = var.backend_honeycomb_dataset
        }
      }
      debug = {
        verbosity = "basic"
      }
    }

    service = {
      pipelines = {
        traces = {
          receivers  = ["otlp"]
          processors = ["memory_limiter", "resource", "batch"]
          exporters  = var.honeycomb_api_key_secret_arn == null ? ["debug"] : ["otlphttp"]
        }
      }
    }
  })
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "empress-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.backend_task_cpu)
  memory                   = tostring(var.backend_task_memory)
  execution_role_arn       = aws_iam_role.backend_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_bootstrap_image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
          name          = "http"
          appProtocol   = "http"
        }
      ]

      environment = [
        { name = "APP_ENV", value = "sandbox" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "AWS_REGION", value = var.region },
        { name = "CHAT_MODEL", value = "bedrock" },
        { name = "BEDROCK_CHAT_MODEL", value = var.bedrock_chat_inference_profile_id },
        { name = "EMBEDDER", value = "bedrock" },
        { name = "BEDROCK_EMBEDDING_MODEL", value = var.bedrock_embedding_model_id },
        { name = "ENABLE_SESSION_MEMORY", value = "false" },
        { name = "PERSONA_DIR", value = "/app/data/ai/personas" },
        { name = "OTEL_ENABLED", value = tostring(var.backend_otel_enabled) },
        { name = "OTEL_SERVICE_NAME", value = var.backend_otel_service_name },
        { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = var.backend_otel_exporter_otlp_endpoint },
        { name = "HONEYCOMB_DATASET", value = var.backend_honeycomb_dataset },
      ]

      secrets = [
        {
          name      = "DB_HOST"
          valueFrom = "${aws_secretsmanager_secret.knowledge_base_connection.arn}:host::"
        },
        {
          name      = "DB_PORT"
          valueFrom = "${aws_secretsmanager_secret.knowledge_base_connection.arn}:port::"
        },
        {
          name      = "DB_NAME"
          valueFrom = "${aws_secretsmanager_secret.knowledge_base_connection.arn}:dbname::"
        },
        {
          name      = "DB_USER"
          valueFrom = "${aws_db_instance.knowledge_base.master_user_secret[0].secret_arn}:username::"
        },
        {
          name      = "DB_PASSWORD"
          valueFrom = "${aws_db_instance.knowledge_base.master_user_secret[0].secret_arn}:password::"
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
    {
      name      = "otel-collector"
      image     = var.otel_collector_image
      essential = var.backend_otel_enabled
      command   = ["--config=env:OTEL_COLLECTOR_CONFIG"]

      environment = [
        { name = "OTEL_COLLECTOR_CONFIG", value = local.otel_collector_config },
      ]

      secrets = var.honeycomb_api_key_secret_arn == null ? [] : [
        {
          name      = "HONEYCOMB_API_KEY"
          valueFrom = "${var.honeycomb_api_key_secret_arn}:api_key::"
        }
      ]

      portMappings = [
        {
          containerPort = 4317
          hostPort      = 4317
          protocol      = "tcp"
          name          = "otlp-grpc"
          appProtocol   = "grpc"
        },
        {
          containerPort = 4318
          hostPort      = 4318
          protocol      = "tcp"
          name          = "otlp-http"
          appProtocol   = "http"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "otel"
        }
      }
    }
  ])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  tags = {
    Name = "empress-backend"
  }

  depends_on = [
    aws_iam_role_policy_attachment.backend_execution_managed,
    aws_iam_role_policy_attachment.backend_execution_rds_secrets,
    aws_iam_role_policy.backend_execution_honeycomb_secret_read,
  ]
}

# Terraform creates the service at zero tasks because the immutable bootstrap
# image does not exist until the deployment workflow builds and pushes it. CI
# then registers the real commit-SHA task revision and scales the service to 2.
resource "aws_ecs_service" "backend" {
  name            = "empress-backend"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_initial_desired_count
  launch_type     = "FARGATE"

  platform_version = "LATEST"

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  lifecycle {
    # Application releases own the active revision and steady-state task count.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.backend_http]

  tags = {
    Name = "empress-backend"
  }
}

resource "aws_appautoscaling_target" "backend" {
  max_capacity       = var.backend_autoscaling_max_capacity
  min_capacity       = var.backend_autoscaling_min_capacity
  resource_id        = "service/${aws_ecs_cluster.app.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "empress-backend-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.backend_autoscaling_cpu_target_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
