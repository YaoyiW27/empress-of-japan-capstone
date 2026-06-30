"""Unit tests for async ingest job plumbing (no AWS required)."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.jobs import IngestJob, SqsJobQueue
from app.main import create_app


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
