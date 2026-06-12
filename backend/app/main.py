"""FastAPI application entrypoint + app factory.

Run locally with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from sqlalchemy import text

from app.config import get_settings
from app.db import engine


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    @app.get("/health")
    def health() -> dict[str, str]:
        """Liveness: the app process is up."""
        return {"status": "ok"}

    @app.get("/health/db")
    def health_db() -> dict[str, str]:
        """Readiness: the database is reachable."""
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}

    return app


app = create_app()
