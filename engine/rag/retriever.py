"""Retrieval over engine/knowledge.

STUB. Returns nothing so the agent falls back gracefully. Wire a real vector
store built by ingest.py.
"""
from __future__ import annotations

from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


def retrieve(query: str, k: int = 4) -> list[str]:
    # TODO: embed `query`, search the vector store, return top-k chunks.
    _ = (query, k, KNOWLEDGE_DIR)
    return []
