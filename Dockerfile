# The chat engine, for a host that starts the container and hands it $PORT.
#
# The build context is the repository root, not engine/: agent/prompts.py
# resolves content/profile.json from two directories above itself, so the
# engine only runs inside the repository layout it was written for. The image
# mirrors that layout rather than flattening it.
#
# The committed retrieval index ships inside the image, so a cold start reads
# it from local disk rather than fetching it: boot to a served /health is well
# under a second, which is what keeps a scale-to-zero deployment from showing
# visitors "AI unavailable" while it wakes.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/engine

# Dependencies first: they change far less often than the engine itself, so
# edits to the code rebuild only the layers below this one.
COPY engine/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The one file the engine reads from outside its own directory. It is the
# single source for public identity, so the browser and the engine share it.
COPY content/profile.json /app/content/profile.json
COPY engine/ /app/engine/

# Imports are top-level (config, agent, app), so the working directory above is
# part of the contract. Binding 0.0.0.0 is deliberate here and safe: the only
# route to this port is the host's own front end. The 127.0.0.1 in main.py's
# __main__ block is for running the engine directly in development.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
