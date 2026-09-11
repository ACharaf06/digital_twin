"""Tools the twin agent can call.

STUB signatures. Wire these to real data / actions, then expose TOOLS to the
LangGraph agent as function-calling tools.
"""
from __future__ import annotations


def get_projects(topic: str | None = None) -> list[dict]:
    """Return Charaf's projects, optionally filtered by a topic keyword."""
    # TODO: source from knowledge/ or a structured file.
    return [
        {"name": "LCP Configuration Chatbot", "tags": ["RAG", "LangGraph", "Azure OpenAI"]},
        {"name": "Live Anime Style Transfer", "tags": ["AnimeGANv2", "MediaPipe"]},
    ]


def get_availability() -> dict:
    """Return Charaf's current availability for roles."""
    return {"apprenticeship_until": "2026-09", "open_to": "CDI / AI Engineer from Sept 2026"}


# No contact or messaging tool: the twin tells visitors it cannot contact anyone
# or act outside the conversation, and a tool that did would make that untrue.
TOOLS = [get_projects, get_availability]
