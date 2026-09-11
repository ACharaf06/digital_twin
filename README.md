# Charaf's Digital Twin

A personal AI-engineering portfolio built as an interactive 3D studio: a cartoon
mascot of Charaf that reacts to the pointer and to a streaming conversation. The
chat is a digital twin that answers from Charaf's own documents (his thesis,
internship and apprenticeship reports, project notes) through an agentic RAG
engine written in Python with FastAPI and LangGraph on OpenAI `gpt-4o-mini`.

## What works today

- **The studio:** a close-up entrance that pulls back into an unframed 3D
  studio, with a Tripo character on a 41-bone skeleton and locally authored
  performances: idle, wave, presentation gestures, dance, jump and turn.
  Five-finger hands, head tracking, orbit controls, head/hand/body picking, a
  geometry view, confetti, and a usable WebGL fallback.
- **Live chat:** grounded answers streamed from the engine, with a line naming
  the documents used ("Grounded in my thesis"). Answers come in the visitor's
  language even though most of the sources are French. Listening, thinking and
  speaking drive the character; browser voice is optional.
- **Offline chat:** without the engine the chat is labelled **Profile preview**
  and answers from written profile text, so the site never depends on the API.
- **Portfolio views:** project details and the real email, LinkedIn and GitHub
  contacts. Desktop and mobile layouts, and reduced-motion behaviour.

## Repository layout

```text
.
├── web/        Vite, React, TypeScript and Three.js studio
├── engine/     FastAPI + LangGraph chat engine (Python 3.11+)
├── tools/      knowledge index builder and probe; mascot asset pipeline
├── assets/     source media: 3D models, portrait, knowledge documents
├── docs/       motion, asset pipeline, portrait and mobile notes
└── README.md
```

## Run the website

Use Node 22.12 or newer (tested with Node 25).

```sh
cd web
npm install
npm run dev
```

Vite prints the local address, normally `http://localhost:5173`. On its own the
site runs in Profile preview.

## Run the chat engine

Use Python 3.11 or newer.

```sh
cd engine
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # then set OPENAI_API_KEY
.venv/bin/python -m app.main    # http://127.0.0.1:8000
```

The Vite development server proxies `/api/*` to port 8000 and removes the
`/api` prefix, so the studio's `/api/chat` reaches the engine's `/chat`. When
`/health` reports `ready`, the console switches from Profile preview to
**Live AI**. Check it directly with `curl http://127.0.0.1:8000/health`.

The OpenAI key's quota limits how much the twin can answer: a grounded answer
takes three `gpt-4o-mini` requests (route, grade, answer). On a free-tier key
(50 requests a day) that is about 15 answers a day; past it the studio falls
back to Profile preview.

## How the chat works

```text
Browser · TwinConsole.tsx
  └─ POST /api/chat ──> Vite proxy ──> FastAPI engine (:8000)
                                         └─ LangGraph: route → retrieve → grade → evidence → generate
                                              ├─ OpenAI gpt-4o-mini: route, grade, answer
                                              ├─ OpenAI embeddings: the question only
                                              └─ committed index: 793 passages from assets/knowledge
  <── SSE frames: {"sources":[…]} → {"delta":"…"} … → {"done":true}
```

Each turn decides whether the question needs the documents and rewrites it in
English and French, because most of the corpus is French. It then searches the
index by keywords and embeddings, has the model keep only the passages that
help, and answers from those alone. When nothing relevant is found it says so.
On the project's probe, the pipeline reaches the answer for 8 of 8 English
questions whose answer exists only in French, against 5 of 8 for search alone.
[engine/README.md](engine/README.md) covers the graph, retrieval, the SSE
contract, the measurements and the design trade-offs.

The twin cannot contact anyone or take actions outside the conversation, and
never claims to be the real Charaf.

## Configuration

`engine/.env.example` lists the engine settings; copy it to `engine/.env`.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Answers, routing, grading and question embeddings. Without it the engine reports offline. |
| `MODEL` | Chat model, `gpt-4o-mini` by default. |
| `OPENAI_MAX_RETRIES` | Retries per model call on rate limits and server errors. |
| `TWIN_PORT` | Engine port, `8000` by default. |
| `ALLOWED_ORIGIN` | Comma-separated browser origins allowed by CORS. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Optional tracing: one Langfuse trace per chat turn. |
| `TWIN_ENGINE_URL` | Points the Vite development proxy at another engine. |
| `VITE_ENGINE_URL` | Frontend API base, set at build time. |

`VITE_*` variables are compiled into the public site, so never put a key in
one. Langfuse traces include what visitors type; mention it in the privacy
notice if tracing is on.

## Verification

```sh
cd web
npm run build
npm test                 # Playwright studio tests
npm run test:engine      # engine tests, against a mock OpenAI API
```

Browser tests use installed Chrome on macOS; otherwise run
`npx playwright install chromium` or set `CHROME_PATH`. They cover canvas
pixels, movement, geometry mode, orbit and picking, seven viewport sizes, chat,
projects, contacts, reduced motion and the WebGL fallback. Motion tests also
measure foot contact, jump clearance, interruption continuity, hand deformation
and timing at 30/60/120 fps. Engine tests start the real engine against a local
mock of the OpenAI API, so they never spend quota.

To measure answer quality on the real index:

```sh
engine/.venv/bin/python tools/knowledge/probe.py            # search only, free
engine/.venv/bin/python tools/knowledge/probe.py --graph    # the full pipeline, uses the model
```

For a motion scrubber, open `/motion-lab.html?authored`; the original Tripo
clips are at `/motion-lab.html`. Neither page ships in the production build.

## Main files

- `web/src/components/MascotStage.tsx`: camera, lighting, interaction, animation.
- `web/src/components/TwinConsole.tsx`: chat, sources line and portfolio views.
- `web/src/lib/mascotMotion.ts`: performance poses, limb IK, transitions and gaze.
- `web/src/lib/mascotHands.ts`: hand attachment, wrist skinning and finger poses.
- `web/src/lib/portfolio.ts`: public facts, contacts and Profile preview answers.
- `engine/app/main.py`: the HTTP contract, validation and streaming.
- `engine/agent/graph.py`: the LangGraph pipeline.
- `engine/rag/retriever.py`: keyword and embedding search over the index.
- `engine/knowledge/`: the always-on profile and the committed index.
- `tools/knowledge/build-index.py`: builds the index from `assets/knowledge/`.

Keep the frontend facts in `portfolio.ts` and the engine's `knowledge/*.md` in
sync: they answer the same questions in the two modes.

## Deployment

`npm run build` produces `web/dist`, which any static host can serve; on its
own it runs in Profile preview. Live AI needs the engine hosted separately
behind an HTTPS reverse proxy for `/api`, since Vite's development proxy is not
part of the build. Before exposing it publicly, add per-visitor rate limits, a
spend cap or a paid tier on the OpenAI key, and a privacy notice covering
OpenAI (and Langfuse, if enabled). The engine binds to `127.0.0.1` on purpose.
