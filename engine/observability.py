"""Langfuse tracing: each chat turn becomes one trace, with a span per graph
node and every model call's prompt, output, tokens and latency.

Enabled only when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set
(LANGFUSE_HOST defaults to Langfuse Cloud). Traces contain what visitors type,
so turning this on sends their messages to Langfuse.
"""
from __future__ import annotations

import config

TRACE_NAME = "twin-chat"
TAGS = ["digital-twin", "langgraph", "rag"]


def run_config() -> dict:
    """LangChain run config for one turn: callbacks plus trace attributes."""
    run: dict = {
        "run_name": TRACE_NAME,
        "metadata": {"langfuse_trace_name": TRACE_NAME, "langfuse_tags": TAGS},
    }
    if config.LANGFUSE_ENABLED:
        from langfuse.langchain import CallbackHandler

        run["callbacks"] = [CallbackHandler()]
    return run


def flush() -> None:
    """Send buffered traces before the process exits."""
    if config.LANGFUSE_ENABLED:
        from langfuse import get_client

        get_client().flush()
