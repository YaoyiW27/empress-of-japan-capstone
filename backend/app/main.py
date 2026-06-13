"""FastAPI application entrypoint + app factory.

Run locally with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

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
    def health_db() -> JSONResponse:
        """Readiness: the database is reachable.

        Returns 503 (not a 500 traceback) when the DB is down — e.g. the local
        docker-compose database isn't started. Run `docker compose up -d`.
        """
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "unavailable",
                    "database": "unreachable",
                    "detail": str(exc.__cause__ or exc),
                },
            )
        return JSONResponse(content={"status": "ok", "database": "reachable"})

    return app


app = create_app()
