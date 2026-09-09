"""The twin's reasoning loop.

STUB IMPLEMENTATION. Right now this keyword-matches over a small in-code
knowledge base and streams the answer word by word, so the whole frontend ->
engine pipe is testable with no API key.

TODO — replace `stream_reply` with a real agent:
    1. context = retrieve(message)            # RAG over ../knowledge
    2. run a LangGraph agent: LLM + TOOLS + retrieved context + history
    3. stream the model's tokens as {"delta": ...}
    4. surface tool results (e.g. a project) as {"card": ...}
    5. wrap the run in a Langfuse trace (see observability.get_handler)
Keep the scripted answers below as the graceful fallback for when the LLM is
unavailable, rate-limited, or over the spend cap.
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from rag.retriever import retrieve  # noqa: F401  (used once RAG is wired)

ANIME_CARD = {
    "title": "Live Anime Style Transfer",
    "subtitle": "Real-time webcam anime filter, switched with Naruto hand-signs.",
    "tags": ["AnimeGANv2", "PyTorch / MPS", "MediaPipe", "Real-time"],
}
CHATBOT_CARD = {
    "title": "LCP Configuration Chatbot",
    "subtitle": "RAG + function-calling assistant for Amadeus' loyalty platform.",
    "tags": ["RAG", "Function calling", "LangGraph", "Azure OpenAI"],
}


def _match(message: str) -> dict:
    q = message.lower()

    def has(*ks: str) -> bool:
        return any(k in q for k in ks)

    if has("amadeus", "work on", "do at", "current", "octomind"):
        return {
            "text": "At Amadeus I build GenAI for LCP, their loyalty platform. I shipped a "
            "configuration-chatbot POC solo, then the use cases earned their own team, "
            "OctoMind, to take them toward production.",
            "card": CHATBOT_CARD,
        }
    if has("project", "standout", "best", "built", "show"):
        return {
            "text": "My favourite is a creative one: real-time anime style transfer over a live "
            "webcam, with Naruto hand-signs to switch modes.",
            "card": ANIME_CARD,
        }
    if has("stack", "skill", "tech", "tool"):
        return {
            "text": "Applied AI end to end: RAG, function calling and agents with LangChain and "
            "LangGraph, on Azure OpenAI, LiteLLM for routing, Langfuse for observability. "
            "Python-first."
        }
    if has("available", "hire", "cdi", "looking", "position"):
        return {
            "text": "The Amadeus apprenticeship runs to September 2026, so I'm open to a permanent "
            "AI Engineer role from then. Happy to talk sooner."
        }
    return {
        "text": "Ask me about Charaf's work at Amadeus, his stack, his projects, his studies, or "
        "how to reach him."
    }


async def stream_reply(message: str, history: list[dict]) -> AsyncGenerator[dict, None]:
    reply = _match(message)
    for word in reply["text"].split(" "):
        yield {"delta": word + " "}
        await asyncio.sleep(0.02)
    if reply.get("card"):
        yield {"card": reply["card"]}
