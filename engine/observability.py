"""Langfuse tracing hook.

STUB. When you wire the real agent, wrap its run in a Langfuse trace so every
twin answer is observable (a great thing to show recruiters). Set the
LANGFUSE_* vars in .env first.
"""
from config import LANGFUSE_ENABLED


def get_handler():
    # TODO: return a configured Langfuse callback handler / client.
    #   from langfuse.callback import CallbackHandler
    #   return CallbackHandler()
    if not LANGFUSE_ENABLED:
        return None
    return None
