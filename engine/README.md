# Digital Twin Engine

FastAPI service that powers the portfolio's digital-twin chatbot. Ships as a
runnable **stub** (keyword-matched, streamed) so the frontend pipe works with no
API key; swap the stub for a real RAG + tools + agent setup incrementally.

## Run

```bash
cd engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in when you wire the LLM
uvicorn app.main:app --reload --port 8000
```

The web app proxies `/api/*` to `http://localhost:8000` (see web/vite.config.ts),
so `POST /api/chat` from the frontend reaches this service in dev.

## API contract

`POST /chat`  →  `text/event-stream`

Request:
```json
{ "message": "What's your stack?", "history": [{"role": "user", "content": "hi"}] }
```

Each SSE event is `data: {json}\n\n`:
- `{"delta": "..."}`  incremental token(s)
- `{"card": {"title","subtitle","tags"}}`  optional rich project card
- `{"done": true}`  end of stream

`GET /health` → `{"status":"ok"}`

## Layout

```
engine/
├── app/main.py         FastAPI, CORS, /chat (SSE), /health
├── agent/orchestrator  reasoning loop  (STUB -> LangGraph agent)
├── rag/                ingest.py + retriever.py over knowledge/  (STUB)
├── tools/tools.py      get_projects / get_availability / notify_contact  (STUB)
├── knowledge/          markdown source of truth (RAG corpus)
├── eval/               eval_set.jsonl
├── observability.py    Langfuse hook  (STUB)
└── config.py
```

## Next steps (see repo README)
RAG over `knowledge/`, a LangGraph agent with `TOOLS`, Langfuse tracing, plus the
production concerns: rate limit, response cache, cheap model, spend cap, and a
fallback to the scripted answers when any of those trip.
