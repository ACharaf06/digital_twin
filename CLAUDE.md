# Project guidance

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

## Ownership

- `content/profile.json` is the only source for public identity, contact,
  availability, education, experience, stack, and project summaries.
- `web/src/app/App.tsx` owns shell-level view, mood, action, voice, and entrance
  state.
- `web/src/chat/` owns engine health, streaming, cancellation, messages, speech,
  and chat rendering.
- `web/src/portfolio/` renders work and about views.
- `web/src/studio/` owns the Three.js stage, authored skeletal motion, hands,
  rig setup, picking, and disposal.
- `web/src/assets/mascot/` contains the only browser GLBs.
- `engine/` is the only server implementation. Its LangGraph route is route →
  retrieve → grade → evidence → generate.
- `assets-source/knowledge/` contains index inputs;
  `engine/knowledge/{index.json,index-vectors.bin}` is the committed runtime
  index.

## Invariants

- If the hand or motion setup fails after the body GLB loads, show that same
  authored character in its neutral pose. If WebGL or the body GLB fails, leave
  the stage empty and keep the portfolio/chat usable. Never introduce a bitmap
  mascot fallback.
- Respect `prefers-reduced-motion`; the rig must remain stable in its neutral
  pose and UI motion must stop.
- Keep the twin grounded. It never claims to be the human, invents personal
  facts, sends messages, or claims to act outside the conversation.
- Keep secrets in `engine/.env`. A `VITE_*` variable is public browser data.
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
