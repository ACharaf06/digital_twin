# CLAUDE.md — digital_twin

Guidance for Claude Code working in this repo. Keep it current.

## Current mascot (2026-09-11)
The shipping character is `assets/3d/charaf-studio.glb`, a 41-bone Tripo rig.
`web/src/lib/mascotMotion.ts` owns authored pose timelines, limb IK, gesture
transitions, and gaze. The original imported clips are for comparison only.
`studio-hand.glb` reuses the hand mesh and colors from the high-detail Tripo
source in `assets/3d/draft`. `mascotHands.ts` corrects wrist pivots, fits each
cuff to the unexpanded wrist, adds an inward cloth hem, and controls finger poses.
The hands are scaled to 80%; do not widen the skin to fill the sleeve opening or
regenerate generic procedural hands. The greeting uses a lower elbow path,
forearm-relative palm orientation, distributed forearm twist, and continuous
velocity through approach/return poses. Review the greeting from the right
profile at `/motion-lab.html?authored&view=profile&clip=wave&play`.
The landmark-based character below remains a loading fallback. Read
`docs/mascot-motion.md` before editing motion; it supersedes older animation
notes in this file. Dev scrubber: `/motion-lab.html?authored`. No Tripo key or
credits are needed to edit, run, test, or rebuild the current performances.

## What this is
Charaf Achir's portfolio, built as an interactive 3D **"twin studio."** A real
Three.js articulated cartoon mascot — constructed from the original portrait's
face landmarks and textured with that same portrait — reacts to the pointer and
to a streaming AI chat. Monorepo.

```
web/       Vite + React + TS + Tailwind + three.js  (the studio)
engine/    Chat backend: FastAPI + LangGraph agentic RAG on OpenAI gpt-4o-mini (Python 3.11+)
assets/    Source media. assets/video/centre.png is the portrait the mascot is built from.
           assets/knowledge/ holds the source documents the twin answers from.
docs/      Notes: portrait-production.md (mascot provenance), mobile-compatibility.md
```

## Run / verify
```bash
# frontend
cd web && npm install && npm run dev      # http://localhost:5173
cd web && npx tsc -b                       # typecheck (strict) — the reliable check in a sandbox
cd web && npm test                         # Playwright studio tests
cd web && npm run test:engine              # engine tests (pytest, against a mock OpenAI)
engine/.venv/bin/python tools/knowledge/probe.py           # retrieval quality probe
engine/.venv/bin/python tools/knowledge/probe.py --graph   # the full graph on the real model (spends quota)

# chat engine (optional — the studio degrades to scripted answers without it)
cd engine && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd engine && .venv/bin/python -m app.main  # :8000 (TWIN_PORT); engine/.env supplies OPENAI_API_KEY
```
The frontend proxies `/api/*` → `http://localhost:8000` (web/vite.config.ts).
`TWIN_ENGINE_URL` retargets that proxy; `VITE_ENGINE_URL` overrides the
frontend's API base.

## How it works
- **Mascot geometry** — `web/src/lib/mascot.ts` builds a Three.js head from the
  468 MediaPipe landmarks in `web/src/lib/face-landmarks.json`, with UVs sampling
  `assets/video/centre.png` so the face *is* the original portrait on real depth.
  Continuous cranium (boundary colors sampled from the image), instanced curls,
  lathe torso, extruded collar, articulated arms/legs/hands, gaze-tracking eyes,
  and `updateFace(blink, speech, gaze)` vertex deform. `setWireframe()` swaps to a
  "digital" wireframe. **MediaPipe is dev-only** — landmarks are baked to JSON;
  visitors never run it and no webcam is requested.
- **Stage** — `web/src/components/MascotStage.tsx` owns the whole scene: PBR +
  RoomEnvironment IBL + shadowed key/rim/bounce + ACES tonemapping, OrbitControls
  (constrained polar, no zoom/pan), raycast click-to-interact + hover cursor, a
  **live `<canvas>` texture on the laptop screen** that reflects mood, a floating
  die + instanced confetti, and a camera reveal on entry. Falls back to a static
  `<img>` of the portrait on WebGL failure / context-loss. Honors
  `prefers-reduced-motion`.
- **Console** — `web/src/components/TwinConsole.tsx` is the chat + `work` + `about`
  tabs. Every conversation starter goes to the model like a typed question — a
  starter may also play a gesture, but never substitutes a canned answer for one;
  scripted text (`scriptedReply` / `getLocalReply`) is the offline fallback only.
  A grounded reply renders a `.message-sources` line from the engine's `sources`
  frame. It streams from the engine via `twinClient.streamChat` (SSE) when a
  `/health` check reports `ready` (status "Live AI"); otherwise, and on any
  error, it uses `portfolio.getLocalReply` (scripted answers from the profile).
  It drives the
  mascot mood (idle / listening / thinking / speaking) and actions, with optional
  Web Speech voice.
- **Shell / state** — `web/src/App.tsx`: boot screen, entrance, and the
  mood/action/view/voice + geometry-toggle state.
- **Engine** — `engine/app/main.py` (FastAPI) serves `/health` and `/chat`,
  which streams `{"sources": [...]}` → `{"delta": "..."}` … → `{"done": true}`,
  with input validation, size caps and history clamping. The response is held
  until the first token, so any failure before it is a clean 503. A disconnect
  cancels the model call. Each turn runs the LangGraph graph in
  `engine/agent/graph.py`: route (plus an English and a French rewrite) →
  retrieve → grade (an LLM rerank, with one retry on the next window) → evidence
  (plus adjacent passages) → generate. The system prompt is
  **`PROFILE` + `EXCERPTS`**: the curated `engine/knowledge/*.md`, always
  present, plus the passages the grader kept, or a "nothing found" note.
  Langfuse traces each turn when its keys are set. Read `engine/README.md`
  before changing it.
- **Retrieval (RAG)** — `tools/knowledge/build-index.py` extracts, chunks and
  indexes `assets/knowledge/` (PDF + Markdown) into a **committed**
  `engine/knowledge/index.json` plus `index-vectors.bin` (OpenAI
  `text-embedding-3-large` at 1,024 dims). `engine/rag/retriever.py` fuses
  BM25F with dense similarity by weighted RRF (numpy; no vector database). Read
  `engine/README.md` § Retrieval before touching either. Rebuild after changing the source
  documents, then run the probe.

## Conventions
- React 18, **TS strict** (`noUnusedLocals`). **Raw three.js**, not
  react-three-fiber. Prettier (`web/.prettierrc.json`). Tailwind plus a large
  hand-written `web/src/index.css` (the studio styling). Fonts: Manrope + IBM Plex
  Mono (fontsource). Lucide icons.
- Content lives in `web/src/lib/portfolio.ts`. Keep the twin honest: it must never
  claim to be the human or to have taken an action — this is enforced in the
  engine system prompt too.

## Gotchas
- `web/src/lib/face-landmarks.json` is **load-bearing** (478 landmarks / 2556
  triangles). Don't lose or casually regenerate it.
- **Knowledge facts live in `engine/knowledge/*.md`** and are the source of truth
  for biography, education and contact — the retrieval index never overrides them.
  Fix a wrong fact there, not in the prompt.
- Most of the corpus is **French** while visitors ask in **English**. Lexical
  matching routes to the right document but lands on its few English fragments;
  the **dense vectors are what reach the French prose**. If the engine starts
  with "lexical only" in its log, the key is missing and that reach is gone.
- **Questions must be embedded by the index's own model.** Provider, model and
  dimensions are read from `index.json` for that reason. Changing the embedding
  model means rebuilding and re-running `probe.py --calibrate` to reset
  `DENSE_MIN_SIMILARITY`.
- **Small talk retrieves nothing** (`searchable()` in `engine/rag/retriever.py`):
  greetings and thanks are stopwords because the thesis transcripts are full of
  them. Keep "nice" out of that list -- it is also the city.
- `engine/.env` holds `OPENAI_API_KEY` and is gitignored. Never commit it, and
  never move it into a `VITE_*` variable: Vite inlines those into the browser
  bundle.
- The mascot imports `centre.png` from repo-root `assets/`
  (`../../../assets/video/centre.png`), so the web build depends on that file.
- **Single frontal texture:** the side/back of the head stretch the portrait's
  edge pixels at orbit angles. Azimuth is currently **unclamped** and `spin`
  rotates 360° — clamp `min/maxAzimuthAngle` in MascotStage if the sides look off.
- **Perf:** 2048² shadows + IBL + ~1800 instanced curls + a per-frame hover
  raycast. `updateFace` already skips the vertex re-upload on idle frames; the
  hover raycast still runs every frame. The full 3D scene renders down to 320px —
  consider a mobile quality tier.
- **The OpenAI quota is the ceiling.** The key in use on 2026-09-11 allows 50
  `gpt-4o-mini` requests per **day**. A documents turn costs 3 (route, grade,
  answer), and small talk costs 1. Past the cap every turn is a 503 and the
  studio shows scripted replies. `probe.py --graph` alone needs about 70. Add
  billing before any public deploy.
- Engine tests set `TWIN_NO_DOTENV=1` and use `engine/tests/mock_openai.py`:
  they must never read `engine/.env`, call the real API, or trace to Langfuse.
- Langfuse traces contain what visitors type, which sends it to a third party.
  Say so in the privacy notice, or pass `mask` in `engine/observability.py`.
- `web/src/components/BackgroundVideo.tsx` is **legacy** (the old video-scrub
  hero) and unused by the studio.
- A sandbox can't run `vite build` against macOS `node_modules` binaries — use
  `tsc -b` there and build on the Mac.

## Roadmap
- Clamp the orbit azimuth (biggest visual safeguard).
- Mobile quality tier vs. static fallback below a perf threshold.
- Engine phase 2: tools in the graph (project cards, gestures, document search,
  GitHub). Phase 3: an eval set scored in Langfuse. Keep `getLocalReply` as the
  fallback.
