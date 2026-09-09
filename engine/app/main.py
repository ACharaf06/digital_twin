"""FastAPI entrypoint for the digital-twin engine.

Run (from engine/):
    uvicorn app.main:app --reload --port 8000

Contract:
    POST /chat   { "message": str, "history": [{"role","content"}] }
    -> text/event-stream, each event is `data: {json}\n\n`:
         {"delta": "..."}   incremental token(s)
         {"card": {...}}    optional rich project card
         {"done": true}     end of stream
"""
from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.orchestrator import stream_reply
from config import ALLOWED_ORIGIN

app = FastAPI(title="Charaf Digital Twin Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGIN.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Turn] = Field(default_factory=list)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    history = [t.model_dump() for t in req.history]

    async def event_stream():
        async for chunk in stream_reply(req.message, history):
            yield _sse(chunk)
        yield _sse({"done": True})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
