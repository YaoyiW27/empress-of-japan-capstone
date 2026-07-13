"""Typed payloads for async worker jobs."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


class IngestJob(BaseModel):
    """Run the ingest pipeline for one or both supported source types."""

    kind: Literal["ingest"] = "ingest"
    csv: str | None = None
    classified: str | None = None
    external: str | None = None
    embedder: Literal["fake", "bedrock"] | None = None
    blocklist: str | None = None

    @model_validator(mode="after")
    def require_source(self) -> IngestJob:
        if not self.csv and not self.external:
            raise ValueError("provide csv and/or external")
        if self.classified and not self.csv:
            raise ValueError("classified input requires csv")
        return self


class JobEnvelope(BaseModel):
    """Message wrapper with stable metadata for logs and retries."""

    job_id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    job: IngestJob
