# AI-Assisted Development Log

Name: Yaoyi Wang
Week: Week 4 (June 18 - June 24, 2026)
Date: 2026-06-22

## 1. Task / Goal
This week I focused on making the backend safer and deployable on AWS:

- **Issue #66** - added PR security scanning with Gitleaks, CodeQL, and Trivy.
- **Issue #70** - added least-privilege Bedrock IAM for Claude Sonnet 4.6 chat.
- **Issues #42, #58, and #59** - containerized the FastAPI backend, provisioned
  ECS Fargate + ALB + ECR, added an in-VPC RDS migration path, and set explicit
  CloudWatch log retention.

## 2. AI Tools Used
Codex was used as a step-by-step engineering partner for repository exploration,
AWS/Terraform design review, implementation, local verification, and PR writing.

## 3. Prompts / Agent Workflow
I asked Codex to work in small, reviewable steps and explain each step before
changing code. For the Fargate work, we split the implementation into separate
commits: Docker image, ECR, ALB networking, ECS roles, database secret handling,
task definition, service, deployment workflow, and migration workflow.

The most useful workflow was: inspect the existing backend contract first, make
one infrastructure change, run focused checks, then let me review and commit.
This made a large deployment issue easier to understand and reduced the chance
of mixing unrelated failures.

## 4. Useful Output
- PR #72 established the DevSecOps baseline with Gitleaks, CodeQL, and Terraform
  scanning. Container image scanning was later added to the deployment workflow.
- PR #73 added scoped Claude Bedrock permissions and verified the US cross-Region
  inference profile through both the Bedrock playground and CLI.
- PR #86 adds a non-root backend Docker image, ECR repository, public ALB, ECS
  Fargate service, task/execution roles, Secrets Manager injection, and a
  two-task deployment workflow.
- The backend deployment workflow builds an `amd64` image, runs Trivy, pushes an
  immutable commit-SHA tag, deploys it to ECS, and checks `/health`.
- A manual migration workflow runs `alembic upgrade head` as a one-off Fargate
  task inside the VPC. CloudWatch logs are retained for 14 days.

## 5. Human Review / Changes
- I confirmed the runtime contract with the backend owner before containerizing:
  port `8000`, `/health`, a complete `DATABASE_URL`, stateless history, and the
  configurable `PERSONA_DIR`.
- I rejected putting the RDS password into Terraform state. ECS injects secret
  fields at runtime, and the container entrypoint assembles `DATABASE_URL` only
  in the process environment.
- The first ECS service starts at zero tasks because the bootstrap image does not
  exist until CI pushes it. The deployment workflow then registers the real task
  revision and scales the service to two tasks.
- Dependabot generated many noisy version-bump PRs, so I removed its update
  configuration while keeping Gitleaks, CodeQL, Trivy, and image scanning.
- PR #86 passed Terraform plan, Gitleaks, CodeQL, and Trivy. The real AWS rollout,
  two-task health check, cross-instance conversation, and migration execution
  still need to be verified after merge.

## 6. Reflection
The main lesson this week was that containerization is more than writing a
Dockerfile. The image, IAM roles, secrets, network path, health checks, migration
process, logging, and deployment order all form one runtime contract. Breaking
the work into small commits helped me understand how those pieces connect.

AI was most useful when it explained the reason for each AWS decision and then
verified the result with multiple tools. I still made the scope and security
decisions, especially around database credentials, public ALB access, and which
automated dependency updates were useful for this project.
