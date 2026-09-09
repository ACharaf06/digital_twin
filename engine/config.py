"""Runtime configuration, loaded from environment (.env)."""
import os

from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("MODEL", "gpt-4o-mini")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
LANGFUSE_ENABLED = bool(os.getenv("LANGFUSE_PUBLIC_KEY"))
