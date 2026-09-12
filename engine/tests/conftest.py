"""Guards that must run before any test module imports config.

config reads engine/.env at import time, so the developer's real OpenAI and
Langfuse credentials would land in the test process the moment a test imports
observability or app.main. pytest loads conftest before test modules, which
makes this the only place the documented invariant -- tests never read
engine/.env, never spend quota, never trace -- can actually be enforced.
"""
import os

os.environ["TWIN_NO_DOTENV"] = "1"
