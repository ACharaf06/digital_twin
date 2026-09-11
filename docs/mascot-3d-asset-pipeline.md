# Mascot 3D Asset Pipeline

Notes on replacing the procedural mascot with a real generated character mesh:
what was attempted, what failed and why, and the plan to finish the job with
the Tripo AI API.

Current status (2026-09-10): the studio uses **`charaf-studio.glb` and locally
authored skeletal motion**. The original Tripo presets are retained for
comparison, but their crossed-leg idle, unsuitable greeting, and playback
problems made them a poor fit for the studio. See [current motion pipeline](mascot-motion.md).
This improvement used **0 additional Tripo credits**.

The sections below are historical notes from earlier attempts. Their descriptions
of the shipping asset, animation quality, and remaining work are superseded by
the current motion notes.

## Why

`web/src/lib/mascot.ts` builds the character from parametric primitives —
spheres, capsules, rounded boxes, a lathe torso — with the 468 MediaPipe
landmarks of `assets/video/centre.png` forming a face mesh whose UVs project
the portrait frontally.

That was a proof of concept and it shows:

- Proportions are roughly 2.1 heads tall. The reference is ~7.5.
- The ears are oversized discs sitting at mid-face height.
- The hair is a blob of instanced spheres, with no curl definition.
- The jacket is flat matte capsules — no collar, placket, pocket, or weave.
- At profile the head collapses into a featureless egg with a smeared edge
  texture and a detached ear, because a single frontal projection has no
  information about the sides. This is the limit already flagged in
  `CLAUDE.md`.

The face texture is the one genuinely good part; everything around it is what
breaks the illusion. No amount of parameter tuning closes that gap — primitives
cannot become felted wool and curly hair. It needs a real character mesh.

## Approach

Single-image-to-3D from `assets/video/ChatGPT Image Sep 10, 2026 at 09_14_56 AM.png`
— a full-body, A-pose, transparent-background render of the character, which is
exactly the input format these generators want — then auto-rig to a humanoid
skeleton, then load the skinned GLB in place of the procedural rig.

The critical enabling observation: `MascotStage.tsx` drives the rig through
roughly forty plain `Object3D` property writes (`rig.head.rotation.y`,
`rig.arms[0].shoulder.rotation.z`, `rig.legs[1].hip.rotation.x`,
`rig.head.localToWorld(...)`). A skinned GLB's bones **are** `Object3D`s. If
`createMascot` returns bone references under the same names, nearly all of
`MascotStage` survives untouched. Swapping the asset is not a stage rewrite.

## What was built

A complete pipeline using only free services, no Blender, no paid API.

### Tooling — `tools/mascot/`

| File | Purpose |
| --- | --- |
| `pipeline_full.py` | TRELLIS.2 (HuggingFace ZeroGPU) image → textured GLB |
| `gen_head.py` | Same, for a cropped head image |
| `run-pose.mjs` | Runs MediaPipe Pose in headless Chrome, dumps body joints |
| `rig.mjs` | Builds a humanoid skeleton and skin weights, writes a skinned GLB |
| `inspect-glb.mjs` | Structural GLB dump: meshes, UVs, skins, morphs, bounds |
| `shoot.mjs` | Multi-angle screenshots of any GLB, lit like the studio |
| `sweep.mjs` | Poses bones at MascotStage's real amplitudes and screenshots each |
| `verify.mjs` | Skin-data integrity: zero-weight verts, weight sums, joint range |
| `analyze.mjs`, `silhouette.mjs` | Y-slice and ASCII occupancy analysis of a mesh |
| `viewer/` | Standalone three.js GLB viewer with bone posing and weight painting |

The viewer supports `?pose=RightShoulder.z:-1.0` to rotate bones and
`?weights=1` to paint each vertex by its dominant bone — both were essential
for debugging.

### Assets — `assets/3d/`

| File | Notes |
| --- | --- |
| `apose-source.png` | The A-pose input, 1024×1536 |
| `apose-preprocessed.png` | After TRELLIS background removal, 948×948 |
| `head-crop-1024.png` | Head cropped from `centre.png` at full res — **the good head input** |
| `charaf-textured-98k.glb` | TRELLIS output: 98,462 tris, textured. Clean |
| `charaf-textured-77k.glb` | Conservatively decimated, 77,650 tris. Clean |
| `charaf-shape-222k.glb` | Hunyuan3D shape-only, untextured |
| `pose-landmarks.json` | MediaPipe Pose output for the A-pose image |
| `joints-mesh.json` | Those joints mapped into mesh coordinates |

These are ~52 MB of GLBs and **nothing in `.gitignore` covers them.** Decide
whether to track only the final asset, use git-lfs, or ignore the
intermediates before committing.

### Settings that work

TRELLIS.2 (`microsoft/TRELLIS.2`), via `gradio_client`:

```
/image_to_3d   resolution="1024", 12 sampling steps   ~31 s
/extract_glb   decimation_target=100000 (this is the floor), texture_size=2048
```

`resolution="1536"` with 20 steps returns `GPU task aborted` and still burns
quota. Do not raise these.

Decimation, via `@gltf-transform/cli`: `weld` then `simplify`. UV seams put a
hard floor around 55k triangles. **Use `--error 0.0012`.** `--error 0.01`
punches holes through the jacket and sleeves (see failures below).

## What worked

**The body is a genuine success.** Correct ~7-head proportions, a felted wool
jacket with visible weave, collar, placket, buttons and pocket, sculpted curly
hair with individual curls, real hands, real shoes, a dark tee and dark jeans.
It is unrecognisably better than the current primitive build.

**The custom rigger works for most of the character.** `rig.mjs` produces 23
nodes / 17 weighted bones with:

- Joint positions taken from MediaPipe Pose on the source image, then mapped
  into mesh space through the character's alpha bounding box
  (scale ≈ 0.001054 mesh-units/px). Validated against an independent Y-slice
  silhouette analysis — shoulders, crotch and ankle heights agree.
- Skin weights by **geodesic** distance: multi-source Dijkstra over the
  spatially-welded surface graph (102,900 verts → 30,634 welded), with
  two-phase exclusive seeding — thin limbs claim the surface hugging their axis
  first, then the torso bones claim what is left. A plain Euclidean
  nearest-bone test gives the entire side of the jacket to the arm.
- Laplacian diffusion of the labels (26 iterations, λ = 0.55) with core
  vertices pinned relative to their own bone's seed radius, for smooth falloff
  across joints.

Verified: bind pose renders pixel-identical to the unrigged mesh, zero
zero-weight vertices, all weights sum to 1.0, no out-of-range joint indices.
Head, spine, torso and legs all deform correctly.

## What did not work

### 1. The face

Melted, hollow eyes; the beard reconstructed as a solid black mass; a mushy
nose; no real ears. It reads as uncanny, not as the character.

**Root cause: input framing.** In the full-body A-pose image the head occupies
roughly 12% of the frame, so there simply are not enough pixels for the
generator to resolve facial features.

**The fix is known and cheap:** generate the head *separately* from a
high-resolution crop. `assets/3d/head-crop-1024.png` is already prepared — a
1024×1024 crop from `centre.png` with crisp eyes, beard structure, ears and
individual curls. This was never run, because quota ran out first.

Worth recording: the landmarks in `web/src/lib/face-landmarks.json` show
`centre.png` is frontal to within about 1° of yaw, so it is a valid straight-on
source for either projection or generation.

### 2. The arms

Rotating a shoulder drags a webbed sheet of jacket with it. The sleeve is
**fused to the jacket body** in the reconstruction, because the source pose has
the arms hanging against the torso and the generator cannot resolve the thin
gap between them.

This was confirmed properly rather than assumed — with clean geometry, verified
weights, a pixel-clean bind pose, and anatomically sane bone territories, the
jacket *still* drags. No weighting scheme fixes fused topology.

Measured usable range: **about ±0.2 rad.** That covers idle sway, breathing,
`dance` and the leg motion. It does not cover `wave` (~1.0 rad), `present`
(0.65) or `think` (0.5) at their current amplitudes.

**Root fix: a T-pose or wide-A-pose source image**, with the arms clear of the
body. This is standard practice for exactly this reason.

### 3. Free infrastructure limits

- **HuggingFace ZeroGPU quota is a shared pool**, not per-space. Anonymous
  access allows only a couple of generations before it is exhausted for ~24 h.
  A free account adds a modest daily allowance — enough for roughly one body
  generation — and this too was spent.
- There is also a **per-task duration ceiling** separate from quota. Hunyuan3D
  2.1's `/generation_all` (shape + texture) requests 270 s and is refused
  outright; only its untextured `/shape_generation` fits.
- **UniRig on a `cpu-basic` Space** (`jasongzy/UniRig`) ran for over 40 minutes
  with no output or progress signal and was abandoned. A transformer-based
  rigger is not viable on 2 vCPUs.

### 4. Self-inflicted bugs, and the lesson

Three of these cost significant time and are worth recording so they are not
repeated:

1. **Over-aggressive decimation.** Rigging was done on a mesh simplified with
   `--error 0.01`, which had already punched holes through the jacket. The
   resulting artifacts were misread as rigging failures for several iterations.
2. **Zero-weight vertices.** The top-4 weight selection filtered at `w > 1e-4`
   with no fallback, so 2,066 vertices ended with zero total influence and
   collapsed to the origin — producing holes and long shooting strands.
3. **A self-contradictory fallback.** A hard cap on limb reach sent clipped
   sleeve vertices to the *nearest torso bone*. Since the hand hangs at hip
   height, those vertices got pinned to `Hips` and stranded there while their
   neighbours travelled with the arm — the "taffy strip" artifact. A clipped
   sleeve vertex's correct owner is the arm; the fallback must be the vertex's
   own geodesic winner.

**The lesson: always render the bind pose first.** It must be pixel-identical
to the unrigged mesh. Checking it would have caught (1) and (2) immediately.
`sweep.mjs` now shoots bind as frame zero, and `verify.mjs` checks the skin
data numerically.

## The plan: Tripo AI

### Why Tripo

- **Pay-as-you-go, no subscription.** 1 credit = $0.01, credits valid 365 days.
  Every competitor is a monthly plan. This matters because the work needs
  *iteration*, not one shot.
- **Reviewers single out Tripo P1 for facial-feature accuracy** with sharp
  textures — precisely what failed here.
- **Auto-rigging with T-pose export and part segmentation**, which addresses the
  fused-arms problem directly and replaces the hand-rolled skinning in
  `rig.mjs` with a purpose-built rigger.

Ruled out: Meshy (rated slightly better on faces and hands, but $20/mo
subscription, over budget); Rodin (leads on realistic humans, but this
character is stylized, and it is pricier); HuggingFace PRO at $9/mo (buys more
quota on the same TRELLIS model that produced the bad face).

### Costs

| Task | Credits | USD |
| --- | --- | --- |
| `image_to_model` | 20–30 | $0.20–0.30 |
| `texture_generation` HD / 8K ultra | +20 / +30 | $0.20 / $0.30 |
| `animate_rig` (`rig-v2.0`) | 25 | $0.25 |
| `segmentation` | 40 | $0.40 |
| `part_completion` | 30–50 | $0.30–0.50 |
| Rig check | free | — |

One full pass — body + dedicated head + rigging at HD texture — is roughly
**135 credits ≈ $1.35**. A $15 budget therefore buys about **ten complete
attempts**, with room for seed variation and retries.

### Known API surface

- `v3/animations/rig-check` — free compatibility check. Run this first.
- `v3/animations/rig` — 25 credits. Parameters: `rig_type` (required;
  `biped` for this character), `spec` (`tripo` default or **`mixamo`**),
  `out_format` (`glb` default or `fbx`). ~30 s.

Prefer **`spec: mixamo`** — Mixamo bone naming is a well-known standard, which
makes the mapping in `createMascot` predictable.

Authentication, the upload endpoint and the task create/poll flow still need to
be read from the live docs at implementation time; they were not verifiable
from the documentation site, which serves a client-rendered shell.

### Steps

1. Buy credits at tripo3d.ai; create an API key at platform.tripo3d.ai. Keep
   the key out of the repo and out of chat transcripts — read it from an
   environment variable or an ignored file.
2. **Generate a T-pose source image** of the same character (arms straight out,
   same style, transparent background). This removes the fused-arms cause
   rather than patching it.
3. `image_to_model` on that image with HD texture → body mesh.
4. `image_to_model` on `assets/3d/head-crop-1024.png` with 8K texture → head.
   Try a few seeds; this is the fix for the single worst defect.
5. `rig-check`, then `animate_rig` with `rig_type: biped`, `spec: mixamo`.
6. Evaluate with the existing harness — `inspect-glb.mjs`, `shoot.mjs`,
   `sweep.mjs` (bind first), `verify.mjs`. Keep the best result.
7. Decimate with `--error 0.0012`, then compress with meshopt/Draco + KTX2 for
   web delivery.
8. Integrate into `web/src/lib/mascot.ts`.

### Integration contract

Whatever asset wins, `createMascot` must keep returning this shape, or
`MascotStage.tsx` breaks:

```
root, body, head, face, eyes, mouth, teeth
arms[0..1].{ shoulder, elbow, hand }     // [0] is the subject's RIGHT, at -X
legs[0..1].{ hip, knee }                 // the character faces +Z
setWireframe(enabled), triangles, updateFace(blink, speech, gaze), dispose()
```

Notes:

- Keep the procedural rig as a fallback when the GLB is absent or fails to
  load, alongside the existing WebGL-failure `<img>` fallback.
- **The wireframe toggle survives** — `setWireframe` is a traverse plus a
  material swap, and a dense real mesh in wireframe looks better than the
  primitives did.
- `updateFace` is the real integration risk. Its per-vertex writes are bound to
  hardcoded 468-landmark indices and will not transfer. The chosen direction is
  **authored eyeball and mouth geometry overlaid on the generated head**, with
  the painted-on features masked in the texture.

### Test constraints

`web/tests/studio.spec.ts` asserts things a rig swap will disturb:

- `data-mesh-triangles > 10000`
- more than 50,000 dark canvas pixels at 1440×900, and >1000 at every width
  down to 320
- the wireframe toggle must change >30,000 pixels; an orbit drag likewise
- **a click at (530, 310) must hit the character** — correct proportions shrink
  and raise the head, so this point and the camera framing will need updating
- reduced motion must leave the canvas near-static (<20 changed pixels), so do
  not ship an unguarded idle animation clip

## Open decisions

1. **Repo size** — `assets/3d/` is ~52 MB and untracked by `.gitignore`.
   Track only the final asset, use git-lfs, or ignore the intermediates?
2. **T-pose image** — worth generating, and strongly recommended, but Tripo's
   rigger may cope with the existing A-pose. Cheap to test both.
3. **Face animation depth** — full blink/speech/gaze via overlaid geometry, or
   ship the static generated head first and add motion afterwards.


---

# What finally worked: Tripo + re-skinning

The TRELLIS route produced a good body but an unusable face and arms fused to
the torso. Tripo (pay-as-you-go, ~$0.01/credit) fixed both: the face is far
better, and generating from a **T-pose** reference removed the fusion that made
the arms untearable-only-below-0.2-rad.

## Two bugs in the delivered file

`charaf_light_Tshape.glb` as downloaded rendered as a collapsed blob. Two
independent faults, both the signature of a lossy optimisation pass run over a
skinned mesh (`flatten` / `join` / `optimize` will do this — use `simplify`
alone on skinned meshes):

1. **Joint transforms stripped.** Every bone was `{"name":"Head"}` with no TRS,
   while the rest pose still sat in the inverse bind matrices. Skinning needs
   `jointWorld x IBM = identity` at rest, so the mesh collapsed toward the
   origin. Fixed by `tools/mascot/repair-rig.mjs`: `bindWorld = inverse(IBM)`,
   then `local = inverse(parentBindWorld) x bindWorld`. The eight articulation
   bones that carry no IBM borrow their twist child's bind position.
2. **Skin weights collapsed onto `Root`** — 99.8% of the mesh. Not repairable
   from the file; the weight data was gone. Fixed by re-computing weights.

Note `charaf_segmented.glb` was byte-identical to `charaf_light_Tshape.glb`
(same MD5) — the segmentation never made it into the export.
`charaf_light_normalshape.glb` has `skins=0`, so it can never be animated.

## Re-skinning

`tools/mascot/reweight.mjs` keeps Tripo's 33-joint skeleton (the joint
placement is good) and recomputes `JOINTS_0` / `WEIGHTS_0` with the same
geodesic method as `rig.mjs`: two-phase exclusive seeding, multi-source
Dijkstra over the welded surface graph, then label diffusion.

It also fixes a **90-degree misalignment**: the skeleton was rotated about Y
relative to the mesh. The bind pose still rendered correctly, but only because
everything was glued to `Root` — the skeleton's real placement was untested.
Disambiguated to 270 degrees by toe direction: the `ToeBase` bones must point
the same way as the toe geometry (+Z). That also puts `R_` bones at -X, which
matches `createMascot`'s convention.

Result: weights spread across all 17 weighted bones, no zero-sum vertices, and
a clean full-amplitude wave — the exact action that tore on the A-pose model.

## The gotcha that cost the most time

`MascotStage` **assigns** `bone.rotation.x/z` outright every frame. That is
fine for the procedural rig, where every joint Group starts at identity, but a
real skeleton carries a bind rotation (`R_Thigh`'s is about 171 degrees) that
the assignment wipes — which inverted the legs and put the feet at head height.

`createGeneratedMascot` therefore wraps every driven bone in an offset parent
holding its bind transform, and hands the stage the bone itself at identity.
The same mechanism carries the T-pose-to-arms-down rest offset (`ARM_REST`).

**Always render the bind pose first** and require it to be pixel-identical to
the unrigged mesh. That check would have caught this, the decimation shredding,
and the zero-weight collapse immediately.

## Bone mapping

| Rig contract | Tripo bone |
| --- | --- |
| `body` | `Spine01` |
| `head` | `Head` |
| `arms[0]` (subject's right, -X) | `R_Upperarm` / `R_Forearm` / `R_Hand` |
| `arms[1]` (subject's left, +X) | `L_Upperarm` / `L_Forearm` / `L_Hand` |
| `legs[0]` / `legs[1]` | `R_Thigh`+`R_Calf` / `L_Thigh`+`L_Calf` |

`*_Upperarm`, `*_Forearm`, `*_Thigh` and `*_Calf` are not skin joints, but the
twist bones carrying the weights hang off them, so rotating them moves the
whole limb. The `*Twist*` bones are siblings of `*_Hand`, not parents — driving
a twist bone alone would leave the rest of the limb behind.

## Still open

- **Face animation.** No morph targets, eyes are painted into the texture.
  `updateFace` is a no-op. Blink/speech/gaze need overlaid eye and mouth
  geometry, per the earlier decision.
- **Hit regions.** One skinned mesh means one hit target, so an invisible
  sphere collider on the head restores the head-click interaction. Hands still
  read as `body`; add hand colliders to bring back click-to-wave.
- **Payload.** 3.9 MB, mostly three JPEG textures (2.6 MB). KTX2 plus a
  1024-px basecolor would cut this substantially.
- **`assets/3d/` is untracked by `.gitignore`** and holds ~70 MB including
  `draft/`. Decide what to keep before committing.


---

# Animation (the current pipeline)

The procedural rig drove every bone with `Math.sin(time * k)` on a single axis:
no weight shift, no anticipation, no follow-through, legs static except during
"dance". That is what "the animations are bad" meant, and no amount of tuning
sine waves fixes it. Blender would not have helped either -- Blender is a tool
an *animator* uses; scripted from Python it just writes the same sine waves.
The fix is real keyframed clips.

## What was bought

| Step | Endpoint | Credits |
| --- | --- | --- |
| Compatibility check | `POST /v3/animations/rig-check` | 0 |
| Auto-rig (v1.0-20240301, biped) | `POST /v3/animations/rig` | 25 |
| 8 preset clips | `POST /v3/animations/retarget` | 80 |

**105 credits total.** Retarget is 10 credits per animation, max 5 animations
per call. API base is `https://openapi.tripo3d.ai/v3`; tasks poll at
`GET /v3/tasks/{id}`; uploads go to `POST /v3/files` (multipart, field `file`)
and `input` is a **plain string** (file token or task id), not an object.

Use **`v1.0-20240301`**: it exposes 90+ expressive biped presets. The newer
`v2.5-20260210` only offers idle/walk/run/jump-style motions, none of which
suit a portfolio twin.

Clips shipped: `idle`, `greet_01`, `dance_02`, `fold_arms`, `look_around`,
`agree`, `jump`, `cheer` -- mapped to the studio's moods and actions in
`MascotStage`.

## The API rig is clean; the web-UI export was not

Rigging through the API returned correct joint transforms, correct
mesh-aligned skeleton placement, and weights properly spread across all bones.
That confirms the corruption documented above came from whatever export path
produced the "light" files, not from Tripo's rigger. **`repair-rig.mjs` and
`reweight.mjs` are therefore no longer in the shipping path** -- they are kept
because they still fix a file that arrives broken that way.

## Two traps worth remembering

**Retargeting drops the hip's bind height.** Every clip set `Hip.translation`
to `[x, 0, 0]` while the rig's bind value is `[0, 0, 0.4568]`. Scaled up, the
character sank 1.9 units through the pedestal. `build-asset.mjs` offsets every
translation track so frame 0 lands exactly on the bind pose, restoring height
while keeping the authored sway. Root motion itself was already clean because
`animate_in_place: true` was requested.

**Never compose onto a bone the mixer drives.** Layering pointer tracking with
`head.quaternion.multiply(...)` each frame compounds whenever the mixer does
not rewrite the bone -- which is exactly what happens when reduced motion
freezes `dt`, and the head span continuously. Gaze now rides on an inserted
`GazeLayer` node above the head that the clips never touch, and is **set**
rather than multiplied, so it is idempotent.

## Building the asset

```
node tools/mascot/build-asset.mjs <rigged.glb> <out.glb> <anim1.glb> ...
```

Merges the animation-only GLBs into the rigged model, rebinding every channel
onto the model's own joints by name, drops the duplicate skeletons, re-grounds
translation tracks, resamples, and consolidates to a single buffer.

## Remaining

- **Payload 4.0 MB** -- 2.6 MB is three JPEG textures, ~1.4 MB animation data.
  KTX2 plus a 1024px basecolor is the biggest win available.
- **`assets/3d/` is 95 MB** (80 MB of it `draft/`) and still untracked by
  `.gitignore`.
- **Face animation** is still a no-op: no morph targets, eyes painted into the
  texture. Blink/speech need overlaid geometry.
- **Hands read as `body`** on click; only the head has a collider.
