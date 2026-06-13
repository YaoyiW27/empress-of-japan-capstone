"""Stage 5 — Embed (ingest-pipeline §8; schema §7).

Pluggable embedder. ``BedrockTitanEmbedder`` is the real path (Titan V2, 1024-dim)
mandated by CLAUDE.md; ``FakeEmbedder`` is a deterministic local stand-in so the
pipeline runs and is testable before Bedrock IAM is provisioned (coordinate with
Yaoyi). Both produce L2-normalized 1024-dim vectors (cosine-ready).
"""

from __future__ import annotations

import hashlib
import math
import struct
import time
from typing import Protocol

from app.models import EMBEDDING_DIM


class Embedder(Protocol):
    model_id: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm else vec


class FakeEmbedder:
    """Deterministic pseudo-embeddings from a hash — for local dev/tests only.

    Same text → same vector (so idempotency and re-run behaviour are testable),
    but the vectors carry NO semantic meaning. Never use for real retrieval.
    """

    def __init__(self, dim: int = EMBEDDING_DIM) -> None:
        self.model_id = f"fake-embed-v1-{dim}d"
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            floats: list[float] = []
            counter = 0
            while len(floats) < self.dim:
                digest = hashlib.sha256(f"{text}|{counter}".encode()).digest()
                # 8 uint32s per 32-byte digest, mapped to [-1, 1) — never NaN/inf.
                for u in struct.unpack(">8I", digest):
                    floats.append((u / 0xFFFFFFFF) * 2.0 - 1.0)
                    if len(floats) >= self.dim:
                        break
                counter += 1
            out.append(_l2_normalize(floats[: self.dim]))
        return out


class BedrockTitanEmbedder:
    """AWS Bedrock Titan Text Embeddings V2 (real). Requires sandbox IAM access."""

    def __init__(
        self,
        model_id: str = "amazon.titan-embed-text-v2:0",
        region: str = "us-west-2",
        dim: int = EMBEDDING_DIM,
        max_retries: int = 5,
    ) -> None:
        import boto3  # imported lazily so local/fake runs need no AWS deps wired

        self.model_id = model_id
        self.dim = dim
        self._max_retries = max_retries
        self._client = boto3.client("bedrock-runtime", region_name=region)

    def _invoke(self, text: str) -> list[float]:
        import json

        body = json.dumps({"inputText": text, "dimensions": self.dim, "normalize": True})
        delay = 0.5
        for attempt in range(self._max_retries):
            try:
                resp = self._client.invoke_model(modelId=self.model_id, body=body)
                payload = json.loads(resp["body"].read())
                return payload["embedding"]
            except Exception:  # throttling / transient — backoff then retry
                if attempt == self._max_retries - 1:
                    raise
                time.sleep(delay)
                delay *= 2
        raise RuntimeError("unreachable")

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Titan embeds one input per call; the batch is a throttled loop.
        return [self._invoke(t) for t in texts]


def make_embedder(kind: str, *, model_id: str, region: str) -> Embedder:
    """Factory selecting the embedder by config (settings.embedder)."""
    if kind == "bedrock":
        return BedrockTitanEmbedder(model_id=model_id, region=region)
    if kind == "fake":
        return FakeEmbedder()
    raise ValueError(f"unknown embedder kind: {kind!r} (expected 'bedrock' or 'fake')")
