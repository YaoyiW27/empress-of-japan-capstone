"""FastAPI application entrypoint + app factory.

Run locally with:
    uvicorn app.main:app --reload
"""

import asyncio
import hmac
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langgraph.checkpoint.memory import MemorySaver
from opentelemetry import trace
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.agents.graph import (
    InvalidGroundedResponseError,
    RetrievalUnavailableError,
    build_graph,
)
from app.agents.llm import ChatModel, make_chat_model
from app.agents.personas import load_personas, scene_to_personas
from app.config import Settings, get_settings
from app.db import SessionLocal, engine, get_db
from app.ingest.embed import make_embedder
from app.jobs import IngestJob, SqsJobQueue
from app.models import Ship
from app.retrieval import (
    DEFAULT_TOP_K,
    MAX_TOP_K,
    Citation,
    RetrievalResponse,
    RetrievalService,
    Retriever,
)
from app.telemetry import configure_telemetry
from app.voice import (
    NARRATOR_VOICES,
    VOICE_MAX_RECORDING_SECONDS,
    AmazonTranscribeAdapter,
    PollyS3VoiceSynthesizer,
    Transcriber,
    VoiceConfigurationError,
    VoiceSynthesisError,
    VoiceSynthesizer,
    chunk_seconds,
)

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
    citations: list[Citation] = Field(default_factory=list)


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = DEFAULT_TOP_K
    ship: Ship | None = None
    material_type: str | None = None


class EnqueueJobResponse(BaseModel):
    job_id: str
    status: str = "queued"


class EnqueueIngestJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    include_csv: bool = False
    include_external: bool = True


class VoiceSynthesizeRequest(BaseModel):
    narrator_id: str
    text: str


class VoiceSynthesizeResponse(BaseModel):
    audio_url: str
    cached: bool
    expires_in: int


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
    classified_path = None
    external_path = None
    if req.include_csv:
        if not settings.ingest_job_csv_path:
            raise HTTPException(status_code=400, detail="CSV ingest source is not configured")
        csv_path = settings.ingest_job_csv_path
        if not settings.ingest_job_classified_path:
            raise HTTPException(
                status_code=400, detail="classified ingest source is not configured"
            )
        classified_path = settings.ingest_job_classified_path
    if req.include_external:
        if not settings.ingest_job_external_path:
            raise HTTPException(status_code=400, detail="external ingest source is not configured")
        external_path = settings.ingest_job_external_path

    return IngestJob(
        csv=csv_path,
        classified=classified_path,
        external=external_path,
        embedder=settings.embedder,
        blocklist=settings.donor_blocklist_path if csv_path else None,
    )


def _build_voice_synthesizer(settings: Settings) -> VoiceSynthesizer:
    return PollyS3VoiceSynthesizer(
        bucket=settings.voice_cache_bucket,
        prefix=settings.voice_cache_prefix,
        engine=settings.polly_engine,
        language_code=settings.transcribe_language_code,
        expires_in=settings.voice_audio_url_ttl_seconds,
        region=settings.aws_region,
    )


def _build_transcriber(settings: Settings) -> Transcriber:
    return AmazonTranscribeAdapter(
        language_code=settings.transcribe_language_code,
        region=settings.aws_region,
    )


def create_app(
    settings: Settings | None = None,
    *,
    voice_synthesizer: VoiceSynthesizer | None = None,
    transcriber: Transcriber | None = None,
    retriever: Retriever | None = None,
    agent_chat_model: ChatModel | None = None,
) -> FastAPI:
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
    retrieval_service = retriever or RetrievalService(
        make_embedder(
            settings.embedder,
            model_id=settings.bedrock_embedding_model,
            region=settings.aws_region,
        )
    )

    def retrieve_for_agent(query: str) -> RetrievalResponse:
        # Graphs are compiled once and may run outside FastAPI's dependency
        # injection, so each persona turn owns a short-lived DB session.
        with SessionLocal() as session:
            return retrieval_service.retrieve(session, query, top_k=DEFAULT_TOP_K)

    # Compile the agent graph once at startup (like `engine` in db.py).
    model_ids = {
        "bedrock": settings.bedrock_chat_model,
        "stub": "",
    }
    chat_model = agent_chat_model or make_chat_model(
        settings.chat_model,
        model_id=model_ids.get(settings.chat_model, ""),
        region=settings.aws_region,
    )
    graph = build_graph(
        chat_model,
        retrieve_candidates=retrieve_for_agent,
        max_response_length=settings.voice_max_text_length,
    )
    # Server-side short-term memory: in-process per-session history, keyed by
    # session_id. The in-process MemorySaver is NOT shared across Fargate tasks
    # and is lost on restart, so it stays off by default — the supported deployed
    # path is the stateless client-provided `history`. Flip enable_session_memory
    # on once #34 swaps in a shared (Postgres) checkpointer. See PR #71 / #42.
    session_graph = (
        build_graph(
            chat_model,
            checkpointer=MemorySaver(),
            retrieve_candidates=retrieve_for_agent,
            max_response_length=settings.voice_max_text_length,
        )
        if settings.enable_session_memory
        else None
    )
    synth = voice_synthesizer or _build_voice_synthesizer(settings)
    speech_transcriber = transcriber or _build_transcriber(settings)

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

    @app.post("/retrieve", response_model=RetrievalResponse)
    def retrieve(
        req: RetrieveRequest, db: Annotated[Session, Depends(get_db)]
    ) -> RetrievalResponse:
        """Embed a query and return grounded chunks from the retrieval view."""

        query = req.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query must not be blank")
        if req.top_k < 1 or req.top_k > MAX_TOP_K:
            raise HTTPException(status_code=400, detail=f"top_k must be between 1 and {MAX_TOP_K}")
        material_type = req.material_type.strip() if req.material_type else None
        return retrieval_service.retrieve(
            db,
            query,
            top_k=req.top_k,
            ship=req.ship.value if req.ship else None,
            material_type=material_type,
        )

    @app.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest) -> ChatResponse:
        """Return a persona reply plus only the archival sources it actually used."""
        with tracer.start_as_current_span("chat.handle") as span:
            persona_id = _resolve_persona(req.persona_id, req.scene)
            span.set_attribute("chat.persona_id", persona_id)
            span.set_attribute("chat.scene", req.scene or "")
            span.set_attribute("chat.session_memory_requested", bool(req.session_id))
            user_turn = {"role": "user", "content": req.message}
            try:
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
            except RetrievalUnavailableError as exc:
                raise HTTPException(
                    status_code=503, detail="grounding retrieval is unavailable"
                ) from exc
            except InvalidGroundedResponseError as exc:
                raise HTTPException(
                    status_code=502, detail="chat model returned an invalid response"
                ) from exc
        return ChatResponse(
            persona_id=result["persona_id"],
            response=result["response"],
            citations=result.get("citations", []),
        )

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

    @app.post("/voice/synthesize", response_model=VoiceSynthesizeResponse)
    def synthesize_voice(req: VoiceSynthesizeRequest) -> VoiceSynthesizeResponse:
        """Synthesize narrator text through Polly and return a short-lived S3 URL."""

        if req.narrator_id not in NARRATOR_VOICES:
            raise HTTPException(status_code=404, detail=f"unknown narrator_id: {req.narrator_id!r}")
        text = req.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="text must not be empty")
        if len(text) > settings.voice_max_text_length:
            raise HTTPException(
                status_code=400,
                detail=f"text exceeds VOICE_MAX_TEXT_LENGTH ({settings.voice_max_text_length})",
            )
        with tracer.start_as_current_span("voice.synthesize") as span:
            span.set_attribute("voice.narrator_id", req.narrator_id)
            try:
                result = synth.synthesize(narrator_id=req.narrator_id, text=text)
            except VoiceConfigurationError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            except VoiceSynthesisError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            span.set_attribute("voice.cache_hit", result.cached)
        return VoiceSynthesizeResponse(
            audio_url=result.audio_url,
            cached=result.cached,
            expires_in=result.expires_in,
        )

    @app.websocket("/voice/transcribe")
    async def transcribe_voice(websocket: WebSocket) -> None:
        """Stream short PCM microphone chunks to Amazon Transcribe."""

        await websocket.accept()
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        async def audio_chunks() -> AsyncIterator[bytes]:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk

        async def receive_audio() -> None:
            total_seconds = 0.0
            try:
                while True:
                    message = await websocket.receive()
                    if message.get("type") == "websocket.disconnect":
                        break

                    data = message.get("bytes")
                    if data is not None:
                        if not data:
                            await websocket.send_json(
                                {"type": "error", "detail": "audio chunk must not be empty"}
                            )
                            await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                            break
                        total_seconds += chunk_seconds(data)
                        if total_seconds > VOICE_MAX_RECORDING_SECONDS:
                            await websocket.send_json(
                                {
                                    "type": "error",
                                    "detail": (
                                        f"recording exceeded {VOICE_MAX_RECORDING_SECONDS} seconds"
                                    ),
                                }
                            )
                            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                            break
                        await queue.put(data)
                        continue

                    text = message.get("text")
                    if text is not None:
                        try:
                            payload = json.loads(text)
                        except json.JSONDecodeError:
                            payload = text
                        if payload == "end" or (
                            isinstance(payload, dict) and payload.get("event") == "end"
                        ):
                            break
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "send binary PCM audio chunks or an end event",
                            }
                        )
                        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                        break
            except WebSocketDisconnect:
                pass
            finally:
                await queue.put(None)

        receiver = asyncio.create_task(receive_audio())
        try:
            async for message in speech_transcriber.transcribe(audio_chunks()):
                await websocket.send_json(message.payload())
        except WebSocketDisconnect:
            pass
        except Exception:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.send_json({"type": "error", "detail": "voice transcription failed"})
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        finally:
            if not receiver.done():
                receiver.cancel()
            await asyncio.gather(receiver, return_exceptions=True)

    return app


app = create_app()
