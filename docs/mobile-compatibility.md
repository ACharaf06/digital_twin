# Responsive 3D Studio

The studio uses a shared Three.js scene with a desktop conversation column and
a stacked layout at 900px and below. The character remains visible above the
chat. Compact phones use a shorter scene and console; chat history, project
details, the studies timeline, and interactive Human stories scroll independently.

## Verification

`cd web && npm test` includes screenshots and layout assertions at:

- 320 x 568
- 375 x 667
- 390 x 844
- 768 x 1024
- 1024 x 768
- 1440 x 900
- 1920 x 1080

The suite checks horizontal overflow, control collisions, rendered character
pixels, movement, and orbit interaction. Desktop Chrome mobile emulation is
not a substitute for testing physical iOS/Android GPUs before a public launch.

## Performance and Access

- Three.js is lazy loaded and pixel density is capped at 1.75.
- Repeated curls and confetti use instanced geometry.
- Animation work is skipped while the document is hidden.
- Reduced motion disables ambient movement, confetti, and animated UI entrances.
- Touch uses OrbitControls; command buttons provide keyboard-accessible actions.
- Audio starts only when the visitor enables voice. Browser voices vary.
- If hand or motion setup fails, the authored GLB remains visible in its neutral
  pose. If WebGL or the body GLB fails, the stage is empty and the conversation
  remains available. No image is shown as a mascot fallback.
- No microphone or webcam is requested, and chat is not persisted in storage.
