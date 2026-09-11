# Charaf / Digital Twin

A personal AI-engineering studio centered on a 3D cartoon mascot and a conversation.
React, TypeScript, Vite, Three.js, and a local Ollama chat engine.

## Run

Use Node 22.12+ (tested with Node 25).

```sh
cd web
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Open http://127.0.0.1:5174. For real AI replies, also run Ollama and the engine:

```sh
ollama pull qwen3.5:0.8b
node engine/local-server.mjs
```

Run the last command from the repository root. Ollama must be serving on port
11434; its desktop app normally handles this, or use `ollama serve` separately.
The Node engine listens on port 8000. Vite proxies `/api` to it. No API key is
needed. With no engine, the chat is explicitly labeled **Profile preview** and
uses written profile answers, not an LLM.

## The Experience

- A close-up entrance that pulls back into an unframed 3D studio.
- A Tripo character with a 41-bone skeleton and locally authored performances.
- Five-finger hands reused from the higher-detail Tripo source, with finger
  articulation, corrected wrist pivots, and cuffs fitted to each arm.
- Grounded idle, a clear hand wave, presentation gestures, side-step dance,
  a jump with anticipation and landing, and a full turn.
- Smooth head tracking, breathing, orbit controls, and head/hand/body picking.
- A geometry view of the actual character meshes, plus animated confetti.
- Always-visible chat. Listening, thinking, and speaking drive the character.
  Optional browser voice, streamed responses, stop, reset, and conversation history.
- Project details and the real email, LinkedIn, and GitHub contacts.
- Desktop/mobile layouts, reduced-motion behavior, and a usable WebGL fallback.

The studio loads `assets/3d/charaf-studio.glb` and `studio-hand.glb` (3.43 MB
combined). Motion is fitted to the existing body skeleton; new articulated hands
replace the malformed imported hands at the cuffs. The original assets and
imported clips remain in `assets/3d`. No Tripo credits were spent on these
improvements. Facial lip-sync is not included. See [motion notes](docs/mascot-motion.md).

## Verification

```sh
cd web
npm run build
npm test
npm run test:engine
```

Browser tests use installed Chrome on macOS. Else install Playwright Chromium
with `npx playwright install chromium`, or set `CHROME_PATH`. Tests cover canvas
pixels, actual movement, geometry mode, orbit/picking, seven viewport sizes,
chat, projects, contacts, reduced motion, and WebGL fallback. Motion tests also
measure foot contact, jump clearance, interruption continuity, hand deformation,
and timing at 30/60/120 fps. Screenshots go to
`web/test-results`. Engine tests use a mock upstream, not paid model calls.

For a development scrubber, open `/motion-lab.html?authored`. Compare the original
Tripo clips at `/motion-lab.html`. Neither page is included in the production build.

## Main Files

- `web/src/lib/mascot.ts`: generated rig, picking proxies, materials, procedural fallback.
- `web/src/lib/mascotMotion.ts`: performance poses, limb IK, transitions, gaze and moods.
- `web/src/lib/mascotHands.ts`: hand attachment, wrist skinning, and finger poses.
- `tools/mascot/build-hands.mjs`: reproducible source-hand extraction and finger rigging.
- `tools/mascot/extract-source-hand.py`: hand/cuff isolation, simplification, and source colors.
- `tools/mascot/prepare-studio-asset.py`: reproducible runtime asset packing.
- `web/src/lib/face-landmarks.json`: precomputed source-image landmarks.
- `web/src/components/MascotStage.tsx`: camera, lighting, interaction, animation.
- `web/src/components/TwinConsole.tsx`: chat and portfolio views.
- `web/src/lib/portfolio.ts`: public facts, contacts, preview answers.
- `engine/local-server.mjs`: grounded Ollama streaming adapter.
- `engine/knowledge/`: written source of truth for AI responses.

Keep the frontend facts and engine knowledge synchronized. The model is small
and can make mistakes; it never forwards visitor messages to Charaf.

## Deployment

`npm run build` produces `web/dist`. Static hosting can run the 3D experience
with Profile preview. Live AI needs a separately hosted model/engine and an
HTTPS reverse proxy for `/api`; Vite's development proxy is not included in the
build. Add authentication or abuse protection, rate/concurrency limits, and
appropriate privacy disclosures before exposing an AI endpoint publicly.
The bundled Node engine binds to loopback intentionally. See
[engine configuration](engine/README.md).
