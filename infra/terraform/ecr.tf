# Private container registry for the backend API image (issue #42).
#
# GitHub Actions will build, scan, and push immutable commit-SHA tags here.
# Fargate pulls the selected image through the ECS task execution role.

resource "aws_ecr_repository" "backend" {
  name                 = "empress-backend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep the sandbox registry small. Commit-SHA tags are immutable, so old images
# are safe to expire after enough recent deploys remain available for rollback.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the 20 most recent backend images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
