"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agent.orchestrator import run_rag_agent_turn
from config.settings import Settings, get_settings
from db.supabase_client import get_supabase
from embeddings.gemini_embed import GeminiEmbedder
from models.chat import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)


def _verify_internal_secret(
    settings: Settings,
    x_rag_secret: str | None,
    authorization: str | None,
) -> None:
    expected = (settings.internal_secret or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="RAG_AGENT_INTERNAL_SECRET is not configured")
    token = (x_rag_secret or "").strip()
    if not token and authorization:
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Neurons RAG Agent", version="1.0.0")

    origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    embedder = GeminiEmbedder(
        api_key=settings.google_llm_api_key,
        model=settings.gemini_embedding_model,
        output_dimensionality=settings.embedding_output_dimensionality,
    )
    supabase = get_supabase(settings)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/chat", response_model=ChatResponse)
    def chat(
        body: ChatRequest,
        x_rag_secret: str | None = Header(default=None, alias="X-RAG-Agent-Secret"),
        authorization: str | None = Header(default=None),
    ) -> ChatResponse:
        _verify_internal_secret(settings, x_rag_secret, authorization)
        hist = [{"role": m.role, "content": m.content} for m in body.history]
        logger.info(
            "chat_request project_agent_id=%s user_message=%s history_len=%d",
            body.project_agent_id,
            (body.user_message or "")[:200],
            len(hist),
        )
        try:
            out = run_rag_agent_turn(
                settings=settings,
                supabase=supabase,
                embedder=embedder,
                organization_id=body.organization_id,
                project_id=body.project_id,
                project_agent_id=body.project_agent_id,
                user_message=body.user_message,
                history=hist,
                system_instruction=body.system_instruction,
                model_config_overrides=body.generation_config,
            )
        except Exception:
            logger.exception("Unhandled error in run_rag_agent_turn")
            return ChatResponse(
                reply=(
                    "We're experiencing a temporary technical issue. "
                    "Please try again in a moment."
                ),
                sources=[],
                route=None,
                sql=None,
                suggestions=[],
                cards=[],
                model_name=None,
                tokens_input=0,
                tokens_output=0,
            )
        return ChatResponse(
            reply=out["reply"],
            sources=out.get("sources") or [],
            route=out.get("route"),
            sql=out.get("sql"),
            suggestions=out.get("suggestions") or [],
            cards=out.get("cards") or [],
            model_name=out.get("model_name"),
            tokens_input=out.get("tokens_input") or 0,
            tokens_output=out.get("tokens_output") or 0,
        )

    @app.post("/v1/chat/stream")
    async def chat_stream(
        body: ChatRequest,
        request: Request,
        x_rag_secret: str | None = Header(default=None, alias="X-RAG-Agent-Secret"),
        authorization: str | None = Header(default=None),
    ) -> StreamingResponse:
        _verify_internal_secret(settings, x_rag_secret, authorization)
        hist = [{"role": m.role, "content": m.content} for m in body.history]
        logger.info(
            "chat_stream_request project_agent_id=%s user_message=%s history_len=%d",
            body.project_agent_id,
            (body.user_message or "")[:200],
            len(hist),
        )

        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
        loop = asyncio.get_running_loop()
        cancel_event = threading.Event()

        def emit(event: str, payload: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (event, payload))

        def worker() -> None:
            try:
                emit("start", {"project_agent_id": body.project_agent_id})

                def on_delta(delta: str) -> None:
                    if cancel_event.is_set():
                        raise RuntimeError("client_disconnected")
                    emit("delta", {"text": delta})

                def on_phase(name: str) -> None:
                    if cancel_event.is_set():
                        raise RuntimeError("client_disconnected")
                    emit("phase", {"name": name})

                out = run_rag_agent_turn(
                    settings=settings,
                    supabase=supabase,
                    embedder=embedder,
                    organization_id=body.organization_id,
                    project_id=body.project_id,
                    project_agent_id=body.project_agent_id,
                    user_message=body.user_message,
                    history=hist,
                    system_instruction=body.system_instruction,
                    model_config_overrides=body.generation_config,
                    on_reply_delta=on_delta,
                    on_phase=on_phase,
                )
                emit("done", out)
            except Exception as e:
                if str(e) == "client_disconnected":
                    emit("cancelled", {"message": "client_disconnected"})
                else:
                    logger.exception("Unhandled error in run_rag_agent_turn stream")
                    emit(
                        "error",
                        {
                            "message": (
                                "We're experiencing a temporary technical issue. "
                                "Please try again in a moment."
                            )
                        },
                    )
            finally:
                emit("end", {})

        threading.Thread(target=worker, daemon=True).start()

        async def event_gen():
            while True:
                if await request.is_disconnected():
                    cancel_event.set()
                    break
                event, payload = await queue.get()
                if event == "end":
                    break
                yield _sse_event(event, payload)

        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return app


# Uvicorn: `uvicorn api.app:create_app --factory`
