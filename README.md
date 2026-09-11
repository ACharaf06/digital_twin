# Charaf's Digital Twin

An AI-engineering portfolio presented as an interactive Three.js studio. A
rigged mascot reacts to visitors and to a streaming conversation grounded in
Charaf Achir's public profile, thesis, reports, and project documents.

## Product behavior

- The authored 3D mascot supports idle, wave, presentation, dance, jump, spin,
  gaze, orbit controls, picking, and reduced motion.
- The React chat streams grounded replies from a FastAPI/LangGraph engine and
  shows the source document labels used for an answer.
- If the engine is unavailable, the UI clearly switches to **Profile preview**
  and answers from the same structured public profile used by the engine.
- If hand or motion setup fails, the authored GLB stays visible in its neutral
  pose. If the GLB or WebGL cannot render, the stage stays empty while the
  portfolio and chat remain usable. There is no image fallback.

## Repository layout

```text
.
├── content/profile.json        public facts shared by browser and engine
├── web/                        React, TypeScript, Vite and Three.js
│   └── src/
│       ├── app/                application shell and studio state
│       ├── chat/               chat rendering and conversation lifecycle
│       ├── portfolio/          work and about views
│       ├── studio/             stage, authored rig, hands and motion
│       ├── assets/mascot/      the two browser GLBs
│       └── styles/             global and studio styles
├── engine/                     FastAPI and LangGraph service
│   ├── agent/                  route, grade, evidence and answer graph
│   ├── rag/                    lexical and dense retrieval
│   ├── eval/                   probe cases
│   └── knowledge/              committed retrieval index
├── assets-source/              rebuild inputs, never browser imports
│   ├── knowledge/              reports, thesis and project documents
│   └── mascot/                 original animated body
├── tools/                      index and mascot maintenance commands
└── docs/                       architecture and compatibility notes
```

The tree contains one frontend, one Python engine, one authored mascot path,
and one public profile source. Previous video, procedural mascot, Node/Ollama
engine, rejected models, and exploratory asset scripts remain available through
Git history rather than appearing as production options.

## Run locally

Use Node 22.12+ and Python 3.11+.

```bash
cd web
npm install
npm run dev
```

The site is available at the URL printed by Vite, usually
`http://localhost:5173`. It works in Profile preview without the engine.

To enable Live AI in another terminal:

```bash
cd engine
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# add OPENAI_API_KEY to .env
.venv/bin/python -m app.main
```

Vite proxies `/api/*` to `http://localhost:8000` and removes the `/api`
prefix. `GET http://127.0.0.1:8000/health` reports whether the model and index
are ready.

## Architecture

```text
React studio
  ├─ authored Three.js mascot
  ├─ content/profile.json ───────────────┐
  └─ POST /api/chat                     │
       │                                │
       ▼                                ▼
FastAPI ── LangGraph route → retrieve → grade → evidence → generate
                       │
                       └─ committed hybrid index
                            ▲
                            └─ assets-source/knowledge
```

Questions that need documents are rewritten in English and French. The engine
fuses BM25F keyword rankings with OpenAI embeddings, grades candidate passages,
adds useful adjacent passages, and streams the grounded response as SSE. The
structured profile is always present in the system context, so common facts do
not depend on a retrieval hit. See [engine/README.md](engine/README.md) for the
protocol and retrieval design.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Routing, grading, answers and query embeddings. |
| `MODEL` | Chat model; defaults to `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible endpoint. |
| `OPENAI_MAX_RETRIES` | Retries per model call. |
| `TWIN_PORT` | Engine port; defaults to `8000`. |
| `ALLOWED_ORIGIN` | Comma-separated browser origins allowed by CORS. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Optional tracing. |
| `TWIN_ENGINE_URL` | Vite development proxy target. |
| `VITE_ENGINE_URL` | Frontend API base compiled into the browser build. |

Never place a secret in a `VITE_*` variable because Vite exposes it to the
browser.

## Verification

Install `engine/requirements-dev.txt` when setting up a development environment,
then run:

```bash
cd web
npm run build
npm run format:check
npm test
npm run test:engine
```

The browser tests cover authored geometry and motion, orbit and picking,
responsive layouts, chat streaming and cancellation, profile fallback, real
contact links, reduced motion, neutral-GLB fallback, and the empty WebGL
fallback. Engine tests run against a local mock OpenAI server and never use the
developer's key.

The free retrieval probe reads its cases from `engine/eval/retrieval.json`:

```bash
TWIN_NO_DOTENV=1 OPENAI_API_KEY= engine/.venv/bin/python tools/knowledge/probe.py
```

Use `--graph` only when intentionally evaluating the real configured model.

## Maintenance

- Edit public facts once in `content/profile.json`.
- Rebuild the committed index with `tools/knowledge/build-index.py` after
  changing `assets-source/knowledge/`, then run the retrieval probe.
- Open `/motion-lab.html` during development to inspect authored motion. This
  entry is not included in the production build.
- Read [tools/mascot/README.md](tools/mascot/README.md) before rebuilding a GLB.
- [docs/refonte.md](docs/refonte.md) records the cleanup decisions and recovery
  locations for removed history.

Offline index and mascot rebuilds use their own small environment:

```bash
python3.11 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
```

`npm run build` writes the static frontend to `web/dist`. Live AI requires the
Python engine behind an HTTPS `/api` reverse proxy in production.
