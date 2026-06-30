"""SQS-backed job queue adapter."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import boto3

from app.jobs.payloads import IngestJob, JobEnvelope


@dataclass(frozen=True)
class ReceivedJob:
    envelope: JobEnvelope
    receipt_handle: str
    message_id: str


class SqsJobQueue:
    """Small wrapper around SQS so the app code does not depend on boto3 shapes."""

    def __init__(
        self,
        queue_url: str,
        *,
        region: str,
        endpoint_url: str | None = None,
        client: Any | None = None,
    ) -> None:
        self.queue_url = queue_url
        self._client = client or boto3.client(
            "sqs",
            region_name=region,
            endpoint_url=endpoint_url,
        )

    def send_ingest(self, job: IngestJob) -> JobEnvelope:
        envelope = JobEnvelope(job=job)
        self._client.send_message(
            QueueUrl=self.queue_url,
            MessageBody=envelope.model_dump_json(),
        )
        return envelope

    def receive(self, *, max_messages: int, wait_time_seconds: int) -> list[ReceivedJob]:
        response = self._client.receive_message(
            QueueUrl=self.queue_url,
            MaxNumberOfMessages=max_messages,
            WaitTimeSeconds=wait_time_seconds,
        )
        jobs: list[ReceivedJob] = []
        for message in response.get("Messages", []):
            jobs.append(
                ReceivedJob(
                    envelope=JobEnvelope.model_validate_json(message["Body"]),
                    receipt_handle=message["ReceiptHandle"],
                    message_id=message["MessageId"],
                )
            )
        return jobs

    def delete(self, receipt_handle: str) -> None:
        self._client.delete_message(
            QueueUrl=self.queue_url,
            ReceiptHandle=receipt_handle,
        )
