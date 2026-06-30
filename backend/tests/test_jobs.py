"""Unit tests for async ingest job plumbing (no AWS required)."""

from fastapi.testclient import TestClient
from opentelemetry import context, trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState

from app.config import Settings
from app.ingest.pipeline import IngestStats
from app.jobs import IngestJob, SqsJobQueue
from app.jobs.payloads import JobEnvelope
from app.jobs.sqs import ReceivedJob
from app.main import create_app
from app.tracing.sqs import inject_trace_context


def test_ingest_job_endpoint_requires_queue_url() -> None:
    client = TestClient(create_app(Settings(jobs_queue_url=None)))

    resp = client.post("/ingest/jobs", json={"external": "external_sources.json"})

    assert resp.status_code == 503
    assert resp.json()["detail"] == "JOBS_QUEUE_URL is not configured"


def test_ingest_job_endpoint_enqueues(monkeypatch) -> None:
    sent: list[IngestJob] = []

    class FakeQueue:
        def __init__(self, queue_url: str, *, region: str, endpoint_url: str | None) -> None:
            assert queue_url == "https://sqs.example/jobs"
            assert region == "us-west-2"
            assert endpoint_url is None

        def send_ingest(self, job: IngestJob):
            from app.jobs.payloads import JobEnvelope

            sent.append(job)
            return JobEnvelope(job_id="job-123", job=job)

    monkeypatch.setattr("app.main.SqsJobQueue", FakeQueue)
    client = TestClient(create_app(Settings(jobs_queue_url="https://sqs.example/jobs")))

    resp = client.post(
        "/ingest/jobs",
        json={"csv": "../data/export.csv", "external": "external_sources.json"},
    )

    assert resp.status_code == 202
    assert resp.json() == {"job_id": "job-123", "status": "queued"}
    assert sent == [IngestJob(csv="../data/export.csv", external="external_sources.json")]


def test_sqs_queue_round_trips_typed_ingest_message() -> None:
    class FakeSqsClient:
        def __init__(self) -> None:
            self.body = ""
            self.deleted = ""
            self.message_attributes = {}

        def send_message(self, *, QueueUrl: str, MessageBody: str, MessageAttributes: dict) -> None:
            assert QueueUrl == "queue-url"
            self.body = MessageBody
            self.message_attributes = MessageAttributes

        def receive_message(self, **_kwargs):
            assert _kwargs["MessageAttributeNames"] == ["All"]
            return {
                "Messages": [
                    {
                        "Body": self.body,
                        "ReceiptHandle": "receipt-1",
                        "MessageId": "message-1",
                        "MessageAttributes": self.message_attributes,
                    }
                ]
            }

        def delete_message(self, *, QueueUrl: str, ReceiptHandle: str) -> None:
            assert QueueUrl == "queue-url"
            self.deleted = ReceiptHandle

    client = FakeSqsClient()
    queue = SqsJobQueue("queue-url", region="us-west-2", client=client)

    envelope = queue.send_ingest(IngestJob(external="external_sources.json", embedder="fake"))
    messages = queue.receive(max_messages=1, wait_time_seconds=0)
    queue.delete(messages[0].receipt_handle)

    assert messages[0].envelope == envelope
    assert messages[0].message_id == "message-1"
    assert messages[0].message_attributes == client.message_attributes
    assert client.deleted == "receipt-1"


def test_worker_process_span_continues_sqs_trace_context(monkeypatch) -> None:
    from app.jobs import worker

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(worker, "tracer", provider.get_tracer("test.jobs.worker"))

    upstream = SpanContext(
        trace_id=0x1234567890ABCDEF1234567890ABCDEF,
        span_id=0x1234567890ABCDEF,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
        trace_state=TraceState(),
    )
    token = context.attach(trace.set_span_in_context(NonRecordingSpan(upstream)))
    try:
        message_attributes = inject_trace_context({})
    finally:
        context.detach(token)

    envelope = JobEnvelope(
        job_id="job-123",
        job=IngestJob(external="external_sources.json", embedder="fake"),
    )

    class FakeQueue:
        queue_url = "queue-url"

        def __init__(self) -> None:
            self.deleted = ""

        def receive(self, *, max_messages: int, wait_time_seconds: int) -> list[ReceivedJob]:
            assert max_messages == 1
            assert wait_time_seconds == 0
            return [
                ReceivedJob(
                    envelope=envelope,
                    receipt_handle="receipt-1",
                    message_id="message-1",
                    message_attributes=message_attributes,
                )
            ]

        def delete(self, receipt_handle: str) -> None:
            self.deleted = receipt_handle

    def fake_process(_envelope: JobEnvelope, _settings: Settings) -> IngestStats:
        return IngestStats(rows_in=2, chunks_embedded=3)

    queue = FakeQueue()
    monkeypatch.setattr(worker, "process_envelope", fake_process)

    count = worker.poll_once(
        queue,
        Settings(sqs_max_messages=1, sqs_wait_time_seconds=0),
    )

    spans = {span.name: span for span in exporter.get_finished_spans()}
    process_span = spans["jobs.worker.process"]
    assert count == 1
    assert queue.deleted == "receipt-1"
    assert process_span.context.trace_id == upstream.trace_id
    assert process_span.parent is not None
    assert process_span.parent.span_id == upstream.span_id
    assert process_span.attributes["job.id"] == "job-123"
    assert process_span.attributes["job.status"] == "completed"
    assert process_span.attributes["ingest.rows_in"] == 2
