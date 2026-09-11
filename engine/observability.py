"""Langfuse tracing for one complete portfolio-chat turn.

The LangChain callback keeps model generations and LangGraph nodes automatic.
An explicit agent observation around it gives every turn a stable root with
useful input/output, session grouping, tags, and environment information.
"""
from __future__ import annotations

import logging
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

import config

log = logging.getLogger("twin")

TRACE_NAME = "twin-chat"
ROOT_OBSERVATION_NAME = "answer-portfolio-question"
GRAPH_RUN_NAME = "run-digital-twin"
TAGS = ["digital-twin", "langgraph", "rag"]


def _client():
    # config loads engine/.env before this lazy import initializes Langfuse.
    from langfuse import get_client

    return get_client()


def _callback_handler():
    from langfuse.langchain import CallbackHandler

    return CallbackHandler()


@dataclass
class ChatTrace:
    """The active root observation and the callback for its LangGraph child."""

    observation: Any = None
    callback: Any = None

    def run_config(self) -> dict:
        run: dict = {"run_name": GRAPH_RUN_NAME}
        if self.callback is not None:
            run["callbacks"] = [self.callback]
        return run

    def complete(self, answer: str, sources: list[str]) -> None:
        if self.observation is not None:
            self.observation.update(
                output={"answer": answer, "sources": sources},
                metadata={"source_count": len(sources)},
            )

    def cancel(self, partial_answer: str, sources: list[str]) -> None:
        if self.observation is not None:
            self.observation.update(
                output={"partial_answer": partial_answer, "sources": sources},
                level="WARNING",
                status_message="visitor disconnected before completion",
                metadata={"source_count": len(sources)},
            )

    def fail(self, error: BaseException, partial_answer: str, sources: list[str]) -> None:
        if self.observation is not None:
            self.observation.update(
                output={"partial_answer": partial_answer, "sources": sources},
                level="ERROR",
                status_message=f"chat turn failed ({type(error).__name__})",
                metadata={"source_count": len(sources)},
            )


def _close(stack: ExitStack) -> None:
    try:
        # Close without forwarding application exceptions. Child generations
        # retain provider errors, while the root status stays safe and concise.
        stack.close()
    except Exception as error:  # tracing must never break the chat
        log.warning(
            "[tracing] could not close Langfuse observation: %s", type(error).__name__
        )


@contextmanager
def chat_trace(message: str, history: list[dict], session_id: str | None) -> Iterator[ChatTrace]:
    """Create one agent trace for a turn and nest LangGraph callbacks under it."""
    if not config.LANGFUSE_ENABLED:
        yield ChatTrace()
        return

    stack = ExitStack()
    try:
        from langfuse import propagate_attributes

        observation = stack.enter_context(
            _client().start_as_current_observation(
                as_type="agent",
                name=ROOT_OBSERVATION_NAME,
                input={"message": message},
                metadata={"history_turns": len(history), "feature": "portfolio-chat"},
            )
        )
        stack.enter_context(
            propagate_attributes(
                trace_name=TRACE_NAME,
                session_id=session_id,
                tags=TAGS,
                environment=config.LANGFUSE_ENVIRONMENT,
                metadata={"feature": "portfolio-chat"},
            )
        )
        trace = ChatTrace(observation=observation, callback=_callback_handler())
    except Exception as error:
        _close(stack)
        log.warning(
            "[tracing] Langfuse unavailable; continuing without traces: %s",
            type(error).__name__,
        )
        yield ChatTrace()
        return

    try:
        yield trace
    finally:
        _close(stack)


@contextmanager
def retrieval_trace(queries: list[str]) -> Iterator[Any | None]:
    """Record the hybrid knowledge lookup with the semantic retriever type."""
    if not config.LANGFUSE_ENABLED:
        yield None
        return

    stack = ExitStack()
    try:
        observation = stack.enter_context(
            _client().start_as_current_observation(
                as_type="retriever",
                name="retrieve-context",
                input={"queries": queries},
                metadata={"index": "portfolio-knowledge"},
            )
        )
    except Exception as error:
        _close(stack)
        log.warning(
            "[tracing] could not start retrieval observation: %s",
            type(error).__name__,
        )
        yield None
        return

    try:
        yield observation
    finally:
        _close(stack)


def shutdown() -> None:
    """Drain queued observations and stop Langfuse during application shutdown."""
    if not config.LANGFUSE_ENABLED:
        return
    try:
        _client().shutdown()
    except Exception as error:  # shutdown should not hide the server's exit
        log.warning("[tracing] Langfuse shutdown failed: %s", type(error).__name__)
