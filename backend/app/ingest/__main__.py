"""CLI entrypoint: ``python -m app.ingest`` (ingest-pipeline §2).

Examples:
    python -m app.ingest --csv ../data/"export_empress of japan.csv"
    python -m app.ingest --external external_sources.json --embedder bedrock
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.config import get_settings
from app.db import SessionLocal
from app.ingest.embed import make_embedder
from app.ingest.pipeline import IngestStats, ingest_external, ingest_vmm


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.ingest", description="Ingest into pgvector")
    parser.add_argument("--csv", help="Path to the VMM catalogue CSV")
    parser.add_argument("--external", help="Path to an external-source JSON manifest")
    parser.add_argument(
        "--embedder",
        choices=("fake", "bedrock"),
        help="Override the embedder (default: settings.embedder)",
    )
    parser.add_argument(
        "--blocklist", help="Extra donor-name blocklist file (local, never committed)"
    )
    args = parser.parse_args(argv)

    if not args.csv and not args.external:
        parser.error("provide --csv and/or --external")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    embedder = make_embedder(
        args.embedder or settings.embedder,
        model_id=settings.bedrock_embedding_model,
        region=settings.aws_region,
    )
    logging.getLogger("ingest").info(
        "using embedder=%s model=%s", args.embedder or settings.embedder, embedder.model_id
    )

    stats = IngestStats()
    session = SessionLocal()
    try:
        if args.csv:
            ingest_vmm(
                session,
                args.csv,
                embedder,
                extra_blocklist_path=args.blocklist or settings.donor_blocklist_path,
                stats=stats,
            )
        if args.external:
            ingest_external(session, args.external, embedder, stats=stats)
    finally:
        session.close()

    logging.getLogger("ingest").info("DONE — %s", stats.summary())
    return 1 if stats.errors else 0


if __name__ == "__main__":
    sys.exit(main())
