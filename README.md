# digital_twin

Creative portfolio with a stop-motion background scene and an interactive
**digital-twin** chatbot. Monorepo, two independent parts.

```
my_portfolio/
├── web/        Vite + React + TypeScript + Tailwind frontend
├── engine/     FastAPI GenAI service (RAG + tools + agent) — see engine/README.md
├── assets/     raw source media (generation stills, source videos)
├── docs/       plans & notes (e.g. mobile-compatibility.md)
└── README.md
```

## Run it

**Frontend**
```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

**Engine** (optional in dev — the frontend works with scripted answers alone)
```bash
cd engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
The frontend proxies `/api/*` → the engine on `:8000` (web/vite.config.ts).

## How the two connect

The chat UI (`web/src/components/DigitalTwin.tsx`) currently answers from a local
scripted `getReply()`. `web/src/lib/twinClient.ts` already implements the engine
contract (`POST /api/chat`, SSE). To go live: call `streamChat()` from the
component and keep `getReply()` as the fallback.

Contract: `POST /chat` streams `data: {json}\n\n` events —
`{"delta": "..."}`, optional `{"card": {...}}`, then `{"done": true}`.

## Deploy (later)

- **web/** → any static host (Vercel / Netlify / Cloudflare Pages).
- **engine/** → a small server (Railway / Render / Fly) or serverless. Set
  `ALLOWED_ORIGIN` to the deployed frontend and `VITE_ENGINE_URL` to the engine URL.

## Roadmap

- Engine: RAG over `engine/knowledge/`, a LangGraph agent using `TOOLS`, Langfuse
  tracing; then rate-limit + cache + cheap model + spend cap, with the scripted
  answers as the degraded-mode fallback.
- Mobile pass: see `docs/mobile-compatibility.md`.
- View 2: "inside the laptop" content + the zoom transition.
