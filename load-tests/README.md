# Load tests

Bounded Locust scenarios for final-demo readiness. These tests are meant to
show that the deployed stack stays healthy under a small museum-demo style load;
they are not a production stress test.

## Setup

From the repository root:

```bash
python3 -m venv .venv-load
source .venv-load/bin/activate
pip install -r load-tests/requirements.txt
```

Get the deployed backend URL:

```bash
PUBLIC_API_BASE_URL=$(AWS_PROFILE=empress terraform -chdir=infra/terraform output -raw backend_public_api_base_url)
curl --fail --show-error "$PUBLIC_API_BASE_URL/health"
```

## Safe smoke test

This hits `/health` only. It does not call Bedrock, Polly, Transcribe, or the
database readiness path.

```bash
mkdir -p load-tests/results
locust -f load-tests/locustfile.py \
  --host "$PUBLIC_API_BASE_URL" \
  --headless \
  --users 20 \
  --spawn-rate 2 \
  --run-time 3m \
  --csv load-tests/results/health-smoke
```

Suggested acceptance notes:

- no request failures;
- `/health` status is consistently 200;
- CloudWatch shows no target 5xx or unhealthy-target alarm;
- ECS desired/running task counts stay stable or autoscale as expected.

Check DB readiness separately before any chat/RAG test:

```bash
curl --fail --show-error "$PUBLIC_API_BASE_URL/health/db"
```

If this returns 503, do not run the chat scenario yet; investigate RDS, network,
credentials, migrations, or task environment first.

## Small chat test

This calls the live `/chat` endpoint and therefore can spend Bedrock/RDS budget.
Keep it short and watch CloudWatch/Honeycomb while it runs.

```bash
mkdir -p load-tests/results
LOCUST_ENABLE_CHAT=true locust -f load-tests/locustfile.py \
  --host "$PUBLIC_API_BASE_URL" \
  --headless \
  --users 5 \
  --spawn-rate 1 \
  --run-time 2m \
  --csv load-tests/results/chat-smoke
```

Optional knobs:

| Variable | Default | Meaning |
|---|---:|---|
| `LOCUST_ENABLE_CHAT` | `false` | Enable live `/chat` requests. |
| `LOCUST_ENABLE_RETRIEVE` | `false` | Enable direct `/retrieve` requests. |
| `LOCUST_ENABLE_VOICE` | `false` | Enable `/voice/synthesize` requests. |
| `LOCUST_CHAT_WEIGHT` | `1` | Chat task weight when enabled. |
| `LOCUST_HEALTH_WEIGHT` | `10` | `/health` task weight. |
| `LOCUST_DB_HEALTH_WEIGHT` | `0` | `/health/db` task weight. Keep disabled for liveness-only tests. |
| `LOCUST_RETRIEVE_WEIGHT` | `1` | `/retrieve` task weight when enabled. |
| `LOCUST_VOICE_WEIGHT` | `1` | `/voice/synthesize` task weight when enabled. |

## What to capture

For handoff evidence, save the Locust CSV files and record:

- users, spawn rate, run time, and enabled task flags;
- request count, failure count, average latency, and p95 latency;
- CloudWatch alarm state during the run;
- ECS desired/running/pending task counts;
- Honeycomb trace examples for `/chat` if chat was enabled;
- Cost Explorer / budget check after any AI-enabled run.

Useful ECS check:

```bash
AWS_PROFILE=empress aws ecs describe-services \
  --region us-west-2 \
  --cluster empress-app \
  --services empress-backend \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'
```
