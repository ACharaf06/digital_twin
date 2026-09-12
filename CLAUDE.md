# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository contains Charaf Achir's interactive 3D portfolio and its
grounded chat engine. Keep the shipping path singular: one React frontend, one
Python engine, one authored mascot implementation, and one structured profile.

## Run and verify

```bash
cd web && npm install && npm run dev
cd web && npm run build
cd web && npm run format:check
cd web && npm test
cd web && npm run test:engine
```

The engine uses Python 3.11+. Install `engine/requirements-dev.txt` for tests.
Tests set `TWIN_NO_DOTENV=1` and use a local mock OpenAI server; they must never
read `engine/.env` or spend real API quota.

Run the engine from `engine/`; its imports are top-level (`config`, `agent`,
`app`) and `pytest.ini` sets `pythonpath = .`, so another working directory
fails:

```bash
cd engine && python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cd engine && .venv/bin/python -m app.main   # 127.0.0.1:8000; Vite proxies /api/* here
```

Without `OPENAI_API_KEY` the engine still starts: `/health` reports `offline`,
`/chat` answers 503, and the studio shows **AI unavailable** and emits no reply.

A single test:

```bash
cd engine && .venv/bin/python -m pytest tests/test_server.py -k sources
cd web && npx playwright test tests/motion.spec.ts -g "jump crouches"
```

`npm test` is Playwright against real WebGL. It starts its own Vite server on
`127.0.0.1:5174` (reusing one already there), runs serially with one worker, and
launches the macOS Chrome at `/Applications/Google Chrome.app`; override that
with `CHROME_PATH`.

## Ownership

- `content/profile.json` is the only source for public identity, contact,
  availability, education, experience, stack, and project summaries. Both the
  browser (`web/src/lib/portfolio.ts`) and the engine read it; restart the
  engine after editing it.
- `web/src/app/App.tsx` owns shell-level view, mood, action, voice, and entrance
  state. `web/src/components/TwinConsole.tsx` is a thin composition layer.
- `web/src/chat/` owns engine health, streaming, cancellation, messages, speech,
  and chat rendering. `web/src/lib/twinClient.ts` owns the SSE wire format.
- `web/src/portfolio/` renders the work, studies, and about views.
- `web/src/studio/` owns the Three.js stage, authored skeletal motion, hands,
  rig setup, picking, and disposal.
- `web/src/assets/mascot/` contains the only browser GLBs.
- `engine/` is the only server implementation. Its LangGraph route is route →
  retrieve → grade → evidence → generate. The root `Dockerfile` is how it is
  deployed; `python -m app.main` is for development only. The build context is
  the repository root, not `engine/`: `agent/prompts.py` resolves
  `content/profile.json` from two directories above itself, so the engine only
  runs inside the repository layout.
- `assets-source/knowledge/` contains index inputs;
  `engine/knowledge/{index.json,index-vectors.bin}` is the committed runtime
  index.

## Cross-file contracts

`POST /chat` streams SSE frames: an optional `{"sources":[...]}` first, then
`{"delta":"..."}` tokens, then `{"done":true}`. Clients must tolerate a missing
`sources` frame. The response is withheld until the first token exists, so a
failure anywhere before it is a clean 503 rather than a truncated stream. This
contract spans `engine/app/main.py`, `web/src/lib/twinClient.ts`, and
`web/src/chat/useTwinChat.ts`; change all three together. See
`engine/README.md` for the graph, retrieval, and observability design.

The stage is imperative under a thin React adapter:
`MascotStage.tsx` → `createStage.ts` → `rig.ts` → `motion.ts` / `hands.ts`.
`createStage` receives live state through a ref (not props) and returns a
disposer, so the React layer never re-runs the effect on state changes.

## Invariants

- If the hand or motion setup fails after the body GLB loads, show that same
  authored character in its neutral pose. If WebGL or the body GLB fails, leave
  the stage empty and keep the portfolio/chat usable. Never introduce a bitmap
  mascot fallback.
- Respect `prefers-reduced-motion`; the rig must remain stable in its neutral
  pose and UI motion must stop.
- Keep the twin grounded. It never claims to be the human, invents personal
  facts, sends messages, or claims to act outside the conversation. There is no
  local or canned answer path in the browser.
- Keep secrets in `engine/.env`. A `VITE_*` variable is public browser data.
  `engine/tests/conftest.py` sets `TWIN_NO_DOTENV` before any test imports
  `config`, which is what keeps real keys out of the test process — importing
  `config` loads `.env` as a side effect, so don't remove it.
- `/chat` spends quota per call, so it stays rate-limited (`app/limits.py`).
  The counters are in memory and reset with the process: the spend cap on the
  OpenAI key is the limit that actually holds.
- Query embeddings must use the provider, model, and dimensions recorded in the
  committed index. Re-run `tools/knowledge/probe.py --calibrate` after changing
  the embedding model.
- Greetings and acknowledgements retrieve nothing. The source reports contain
  many transcript pleasantries, so retrieving them produces false provenance.

## Assets and maintenance

The development motion scrubber is `/motion-lab.html`; it inspects only the
authored implementation and is excluded from the production build. See
`docs/mascot.md` and `tools/mascot/README.md` before rebuilding assets. The
large original hand source is recoverable from Git history and is intentionally
absent from the working tree.

`docs/deployment.md` covers what runs where, how to deploy either half, and how
to tell apart the three different causes of "AI unavailable". Read it before
changing a domain, an origin, or the build.

Rebuilding the knowledge index uses its own environment (`tools/.venv` from
`tools/requirements.txt`), not the engine's: run `tools/knowledge/build-index.py`
after changing `assets-source/knowledge/`, then commit both `index.json` and
`index-vectors.bin`.

`tools/knowledge/probe.py` measures the shipped index and is free apart from
embeddings. `--graph` runs the real configured model over ~30 questions and can
exhaust a low daily request cap; use it deliberately, not as a routine check.
