# Studio mascot

The studio has one character implementation: the authored Tripo body in
`web/src/assets/mascot/charaf-studio.glb`, fitted with the standalone articulated
hand in `studio-hand.glb` and driven by local skeletal performances.

## Runtime ownership

| File | Role |
| --- | --- |
| `web/src/studio/MascotStage.tsx` | thin React adapter for live stage state |
| `web/src/studio/createStage.ts` | renderer, camera, lighting, interaction and disposal lifecycle |
| `web/src/studio/rig.ts` | model normalization, neutral fallback, motion setup, picking and disposal |
| `web/src/studio/motion.ts` | pose timelines, IK, transitions and gaze |
| `web/src/studio/hands.ts` | hand attachment, wrist skinning and finger poses |
| `web/src/assets/mascot/charaf-studio.glb` | 41-bone browser body, 19,151 triangles |
| `web/src/assets/mascot/studio-hand.glb` | five-finger hand, instantiated for both wrists |

The fallback contract is deliberately small:

```text
body + hand + motion ready  -> animated authored mascot
body ready, setup fails     -> same authored mascot, neutral pose
body or WebGL unavailable   -> empty stage; UI and chat continue
```

There is no portrait, generated placeholder, or second procedural geometry
system in the browser.

## Performances

| Action | Duration | Behavior |
| --- | ---: | --- |
| Idle | 8.4 s loop | breathing and weight shift with both feet planted |
| Wave | 3.5 s | lift, two wrist waves, return and settle |
| Present | 3.4 s | open palm toward the laptop, glance and return |
| Dance | 4.6 s | alternating side steps and hand gestures |
| Jump | 1.8 s | crouch, flight and absorbed landing |
| Spin | 2.6 s | eased complete turn |

Every update begins from imported bind transforms so offsets cannot accumulate.
Interruptions capture the current pose and velocity before blending to the new
performance. Reduced motion holds the exported neutral pose, disables actions
and gaze, and prevents time jumps after a hidden tab returns.

The character has no facial blendshapes or independent eyeballs. Head motion and
body gestures carry conversational state; phoneme lip sync and blinking would
require a new authored facial rig.

## Review

Run the frontend and open `/motion-lab.html`. The development-only scrubber
supports clip selection, playback, timeline scrubbing, preset viewpoints and
orbit controls. It contains only the runtime authored motion.

```bash
cd web
npm run build
npm test
```

Motion tests inspect the loaded skeleton and cover grounding, foot drift, jump
clearance and landing, a full spin, gesture restarts, interruptions, quaternion
continuity, 30/60/120 fps consistency, reduced motion, finger chains, normalized
skin weights, wrist/cuff fit and the profile view of the greeting. Studio tests
cover rendering, picking, orbit, responsive layouts, neutral fallback and empty
WebGL fallback.

## Rebuilds

`assets-source/mascot/charaf-animated.glb` is the body input. The large original
hand source was removed from the active tree and remains recoverable from Git
history. Commands, dependencies and its recovery path are documented in
`tools/mascot/README.md`.
