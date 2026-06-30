"""FastAPI application entrypoint + app factory.

Run locally with:
    uvicorn app.main:app --reload
"""
import hmac

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langgraph.checkpoint.memory import MemorySaver
from opentelemetry import trace
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.agents.graph import build_graph
from app.agents.llm import make_chat_model
from app.agents.personas import load_personas, scene_to_personas
from app.config import Settings, get_settings
from app.db import engine
from app.jobs import IngestJob, SqsJobQueue
from app.telemetry import configure_telemetry

tracer = trace.get_tracer(__name__)


class ChatRequest(BaseModel):
    message: str
    persona_id: str | None = None
    scene: str | None = None
    # When set, the backend keeps this session's conversation in memory and the
    # later turns see the earlier ones — send only the new `message` each turn.
    session_id: str | None = None
    # Stateless fallback (no session_id): the client supplies prior turns.
    # {"role": "user"|"assistant", "content": str}.
    history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    persona_id: str
    response: str


class EnqueueJobResponse(BaseModel):
    job_id: str
    status: str = "queued"


class EnqueueIngestJobRequest(BaseModel):
    include_csv: bool = False
    include_external: bool = True


def _resolve_persona(persona_id: str | None, scene: str | None) -> str:
    """Pick the persona: explicit id wins; a scene is a hint, ambiguous if shared."""
    personas = load_personas()
    if persona_id is not None:
        if persona_id not in personas:
            raise HTTPException(status_code=404, detail=f"unknown persona_id: {persona_id!r}")
        return persona_id
    if scene is not None:
        candidates = scene_to_personas().get(scene, ())
        if not candidates:
            raise HTTPException(status_code=404, detail=f"unknown scene: {scene!r}")
        if len(candidates) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"scene {scene!r} maps to {list(candidates)}; specify persona_id",
            )
        return candidates[0]
    raise HTTPException(status_code=400, detail="provide persona_id or scene")


def _require_ingest_admin(settings: Settings, token: str | None) -> None:
    if not settings.ingest_admin_token:
        raise HTTPException(status_code=503, detail="INGEST_ADMIN_TOKEN is not configured")
    if token is None or not hmac.compare_digest(token, settings.ingest_admin_token):
        raise HTTPException(status_code=403, detail="invalid admin token")


def _build_ingest_job(req: EnqueueIngestJobRequest, settings: Settings) -> IngestJob:
    if not req.include_csv and not req.include_external:
        raise HTTPException(status_code=400, detail="select at least one ingest source")

    csv_path = None
    external_path = None
    if req.include_csv:
        if not settings.ingest_job_csv_path:
            raise HTTPException(status_code=400, detail="CSV ingest source is not configured")
        csv_path = settings.ingest_job_csv_path
    if req.include_external:
        if not settings.ingest_job_external_path:
            raise HTTPException(status_code=400, detail="external ingest source is not configured")
        external_path = settings.ingest_job_external_path

    return IngestJob(
        csv=csv_path,
        external=external_path,
        embedder=settings.embedder,
        blocklist=settings.donor_blocklist_path if csv_path else None,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title=settings.app_name)
    configure_telemetry(app, settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Compile the agent graph once at startup (like `engine` in db.py).
    model_ids = {
        "bedrock": settings.bedrock_chat_model,
        "stub": "",
    }
    chat_model = make_chat_model(
        settings.chat_model,
        model_id=model_ids.get(settings.chat_model, ""),
        region=settings.aws_region,
    )
    graph = build_graph(chat_model)
    # Server-side short-term memory: in-process per-session history, keyed by
    # session_id. The in-process MemorySaver is NOT shared across Fargate tasks
    # and is lost on restart, so it stays off by default — the supported deployed
    # path is the stateless client-provided `history`. Flip enable_session_memory
    # on once #34 swaps in a shared (Postgres) checkpointer. See PR #71 / #42.
    session_graph = (
        build_graph(chat_model, checkpointer=MemorySaver())
        if settings.enable_session_memory
        else None
    )

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
            with tracer.start_as_current_span("health.db"):
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

    @app.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest) -> ChatResponse:
        """Route a visitor's message to a persona agent and return its reply.

        No RAG grounding yet — the persona answers from its system prompt alone
        (deferred to a follow-up issue).
        """
        with tracer.start_as_current_span("chat.handle") as span:
            persona_id = _resolve_persona(req.persona_id, req.scene)
            span.set_attribute("chat.persona_id", persona_id)
            span.set_attribute("chat.scene", req.scene or "")
            span.set_attribute("chat.session_memory_requested", bool(req.session_id))
            user_turn = {"role": "user", "content": req.message}
            if req.session_id and session_graph is not None:
                # Memory path: send only the new turn; the reducer appends it to the
                # session's checkpointed history so the persona sees prior turns.
                result = session_graph.invoke(
                    {"persona_id": persona_id, "scene": req.scene, "messages": [user_turn]},
                    config={"configurable": {"thread_id": req.session_id}},
                )
            elif req.session_id:
                # session_id given but server-side memory is off (in-process MemorySaver
                # is not shared across Fargate tasks / survives no restart). Don't pretend
                # to remember — tell the client to drive history itself until #34 lands.
                raise HTTPException(
                    status_code=501,
                    detail=(
                        "session_id memory is not enabled in this deployment yet "
                        "(shared checkpointer tracked in #34); send prior turns via `history`."
                    ),
                )
            else:
                # Stateless path: the client supplies the prior turns via `history`.
                result = graph.invoke(
                    {
                        "persona_id": persona_id,
                        "scene": req.scene,
                        "messages": [*req.history, user_turn],
                    }
                )
        return ChatResponse(persona_id=result["persona_id"], response=result["response"])

    @app.post("/ingest/jobs", response_model=EnqueueJobResponse, status_code=202)
    def enqueue_ingest_job(
        req: EnqueueIngestJobRequest,
        x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    ) -> EnqueueJobResponse:
        """Publish an admin-triggered ingest job for the async worker."""

        _require_ingest_admin(settings, x_admin_token)
        if not settings.jobs_queue_url:
            raise HTTPException(status_code=503, detail="JOBS_QUEUE_URL is not configured")
        queue = SqsJobQueue(
            settings.jobs_queue_url,
            region=settings.aws_region,
            endpoint_url=settings.sqs_endpoint_url,
        )
        envelope = queue.send_ingest(_build_ingest_job(req, settings))
        return EnqueueJobResponse(job_id=envelope.job_id)

    return app


app = create_app()
