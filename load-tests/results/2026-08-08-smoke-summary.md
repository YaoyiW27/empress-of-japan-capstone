# 2026-08-08 bounded load-test report

Target: `https://d1dtybjmib9ba7.cloudfront.net`

Purpose: bounded demo-readiness smoke testing, not production stress testing.

## Short conclusion

The deployed backend stayed healthy for the tested final-demo workload. The
public liveness endpoint handled a 20-user, 3-minute Locust smoke test with zero
failures and low latency. After the sandbox RDS database was started, the
Bedrock/RAG-backed chat path handled a small 5-user, 2-minute chat smoke test
with zero request failures. A follow-up 10-user chat test also completed with
zero failures across 69 chat requests. A 20-user chat test also completed with
zero failures. A short 50-user stress run exposed the current boundary: chat
started returning 502 responses and p95 latency rose sharply.

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
- A 20-user chat run completed with zero failures across 105 chat requests;
  chat p95 was about 10 seconds.
- A short 50-user stress run reached 167 chat requests with 19 failures
  (502 Bad Gateway), showing that 50 simultaneous chat users is beyond the
  current reliable demo target.
- Role/scene clicking is mostly frontend interaction. It should be fine for many
  visitors as long as it does not trigger repeated chat, voice, or retrieval
  calls. The expensive/limited path is simultaneous chat/voice, not clicking
  around the 3D experience.

For the final showcase, a reasonable operational expectation is:

- 20-30 people can open and explore the site at the same time;
- 5-20 people can chat at the same time based on the completed smoke/stress
  tests;
- 50 simultaneous chat users should be treated as a stress boundary, not a
  supported demo target, until the 502s are investigated.

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

## Follow-up 20-user chat run

This run was started from the Locust Web UI with `LOCUST_ENABLE_CHAT=true`,
target host `https://d1dtybjmib9ba7.cloudfront.net`, 20 users, and spawn rate 2.

Result captured from the Locust statistics page:

| Endpoint | Requests | Failures | Avg | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /health` | 1096 | 0 | 26 ms | 23 ms | 40 ms | 265 ms |
| `POST /chat` | 105 | 0 | 7529 ms | 8600 ms | 10000 ms | 10410 ms |

Interpretation: the 20-user chat run still showed zero request failures. Chat
latency stayed near the 5-user and 10-user runs, with p95 around 10 seconds.

## Follow-up 50-user stress run

This run was started from the Locust Web UI with `LOCUST_ENABLE_CHAT=true`,
target host `https://d1dtybjmib9ba7.cloudfront.net`, 50 users, and spawn rate 5.
It was stopped after chat failures appeared.

Result captured from the Locust API/statistics page:

| Endpoint | Requests | Failures | Avg | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /health` | 2001 | 0 | 35 ms | 23 ms | 50 ms | 1646 ms |
| `POST /chat` | 167 | 19 | 9604 ms | 9100 ms | 19000 ms | 28940 ms |

Interpretation: `/health` stayed stable, but the chat path hit the current
Bedrock/RAG/backend boundary. The failure mode was `502 Bad Gateway` from
`POST /chat`, and p95 chat latency rose to 19 seconds. This is useful stress
evidence, but it should not be claimed as supported capacity.

## Interpretation

- The public liveness path handled a 20-user, 3-minute smoke test with zero
  failures and low latency.
- The chat/RAG path handled 5-user, 10-user, and 20-user tests with zero
  failures. Chat latency is seconds-level, which is expected for the live
  Bedrock + retrieval path and should be presented as bounded demo-readiness
  evidence rather than a production capacity claim.
- The 50-user run exposed the current chat boundary: 502 failures and higher
  p95 latency.
- `/health/db` is a useful readiness check but should be separated from the
  liveness-only smoke test because the sandbox RDS instance may be intentionally
  stopped for cost control.

## Future work

- Investigate the 50-user `POST /chat` 502s before claiming higher chat
  capacity. Likely areas to inspect are Bedrock throttling/timeout behavior,
  model retry/timeout settings, RDS connection pressure, and ECS task metrics.
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
