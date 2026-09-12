"""Langfuse's real SDK receives a useful, nested turn trace without HTTP."""
import json

from langfuse import Langfuse
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

import observability


def test_chat_and_retrieval_observations_have_the_right_shape(monkeypatch):
    exporter = InMemorySpanExporter()
    client = Langfuse(public_key="pk-test", secret_key="sk-test", span_exporter=exporter)
    callback = object()
    monkeypatch.setattr(observability.config, "LANGFUSE_ENABLED", True)
    monkeypatch.setattr(observability.config, "LANGFUSE_ENVIRONMENT", "test")
    monkeypatch.setattr(observability, "_client", lambda: client)
    monkeypatch.setattr(observability, "_callback_handler", lambda: callback)

    with observability.chat_trace("What did you build?", [{"role": "user"}], "session-123") as trace:
        assert trace.run_config() == {
            "run_name": "run-digital-twin",
            "callbacks": [callback],
        }
        with observability.retrieval_trace(["what did you build"]) as retrieval:
            retrieval.update(output={"documents": [{"content": "A grounded passage"}]})
        trace.complete("I built an agent.", ["my project report"])

    client.flush()
    spans = {span.name: span for span in exporter.get_finished_spans()}
    root = spans["answer-portfolio-question"]
    retrieval = spans["retrieve-context"]

    assert root.attributes["langfuse.observation.type"] == "agent"
    assert json.loads(root.attributes["langfuse.observation.input"]) == {
        "message": "What did you build?"
    }
    assert json.loads(root.attributes["langfuse.observation.output"]) == {
        "answer": "I built an agent.",
        "sources": ["my project report"],
    }
    assert root.attributes["langfuse.trace.name"] == "twin-chat"
    assert root.attributes["langfuse.environment"] == "test"
    assert root.attributes["session.id"] == "session-123"
    assert set(root.attributes["langfuse.trace.tags"]) == {"digital-twin", "langgraph", "rag"}
    assert retrieval.attributes["langfuse.observation.type"] == "retriever"
    assert retrieval.parent.span_id == root.context.span_id
    client.shutdown()


def test_tracing_is_a_no_op_without_credentials(monkeypatch):
    monkeypatch.setattr(observability.config, "LANGFUSE_ENABLED", False)
    with observability.chat_trace("hello", [], None) as trace:
        assert trace.run_config() == {"run_name": "run-digital-twin"}
        trace.complete("hi", [])
    with observability.retrieval_trace(["hello"]) as retrieval:
        assert retrieval is None
