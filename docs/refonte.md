# Refonte

This refactor makes the repository describe the product that actually ships. A
contributor now sees one frontend, one engine, one mascot path, one public
profile, a clear split between runtime assets and rebuild inputs, and a small
maintenance toolchain.

## Resulting architecture

```text
React studio ──► FastAPI ──► LangGraph ──► committed hybrid index ──► OpenAI
     │                               ▲
     ├─ authored 3D mascot           └─ assets-source/knowledge
     └─ content/profile.json ────────────────────────┘
```

The browser and engine both consume `content/profile.json`. Detailed source
documents remain separate because they feed retrieval rather than the public
CV-level context.

The frontend is divided by ownership:

```text
web/src/
├── app/App.tsx
├── chat/{ChatPanel,useTwinChat}.tsx|ts
├── portfolio/{WorkPanel,AboutPanel}.tsx
├── studio/{MascotStage,createStage,rig,hands,motion}.tsx|ts
├── assets/mascot/*.glb
├── lib/{portfolio,twinClient}.ts
└── styles/{base,studio}.css
```

`TwinConsole` is now a small composition layer. Network health, cancellation,
history, SSE assembly, unavailable-engine handling, and voice live in `useTwinChat`.
Projects and the human profile render in their own modules. `MascotStage` is a
thin React adapter around the imperative lifecycle in `createStage`. The stage
uses a single authored rig implementation; normalization and resource ownership
live in `rig.ts`, while motion and hands remain explicit domains.

## Fallback behavior

The mascot has one graceful-degradation contract:

```text
GLB + motion succeed       -> animated authored mascot
GLB loads, setup fails     -> same 3D mascot held neutral
GLB or WebGL cannot render -> empty stage; portfolio and chat remain usable
```

The old image fallback and landmark-generated procedural character were removed.
The tests assert that WebGL failure produces neither a canvas nor an image, and
that hand setup failure keeps the authored GLB visible with `data-motion=neutral`.

The chat has no local response generator. Every assistant message comes from
the Python engine. While the engine is checking or unavailable, the composer
and project chat actions are disabled; a failed request removes an empty
assistant placeholder instead of substituting a canned answer.

## Removed production ambiguity

The following obsolete paths were removed from the working tree:

- the unused video hero, its 8.3 MiB public video, and unused avatar;
- the procedural portrait mascot, face landmark data, and MediaPipe browser
  dependency;
- Tailwind configuration and dependency, because the frontend has no Tailwind
  directives;
- the complete Node/Ollama server and its duplicate retriever, tests, and probe;
- unused engine tool stubs and the unconsumed eval file;
- rejected 3D variants, intermediate meshes, source portraits, generated video
  frames, and the vendored Three.js viewer;
- exploratory mascot scripts superseded by the body packer, hand builder,
  extractor, inspector, authored motion lab, and behavioral tests;
- historical mascot and portrait documents that contradicted the running code.

Git history remains the archive for deleted implementations and binary
experiments. No history rewrite is part of this branch.

## Assets

Runtime and source assets no longer share a directory:

```text
web/src/assets/mascot/       browser-imported GLBs only
assets-source/mascot/        retained body rebuild input
assets-source/knowledge/     retrieval-index inputs
engine/knowledge/            committed index and vectors
```

The 54 MiB high-resolution model used once to create `studio-hand.glb` is absent
from the working tree. `tools/mascot/README.md` documents an exact `git show`
command that restores it from commit `50d1bba` if the hand asset needs rebuilding.
The already-generated hand remains tracked as a runtime asset.

## Tooling

There is one engine implementation and one direct retrieval API. The unused
LangChain `BaseRetriever` adapter was removed; the graph and probe both call
`KnowledgeIndex` directly. Probe cases now live in
`engine/eval/retrieval.json`, so the measurements are data rather than hard-coded
inside the runner.

Runtime and development Python dependencies are split between
`engine/requirements.txt` and `engine/requirements-dev.txt`. Offline asset tools
have `tools/requirements.txt`. Prettier is a real package command through
`npm run format` and `npm run format:check`.

## Recovery map

| Removed item | Current replacement or recovery |
| --- | --- |
| Node/Ollama engine | Python FastAPI/LangGraph engine |
| procedural and bitmap mascot fallbacks | neutral authored GLB or empty stage |
| five profile Markdown files | `content/profile.json` |
| hard-coded probe cases | `engine/eval/retrieval.json` |
| old mascot viewers and pipelines | `/motion-lab.html`, `tools/mascot/`, tests |
| rejected models and media | Git history at or before `50d1bba` |
| high-resolution hand source | recovery command in `tools/mascot/README.md` |

## Behavioral gates

The refactor is complete when these commands pass:

```bash
cd web
npm run build
npm run format:check
npm test
npm run test:engine

TWIN_NO_DOTENV=1 OPENAI_API_KEY= engine/.venv/bin/python tools/knowledge/probe.py
```

The free probe must keep lexical routing at 8/8. Browser validation must cover
normal motion, reduced motion, live chat, unavailable-engine behavior,
cancellation, contacts, all tested viewports, the neutral GLB fallback, and the
empty WebGL fallback.
