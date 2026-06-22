"""FastAPI application entrypoint + app factory.

Run locally with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.agents.graph import build_graph
from app.agents.llm import make_chat_model
from app.agents.personas import load_personas, scene_to_personas
from app.config import get_settings
from app.db import engine


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


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    # Compile the agent graph once at startup (like `engine` in db.py).
    model_ids = {
        "bedrock": settings.bedrock_chat_model,
        "gemini": settings.gemini_chat_model,
        "stub": "",
    }
    chat_model = make_chat_model(
        settings.chat_model,
        model_id=model_ids.get(settings.chat_model, ""),
        region=settings.aws_region,
        api_key=settings.gemini_api_key,
    )
    graph = build_graph(chat_model)
    # Server-side short-term memory: in-process per-session history, keyed by
    # session_id (lost on restart — swap MemorySaver for a Postgres checkpointer
    # when cross-restart persistence is needed; tracked alongside the RAG work).
    session_graph = build_graph(chat_model, checkpointer=MemorySaver())

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

    @app.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest) -> ChatResponse:
        """Route a visitor's message to a persona agent and return its reply.

        No RAG grounding yet — the persona answers from its system prompt alone
        (deferred to a follow-up issue).
        """
        persona_id = _resolve_persona(req.persona_id, req.scene)
        user_turn = {"role": "user", "content": req.message}
        if req.session_id:
            # Memory path: send only the new turn; the reducer appends it to the
            # session's checkpointed history so the persona sees prior turns.
            result = session_graph.invoke(
                {"persona_id": persona_id, "scene": req.scene, "messages": [user_turn]},
                config={"configurable": {"thread_id": req.session_id}},
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

    return app


app = create_app()
