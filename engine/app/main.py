"""HTTP face of the twin: GET /health and POST /chat as server-sent events.

Run from engine/:
    .venv/bin/python -m app.main          # http://127.0.0.1:8000 (TWIN_PORT)

Contract:
    POST /chat {"message": str, "history": [...], "sessionId": str?}
    -> text/event-stream of `data: {json}` frames:
         {"sources": ["my thesis", ...]}   documents the answer draws on, first, when any
         {"delta": "..."}                   answer tokens
         {"done": true}                     end of stream
    400 for an invalid body, 413 over 40 KB, 503 when the model cannot answer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from contextlib import asynccontextmanager

import anyio
import openai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

import config
import observability
from agent import orchestrator

log = logging.getLogger("twin")
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

MAX_BODY = 40_000
MAX_MESSAGE = 2_000
# Kept short on purpose: the prompt also carries the profile and the excerpts.
HISTORY_TURNS = 6
TURN_CHARS = 800
MODEL_CHECK_TTL = 600.0  # /health runs on every page load; the model rarely vanishes

_model_checked = float("-inf")
_client: openai.AsyncOpenAI | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    index = orchestrator.index
    if index.embed_model:
        log.info("[retrieval] %d passages, hybrid: BM25 + %s:%s", index.size, index.embed_provider, index.embed_model)
    else:
        log.info("[retrieval] %d passages, lexical only (%s)", index.size, index.dense_inactive_reason)
    if not config.OPENAI_API_KEY:
        log.info("[model] OPENAI_API_KEY is not set: /chat answers 503 and the studio disables chat")
    log.info("[tracing] %s", "Langfuse" if config.LANGFUSE_ENABLED else "off")
    yield
    observability.shutdown()


app = FastAPI(title="Charaf Digital Twin Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in config.ALLOWED_ORIGIN.split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _frame(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


class Relay:
    """One reply, produced in a task of its own and read through a queue.

    When a visitor disconnects, Starlette cancels the response inside an anyio
    cancel scope, which keeps re-cancelling every await in it -- including the
    graph's own cleanup, so the model request would run on unread. A separate
    task is outside that scope: cancelling it unwinds the graph normally.
    """

    _END = object()

    def __init__(self, events) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()
        self._task = asyncio.create_task(self._pump(events))

    async def _pump(self, events) -> None:
        try:
            async for event in events:
                self._queue.put_nowait(event)
            self._queue.put_nowait(self._END)
        except Exception as error:  # handed to the reader, which decides
            self._queue.put_nowait(error)

    def __aiter__(self):
        return self

    async def __anext__(self) -> dict:
        item = await self._queue.get()
        if item is self._END:
            raise StopAsyncIteration
        if isinstance(item, Exception):
            raise item
        return item

    async def aclose(self) -> None:
        self._task.cancel()
        with anyio.CancelScope(shield=True):
            await asyncio.wait({self._task})


def clean_history(raw) -> list[dict]:
    """The last few user/assistant turns, each clamped. Anything else -- a
    client-supplied "system" turn included -- never reaches the model."""
    if not isinstance(raw, list):
        return []
    turns = [
        turn
        for turn in raw
        if isinstance(turn, dict)
        and turn.get("role") in ("user", "assistant")
        and isinstance(turn.get("content"), str)
        and turn["content"].strip()
    ]
    return [{"role": t["role"], "content": t["content"][:TURN_CHARS]} for t in turns[-HISTORY_TURNS:]]


def clean_session_id(raw) -> str | None:
    """Accept opaque browser session ids without letting them become telemetry noise."""
    if not isinstance(raw, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", raw):
        return None
    return raw


@app.get("/health")
async def health():
    global _model_checked, _client
    index = orchestrator.index
    body = {
        "provider": "openai",
        "model": config.MODEL,
        "engine": "langgraph",
        "tracing": {
            "enabled": config.LANGFUSE_ENABLED,
            "provider": "langfuse" if config.LANGFUSE_ENABLED else None,
            "environment": config.LANGFUSE_ENVIRONMENT if config.LANGFUSE_ENABLED else None,
        },
        "retrieval": {
            "ready": index.ready,
            "passages": index.size,
            "embedProvider": index.embed_provider,
            "embedModel": index.embed_model,
        },
    }
    if not config.OPENAI_API_KEY:
        return JSONResponse({"status": "offline", "reason": "OPENAI_API_KEY is not set", **body}, 503)
    if time.monotonic() - _model_checked > MODEL_CHECK_TTL:
        _client = _client or openai.AsyncOpenAI(
            api_key=config.OPENAI_API_KEY, base_url=config.OPENAI_BASE_URL, max_retries=0
        )
        try:
            await _client.models.retrieve(config.MODEL, timeout=3)
        except openai.NotFoundError:
            return {"status": "model-missing", **body}
        except openai.OpenAIError:
            return JSONResponse({"status": "offline", **body}, 503)
        _model_checked = time.monotonic()
    return {"status": "ready", **body}


@app.post("/chat")
async def chat(request: Request):
    received = bytearray()
    async for chunk in request.stream():
        received += chunk
        if len(received) > MAX_BODY:
            return _error(413, "request too large")
    try:
        data = json.loads(received)
    except ValueError:
        return _error(400, "invalid JSON")
    message = data.get("message") if isinstance(data, dict) else None
    if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE:
        return _error(400, "invalid message")
    if not config.OPENAI_API_KEY:
        return _error(503, "model unavailable")

    events = Relay(
        orchestrator.stream_reply(
            message,
            clean_history(data.get("history")),
            clean_session_id(data.get("sessionId")),
        )
    )
    # Hold the response until the first token. Routing, retrieval and grading
    # all happen before it, so a failure there -- a rate limit, an outage -- is
    # still a clean 503 the studio can fall back from, not a half-open stream.
    head: list[dict] = []
    started = time.perf_counter()
    try:
        async for event in events:
            head.append(event)
            if "delta" in event:
                break
    except Exception as error:  # noqa: BLE001 -- any failure here means no answer
        await events.aclose()
        log.warning("[chat] no answer: %s: %s", type(error).__name__, error)
        return _error(503, "model unavailable")
    log.info("[chat] first token after %.2fs", time.perf_counter() - started)

    async def stream():
        try:
            for event in head:
                yield _frame(event)
            async for event in events:
                yield _frame(event)
            yield _frame({"done": True})
        except Exception as error:
            # The headers are gone, so the stream just ends without "done";
            # the studio keeps what arrived.
            log.warning("[chat] stream cut: %s: %s", type(error).__name__, error)
            raise
        finally:
            await events.aclose()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn

    log.info("Charaf's twin: http://127.0.0.1:%d (%s, LangGraph)", config.TWIN_PORT, config.MODEL)
    uvicorn.run(app, host="127.0.0.1", port=config.TWIN_PORT, log_level="warning")
