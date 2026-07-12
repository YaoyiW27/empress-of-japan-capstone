"""Worker process for SQS-backed ingest jobs."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import boto3
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.ingest.embed import make_embedder
from app.ingest.pipeline import IngestStats, ingest_external, ingest_vmm
from app.jobs.payloads import JobEnvelope
from app.jobs.sqs import SqsJobQueue
from app.telemetry import configure_worker_telemetry
from app.tracing.sqs import use_extracted_trace_context

log = logging.getLogger("jobs.worker")
tracer = trace.get_tracer(__name__)


def _validate_server_controlled_job(envelope: JobEnvelope, settings: Settings) -> None:
    """Reject queue messages that differ from the server-side source allowlist."""

    job = envelope.job
    configured = {
        "csv": settings.ingest_job_csv_path,
        "classified": settings.ingest_job_classified_path,
        "external": settings.ingest_job_external_path,
        "blocklist": settings.donor_blocklist_path,
    }
    for field, allowed in configured.items():
        supplied = getattr(job, field)
        if supplied is not None and supplied != allowed:
            raise ValueError(f"job {field} input is not server-approved")
    if job.embedder is not None and job.embedder != settings.embedder:
        raise ValueError("job embedder is not server-approved")


def _materialize_source(source: str | None, directory: Path, label: str, s3_client) -> str | None:
    """Download an approved S3 URI to ephemeral storage; keep local paths unchanged."""

    if source is None:
        return None
    parsed = urlparse(source)
    if parsed.scheme != "s3":
        return source
    if not parsed.netloc or not parsed.path.lstrip("/"):
        raise ValueError(f"invalid S3 URI for {label}")
    suffix = Path(parsed.path).suffix
    destination = directory / f"{label}{suffix}"
    s3_client.download_file(parsed.netloc, parsed.path.lstrip("/"), str(destination))
    return str(destination)


def process_envelope(envelope: JobEnvelope, settings: Settings) -> IngestStats:
    """Run one job message. Exceptions bubble so SQS can retry the message."""

    _validate_server_controlled_job(envelope, settings)
    job = envelope.job
    embedder_name = job.embedder or settings.embedder
    embedder = make_embedder(
        embedder_name,
        model_id=settings.bedrock_embedding_model,
        region=settings.aws_region,
    )
    stats = IngestStats()
    with tempfile.TemporaryDirectory(prefix="empress-ingest-") as temp_dir:
        directory = Path(temp_dir)
        s3_client = None
        if any(
            source and source.startswith("s3://")
            for source in (job.csv, job.classified, job.external)
        ):
            s3_client = boto3.client("s3", region_name=settings.aws_region)
        csv_path = _materialize_source(job.csv, directory, "vmm", s3_client)
        classified_path = _materialize_source(
            job.classified, directory, "classified", s3_client
        )
        external_path = _materialize_source(job.external, directory, "external", s3_client)

        session = SessionLocal()
        try:
            if csv_path:
                ingest_vmm(
                    session,
                    csv_path,
                    embedder,
                    classified_path=classified_path,
                    extra_blocklist_path=job.blocklist or settings.donor_blocklist_path,
                    stats=stats,
                )
            if external_path:
                ingest_external(session, external_path, embedder, stats=stats)
        finally:
            session.close()
        return stats


def poll_once(queue: SqsJobQueue, settings: Settings) -> int:
    """Receive and process one batch. Returns the number of messages seen."""

    with tracer.start_as_current_span("jobs.worker.receive") as receive_span:
        receive_span.set_attribute("messaging.system", "aws_sqs")
        receive_span.set_attribute("messaging.destination.name", queue.queue_url)
        receive_span.set_attribute("sqs.max_messages", settings.sqs_max_messages)
        receive_span.set_attribute("sqs.wait_time_seconds", settings.sqs_wait_time_seconds)
        messages = queue.receive(
            max_messages=settings.sqs_max_messages,
            wait_time_seconds=settings.sqs_wait_time_seconds,
        )
        receive_span.set_attribute("sqs.message_count", len(messages))

    for message in messages:
        envelope = message.envelope
        job = envelope.job
        log.info(
            "processing job_id=%s message_id=%s kind=%s",
            envelope.job_id,
            message.message_id,
            job.kind,
        )
        with use_extracted_trace_context(message.message_attributes):
            with tracer.start_as_current_span("jobs.worker.process") as process_span:
                process_span.set_attribute("messaging.system", "aws_sqs")
                process_span.set_attribute("messaging.message.id", message.message_id)
                process_span.set_attribute("job.id", envelope.job_id)
                process_span.set_attribute("job.kind", job.kind)
                process_span.set_attribute("job.has_csv", bool(job.csv))
                process_span.set_attribute("job.has_classified", bool(job.classified))
                process_span.set_attribute("job.has_external", bool(job.external))
                process_span.set_attribute("job.embedder", job.embedder or settings.embedder)
                process_span.set_attribute("embed.model_id", settings.bedrock_embedding_model)
                try:
                    stats = process_envelope(envelope, settings)
                except Exception as exc:
                    process_span.record_exception(exc)
                    process_span.set_status(Status(StatusCode.ERROR, str(exc)))
                    process_span.set_attribute("job.status", "failed")
                    log.exception("job failed job_id=%s", envelope.job_id)
                    continue
                process_span.set_attribute("job.status", "completed")
                process_span.set_attribute("ingest.rows_in", stats.rows_in)
                process_span.set_attribute("ingest.inserted", stats.inserted)
                process_span.set_attribute("ingest.updated", stats.updated)
                process_span.set_attribute("ingest.skipped", stats.skipped)
                process_span.set_attribute("ingest.errors", stats.errors)
                process_span.set_attribute("ingest.chunks_embedded", stats.chunks_embedded)
            with tracer.start_as_current_span("jobs.worker.delete") as delete_span:
                delete_span.set_attribute("messaging.system", "aws_sqs")
                delete_span.set_attribute("messaging.message.id", message.message_id)
                delete_span.set_attribute("job.id", envelope.job_id)
                try:
                    queue.delete(message.receipt_handle)
                except Exception as exc:
                    delete_span.record_exception(exc)
                    delete_span.set_status(Status(StatusCode.ERROR, str(exc)))
                    raise
                else:
                    delete_span.set_attribute("job.status", "deleted")
        log.info("completed job_id=%s %s", envelope.job_id, stats.summary())
    return len(messages)


def run_forever(queue: SqsJobQueue, settings: Settings) -> None:
    stopping = False

    def stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("worker polling queue=%s", queue.queue_url)
    while not stopping:
        poll_once(queue, settings)
    log.info("worker stopped")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.jobs.worker", description="Consume async jobs")
    parser.add_argument("--once", action="store_true", help="Process one receive batch then exit")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    configure_worker_telemetry(settings)
    if not settings.jobs_queue_url:
        log.error("JOBS_QUEUE_URL is required")
        return 2

    queue = SqsJobQueue(
        settings.jobs_queue_url,
        region=settings.aws_region,
        endpoint_url=settings.sqs_endpoint_url,
    )
    if args.once:
        poll_once(queue, settings)
    else:
        run_forever(queue, settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
