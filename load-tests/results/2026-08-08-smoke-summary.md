# 2026-08-08 bounded load-test report

Target: `https://d1dtybjmib9ba7.cloudfront.net`

Purpose: bounded demo-readiness smoke testing, not production stress testing.

## Short conclusion

The deployed backend stayed healthy for the tested final-demo workload. The
public liveness endpoint handled a 20-user, 3-minute Locust smoke test with zero
failures and low latency. After the sandbox RDS database was started, the
Bedrock/RAG-backed chat path handled a small 5-user, 2-minute chat smoke test
with zero request failures. A follow-up 10-user chat test also completed with
zero failures across 69 chat requests.

This supports a careful claim that the app is ready for a small capstone/demo
audience. It does not prove production-scale concurrency.

## Environment notes

- Initial `/health` check returned `{"status":"ok"}`.
- ECS backend service was steady at desired `2`, running `2`, pending `0`.
- Initial `/health/db` returned `503` with `connection timeout expired`.
- RDS instance `empress-knowledge-base` was `stopped`; it was started before the
  chat smoke test.
- After RDS reached `available`, `/health/db` returned
  `{"status":"ok","database":"reachable"}`.

## Health-only smoke

Command:

```bash
locust -f load-tests/locustfile.py \
  --host https://d1dtybjmib9ba7.cloudfront.net \
  --headless \
  --users 20 \
  --spawn-rate 2 \
  --run-time 3m \
  --csv load-tests/results/health-only-smoke
```

Result from `health-only-smoke_stats.csv`:

| Endpoint | Requests | Failures | Avg | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /health` | 1744 | 0 | 25 ms | 23 ms | 38 ms | 127 ms |

Interpretation: the public CloudFront -> backend liveness path remained stable
under 20 simulated users. This test does not touch RDS, Bedrock, Polly, or
Transcribe.

## Small chat smoke

Command:

```bash
LOCUST_ENABLE_CHAT=true locust -f load-tests/locustfile.py \
  --host https://d1dtybjmib9ba7.cloudfront.net \
  --headless \
  --users 5 \
  --spawn-rate 1 \
  --run-time 2m \
  --csv load-tests/results/chat-smoke
```

Result from `chat-smoke_stats.csv`:

| Endpoint | Requests | Failures | Avg | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /health` | 195 | 0 | 28 ms | 24 ms | 48 ms | 103 ms |
| `POST /chat` | 17 | 0 | 7611 ms | 8600 ms | 10000 ms | 10077 ms |

After the chat smoke, ECS backend service remained desired `2`, running `2`,
pending `0`; RDS remained `available`.

Interpretation: the live chat path worked under a small concurrent demo-style
load. Chat latency is seconds-level because each request goes through retrieval
and Bedrock. The observed latency is acceptable for a museum prototype/demo, but
the app should show clear loading states during chat.

## What we can honestly claim

- The static frontend and CloudFront distribution should be able to handle many
  simultaneous page views for a class/demo audience; this test focused on the
  backend API rather than CloudFront's upper limit.
- The backend liveness path was tested with 20 concurrent Locust users for 3
  minutes and had zero failures.
- The full chat/RAG path was tested with 5 concurrent Locust users for 2 minutes
  and had zero failures across 17 chat requests.
- A follow-up 10-user chat run completed with zero failures across 69 chat
  requests; chat p95 was about 9.8 seconds.
- Role/scene clicking is mostly frontend interaction. It should be fine for many
  visitors as long as it does not trigger repeated chat, voice, or retrieval
  calls. The expensive/limited path is simultaneous chat/voice, not clicking
  around the 3D experience.

For the final showcase, a reasonable operational expectation is:

- 20-30 people can open and explore the site at the same time;
- 5-10 people can chat at the same time based on the completed smoke tests;
- more simultaneous chat users may work, but should be treated as untested until
  a larger Bedrock/RDS load test is run.

## Follow-up 10-user chat run

This run was started from the Locust Web UI at `http://127.0.0.1:8089` with
`LOCUST_ENABLE_CHAT=true`, target host
`https://d1dtybjmib9ba7.cloudfront.net`, 10 users, and spawn rate 1.

Result from `chat-10users-web_stats.csv`:

| Endpoint | Requests | Failures | Avg | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /health` | 661 | 0 | 26 ms | 23 ms | 41 ms | 159 ms |
| `POST /chat` | 69 | 0 | 7400 ms | 8600 ms | 9800 ms | 10390 ms |

Interpretation: the 10-user chat run still showed zero request failures. Chat
latency stayed in the same seconds-level range as the 5-user run, with p95 under
10 seconds.

## Interpretation

- The public liveness path handled a 20-user, 3-minute smoke test with zero
  failures and low latency.
- The chat/RAG path handled a short 5-user smoke test with zero failures. Chat
  latency is seconds-level, which is expected for the live Bedrock + retrieval
  path and should be presented as a bounded demo-readiness check rather than a
  production load claim.
- `/health/db` is a useful readiness check but should be separated from the
  liveness-only smoke test because the sandbox RDS instance may be intentionally
  stopped for cost control.

## Future work

- Run a larger chat test only after confirming Bedrock quotas, RDS availability,
  and acceptable budget impact. A next step could be 20 chat users for 3-5
  minutes.
- Add frontend loading/error states around chat and voice so seconds-level AI
  latency feels intentional rather than broken.
- Add explicit rate limiting or per-session request caps before any public or
  long-running deployment.
- Add CloudWatch/Honeycomb dashboard screenshots to the test record so the load
  result is tied to runtime telemetry, not only Locust output.
- Test voice separately with a small number of users because Polly/Transcribe
  have different latency, quota, and cost behavior from chat.
- Keep a final demo video and screenshots because the live AWS sandbox may stop
  working after the lab closes.
