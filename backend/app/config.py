"""Application settings.

Configuration is read from the environment (and a local ``.env`` file, which is
git-ignored). The database connection string is never committed — see
``.env.example`` and CLAUDE.md.
"""

from functools import lru_cache

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
