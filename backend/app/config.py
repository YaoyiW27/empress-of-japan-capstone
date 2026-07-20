"""Application settings.

Configuration is read from the environment (and a local ``.env`` file, which is
git-ignored). The database connection string is never committed — see
``.env.example`` and CLAUDE.md.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/empress"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "empress-backend"
    app_env: str = "local"
    log_level: str = "info"

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    # Local/test callers can still provide a full URL. Deployed ECS tasks inject
    # the five DB_* values below from Secrets Manager instead.
    database_url: str | None = None
    db_host: str | None = None
    db_port: int | None = None
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None

    # --- Ingest / embeddings -------------------------------------------------
    # "bedrock" (AWS Titan V2, real) or "fake" (deterministic local, no creds).
    # Defaults to fake so the pipeline runs/tests locally before Bedrock IAM is
    # provisioned (coordinate with Yaoyi — CLAUDE.md). Flip to bedrock via env.
    embedder: Literal["fake", "bedrock"] = "fake"
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

    # Server-side short-term memory is shared through Postgres when enabled.
    # Local/test callers can leave it off and send compact `history` instead.
    enable_session_memory: bool = False
    session_memory_ttl_seconds: int = Field(default=1800, gt=0)
    session_cleanup_interval_seconds: int = Field(default=60, gt=0)
    session_cleanup_batch_size: int = Field(default=100, gt=0)

    # Optional extra donor-name blocklist file for free-text PII redaction
    # (one name per line). Built primarily in-memory from the source's donor
    # column; this is for known stray names. Never committed (keep it local).
    donor_blocklist_path: str | None = None

    # --- Async ingest jobs ---------------------------------------------------
    # The API publishes jobs here and a separate worker process consumes them.
    # In AWS this is the SQS URL from infra/terraform/sqs.tf; local development
    # can point sqs_endpoint_url at LocalStack or elasticmq.
    jobs_queue_url: str | None = None
    sqs_endpoint_url: str | None = None
    sqs_wait_time_seconds: int = 20
    sqs_max_messages: int = 1
    ingest_admin_token: str | None = None
    ingest_job_csv_path: str | None = None
    ingest_job_classified_path: str | None = None
    ingest_job_external_path: str | None = "external_sources.json"

    # Path to the directory containing persona markdown files.
    # Defaults to the repo-root relative path for local dev, but can be overridden
    # via the PERSONA_DIR env var for Docker container deployments (#56).
    persona_dir: Path = Path(__file__).resolve().parents[2] / "data" / "ai" / "personas"
    # Scene context prompts are composed after the selected persona prompt.
    scene_dir: Path = Path(__file__).resolve().parents[2] / "data" / "ai" / "scenes"

    # --- Voice interaction ---------------------------------------------------
    # AWS credentials are never configured here. In AWS, Polly/Transcribe/S3
    # access comes from the ECS task role provisioned by infra/terraform.
    voice_cache_bucket: str | None = None
    voice_cache_prefix: str = "polly-cache/"
    polly_engine: str = "neural"
    transcribe_language_code: str = "en-US"
    voice_audio_url_ttl_seconds: int = 900
    voice_max_text_length: int = 1000

    # --- Observability -------------------------------------------------------
    # Disabled by default so local tests and deployed tasks keep working before
    # the Honeycomb API key is provisioned in Secrets Manager.
    otel_enabled: bool = False
    otel_service_name: str = "empress-backend"
    otel_exporter_otlp_endpoint: str = "http://127.0.0.1:4318/v1/traces"
    otel_resource_attributes: str | None = None
    honeycomb_api_key: str | None = None
    honeycomb_dataset: str = "empress-backend-sandbox"

    @property
    def sqlalchemy_url(self) -> URL:
        """Return the SQLAlchemy database URL without logging or rendering secrets."""
        if self.database_url:
            return make_url(self._normalise_driver(self.database_url))

        if self._has_db_parts:
            missing = [
                name
                for name, value in {
                    "DB_HOST": self.db_host,
                    "DB_PORT": self.db_port,
                    "DB_NAME": self.db_name,
                    "DB_USER": self.db_user,
                    "DB_PASSWORD": self.db_password,
                }.items()
                if value in (None, "")
            ]
            if missing:
                missing_names = ", ".join(missing)
                raise ValueError(f"Missing required database settings: {missing_names}")
            return URL.create(
                drivername="postgresql+psycopg",
                username=self.db_user,
                password=self.db_password,
                host=self.db_host,
                port=self.db_port,
                database=self.db_name,
            )

        return make_url(self._normalise_driver(LOCAL_DATABASE_URL))

    @property
    def psycopg_conninfo(self) -> str:
        """Return the database URL in the driver-neutral form psycopg expects."""
        return self.sqlalchemy_url.set(drivername="postgresql").render_as_string(
            hide_password=False
        )

    @property
    def _has_db_parts(self) -> bool:
        return any(
            value not in (None, "")
            for value in (self.db_host, self.db_port, self.db_name, self.db_user, self.db_password)
        )

    @staticmethod
    def _normalise_driver(url: str) -> str:
        """Normalise Postgres URLs onto the psycopg (v3) driver SQLAlchemy expects."""
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
