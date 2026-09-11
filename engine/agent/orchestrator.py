"""One chat turn: run the twin graph and turn its stream into SSE events.

The graph streams two kinds of event: the answer's tokens (LangGraph's
"messages" mode, filtered to the generate node so the router's and grader's
structured replies never reach the visitor) and the sources announcement the
generate node writes before its first token ("custom" mode).
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

import config
from agent.graph import build_graph
from observability import run_config
from rag.retriever import KnowledgeIndex

log = logging.getLogger("twin")

index = KnowledgeIndex(
    config.KNOWLEDGE_DIR,
    openai_api_key=config.OPENAI_API_KEY,
    openai_base_url=config.OPENAI_BASE_URL,
    max_retries=config.OPENAI_MAX_RETRIES,
)
_graph = None


def graph():
    # Built on first use: without a key there is nothing to build, and /health
    # already reports that.
    global _graph
    if _graph is None:
        _graph = build_graph(
            index,
            model=config.MODEL,
            api_key=config.OPENAI_API_KEY,
            base_url=config.OPENAI_BASE_URL,
            max_retries=config.OPENAI_MAX_RETRIES,
        )
    return _graph


async def stream_reply(message: str, history: list[dict]) -> AsyncIterator[dict]:
    """Yields {"sources": [...]} at most once, then {"delta": "..."} events."""
    stream = graph().astream(
        {"message": message, "history": history},
        config=run_config(),
        stream_mode=["messages", "custom"],
    )
    try:
        async for mode, payload in stream:
            if mode == "custom":
                yield payload
                continue
            chunk, metadata = payload
            if metadata.get("langgraph_node") == "generate" and isinstance(chunk.content, str) and chunk.content:
                yield {"delta": chunk.content}
    finally:
        # Closing the graph's stream cancels its running node, and with it the
        # model request. Without this a visitor who leaves keeps paying for tokens.
        await stream.aclose()
