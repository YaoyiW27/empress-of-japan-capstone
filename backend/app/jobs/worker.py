"""Worker process for SQS-backed ingest jobs."""

from __future__ import annotations

import argparse
import logging
import signal
import sys

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.ingest.embed import make_embedder
from app.ingest.pipeline import IngestStats, ingest_external, ingest_vmm
from app.jobs.payloads import JobEnvelope
from app.jobs.sqs import SqsJobQueue

log = logging.getLogger("jobs.worker")


def process_envelope(envelope: JobEnvelope, settings: Settings) -> IngestStats:
    """Run one job message. Exceptions bubble so SQS can retry the message."""

    job = envelope.job
    embedder_name = job.embedder or settings.embedder
    embedder = make_embedder(
        embedder_name,
        model_id=settings.bedrock_embedding_model,
        region=settings.aws_region,
    )
    stats = IngestStats()
    session = SessionLocal()
    try:
        if job.csv:
            ingest_vmm(
                session,
                job.csv,
                embedder,
                extra_blocklist_path=job.blocklist or settings.donor_blocklist_path,
                stats=stats,
            )
        if job.external:
            ingest_external(session, job.external, embedder, stats=stats)
    finally:
        session.close()
    return stats


def poll_once(queue: SqsJobQueue, settings: Settings) -> int:
    """Receive and process one batch. Returns the number of messages seen."""

    messages = queue.receive(
        max_messages=settings.sqs_max_messages,
        wait_time_seconds=settings.sqs_wait_time_seconds,
    )
    for message in messages:
        envelope = message.envelope
        log.info(
            "processing job_id=%s message_id=%s kind=%s",
            envelope.job_id,
            message.message_id,
            envelope.job.kind,
        )
        try:
            stats = process_envelope(envelope, settings)
        except Exception:
            log.exception("job failed job_id=%s", envelope.job_id)
            continue
        queue.delete(message.receipt_handle)
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
