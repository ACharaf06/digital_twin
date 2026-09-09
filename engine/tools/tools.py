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


def notify_contact(name: str, message: str, reply_to: str) -> dict:
    """Notify Charaf that someone reached out via the twin."""
    # TODO: send an email / webhook / store the lead.
    _ = (name, message, reply_to)
    return {"status": "queued"}


TOOLS = [get_projects, get_availability, notify_contact]
