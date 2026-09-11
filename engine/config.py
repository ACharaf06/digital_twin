"""Runtime configuration, read from the environment and engine/.env."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ENGINE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_DIR = ENGINE_DIR / "knowledge"

# Tests set TWIN_NO_DOTENV so the developer's real keys (OpenAI, Langfuse) can
# never leak into a test run. Variables already in the environment always win.
if not os.getenv("TWIN_NO_DOTENV"):
    load_dotenv(ENGINE_DIR / ".env")

# An empty `LANGFUSE_HOST=` line is read by the SDK as the host itself (""), with
# no fallback to its default. Unset empty values so the default applies.
for _name in ("LANGFUSE_HOST", "LANGFUSE_BASE_URL"):
    if not os.environ.get(_name, "").strip():
        os.environ.pop(_name, None)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "").strip() or None
OPENAI_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "2"))
MODEL = os.getenv("MODEL", "").strip() or "gpt-4o-mini"
TWIN_PORT = int(os.getenv("TWIN_PORT", "8000"))
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
LANGFUSE_ENABLED = bool(
    os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    and os.getenv("LANGFUSE_SECRET_KEY", "").strip()
)
LANGFUSE_ENVIRONMENT = (
    os.getenv("LANGFUSE_TRACING_ENVIRONMENT", "development").strip() or "development"
)
