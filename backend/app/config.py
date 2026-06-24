"""Application settings.

Configuration is read from the environment (and a local ``.env`` file, which is
git-ignored). The database connection string is never committed — see
``.env.example`` and CLAUDE.md.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "empress-backend"
    app_env: str = "local"
    log_level: str = "info"

    # Local dev default mirrors backend/docker-compose.yml. Override via the
    # DATABASE_URL env var (RDS endpoint from a secret in deployed environments).
    database_url: str = "postgresql://postgres:postgres@localhost:5432/empress"

    # --- Ingest / embeddings -------------------------------------------------
    # "bedrock" (AWS Titan V2, real) or "fake" (deterministic local, no creds).
    # Defaults to fake so the pipeline runs/tests locally before Bedrock IAM is
    # provisioned (coordinate with Yaoyi — CLAUDE.md). Flip to bedrock via env.
    embedder: str = "fake"
    bedrock_embedding_model: str = "amazon.titan-embed-text-v2:0"
    aws_region: str = "us-west-2"

    # --- Agents / chat LLM ---------------------------------------------------
    # "stub" (deterministic local, no creds) or "bedrock" (real Claude via
    # Bedrock). Defaults to stub so the agent graph runs/tests without AWS creds;
    # flip to bedrock via env once creds are available (chat IAM landed in #70 /
    # PR #73, attached to the Fargate task role in #42).
    chat_model: str = "stub"
    # Claude Sonnet 4.6 has no in-Region endpoint in us-west-2, so deployed
    # calls use the US cross-Region inference profile from infra/bedrock.tf.
    bedrock_chat_model: str = "us.anthropic.claude-sonnet-4-6"

    # Server-side session memory (the `session_id` chat path) uses an in-process
    # MemorySaver, which is NOT shared across Fargate tasks and is lost on restart.
    # Off until #34 provides a shared (Postgres) checkpointer; until then the
    # supported path is the client-provided `history` (stateless). See PR #71 / #42.
    enable_session_memory: bool = False

    # Optional extra donor-name blocklist file for free-text PII redaction
    # (one name per line). Built primarily in-memory from the source's donor
    # column; this is for known stray names. Never committed (keep it local).
    donor_blocklist_path: str | None = None

    # Path to the directory containing persona markdown files.
    # Defaults to the repo-root relative path for local dev, but can be overridden
    # via the PERSONA_DIR env var for Docker container deployments (#56).
    persona_dir: Path = Path(__file__).resolve().parents[2] / "data" / "ai" / "personas"

    # --- Observability -------------------------------------------------------
    # Disabled by default so local tests and deployed tasks keep working before
    # the Honeycomb API key is provisioned in Secrets Manager.
    otel_enabled: bool = False
    otel_service_name: str = "empress-backend"
    otel_exporter_otlp_endpoint: str = "https://api.honeycomb.io/v1/traces"
    honeycomb_api_key: str | None = None
    honeycomb_dataset: str = "empress-backend-sandbox"

    @property
    def sqlalchemy_url(self) -> str:
        """Normalise the URL onto the psycopg (v3) driver SQLAlchemy expects."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
