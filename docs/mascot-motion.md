# Studio mascot motion

The studio now uses the existing Tripo character with locally authored skeletal
performances. No Tripo requests were made for this change: **0 credits spent**.

## Runtime

- `assets/3d/charaf-studio.glb`: 2,284,284 bytes, 19,151 triangles, 41 bones.
  Same vertex geometry, UVs, joint indices, and skin weights as the original
  asset. At runtime, the wrist pivots move to the cuffs with compensated inverse
  bind matrices; sleeve skinning is adjusted, old hand triangles are clipped,
  and the cuffs are tapered and finished with a narrow inward hem.
- `assets/3d/studio-hand.glb`: 1,143,552 bytes, 32,170 triangles, 16 bones.
  Instantiated twice, mirrored for the left hand. Each hand has a palm and
  three joints on each of five fingers; an extra wrist anchor follows the forearm.
- `web/src/lib/mascotMotion.ts`: authored pose timelines, two-bone inverse
  kinematics for arms/legs, wrist orientation, gaze, and conversational motion.
- `web/src/lib/mascotHands.ts`: cuff attachment, wrist blending, and finger poses.
- `web/src/lib/mascot.ts`: normalization, rig anchors, picking proxies, materials,
  disposal, and the existing procedural fallback.
- `web/src/components/MascotStage.tsx`: lighting, camera, action dispatch,
  responsive quality, rendering, and fallback.

The raw Tripo clips remain in `charaf-animated.glb`. Scrubbing them showed a
crossed-leg idle, unsuitable greeting, and disconnected-looking jumps. The old
player also looped all gestures, cut them off using unrelated timers, warped
clip speeds during crossfades, ignored repeat requests, and never spun the
imported model. Head tracking applied rotations in the imported bone's local
axes without smoothing.

## Performances

| Action | Duration | Behavior |
| --- | ---: | --- |
| Idle | 8.4 s loop | Small breath and weight shift; both feet planted |
| Wave | 3.5 s | Raise hand, two wrist waves, lower and settle |
| Present | 3.4 s | Open palm toward the laptop, glance back, return |
| Dance | 4.6 s | Alternating side steps and hand gestures |
| Jump | 1.8 s | Crouch, push off, ballistic flight, absorb landing |
| Spin | 2.6 s | Eased full turn, retaining equivalent orientation |

Pose distances are in a normalized four-unit-tall studio coordinate system.
IK converts targets to world space and solves against the rig's limb lengths
after the wrist pivots are corrected.
Each update starts from the imported bind transforms; offsets never accumulate.
The feet retain their world orientations, and support-foot targets stay fixed.
The moving foot is explicitly keyed during a dance step.

Idle and full-body poses use quintic easing. The greeting and presentation use
monotone cubic interpolation, carrying velocity through intermediate approach
and return poses instead of stopping at every keyframe. Holds and direction
reversals still stop, and the curves do not overshoot their authored targets.
Interruptions capture the current pose
and velocity, then blend into the next performance; they have a longer settling
window than a request from idle. The elbow pole stays below and outside the
shoulder, with only a small forward offset. The greeting's lowering phase takes
0.8 seconds so the bent arm can return without a fast turn in profile.
The hand's long axis follows the actual forearm direction; quaternion
interpolation changes palm facing without independently flipping the wrist.
Palm facing is transported with the forearm, then damped and speed-limited to
prevent a sudden axial turn when the arm changes direction. Head tracking is
bounded and damped in studio axes, with smaller motion during the greeting and
no tracking while orbiting. Conversation moods add small head/torso responses;
speaking adds a paced palm gesture with pauses.

## Hands

The lower-detail body had irregular fingers and no finger bones. Its wrist
pivots sat inside the palms, causing poor attachment and deformation. The current
hands reuse the five-finger mesh and cuff from the existing
`assets/3d/draft/charaf-tripo-hd-original.glb`. Their sculpted shape, nail detail,
and source skin colors are retained. The source's speckled color bake is softened
and stored as vertex colors; no additional textures or service calls are needed.
Both hands and their finger skeletons are scaled to 80% of the initial source-hand
replacement's size. The wrist retains the source's anatomical cross-section;
the cloth is fitted after scaling to preserve the sleeve join.

The wrist pivots move back to the actual cuffs before motion is initialized.
Inverse bind matrices are compensated so this does not move the body surface in
the bind pose. Original sleeve triangles are clipped exactly at the cuff plane.
Each sleeve tapers over its last 0.16 studio units to fit the wrist's actual mesh
cross-section. A narrow inward hem closes the cloth edge underneath the skin and
follows the same forearm weights as the sleeve. The old source-hand cuff triangles
are removed so a second cloth surface cannot protrude through the hem. This
accommodates the source model's asymmetry and keeps the join covered from behind.
The previous attachment expanded the skin to the wider sleeve opening, creating
a flared wrist and a jagged overlap. The sleeve now fits the unexpanded wrist.

Skin weights blend continuously across the palm, thumb pad, and finger webbing,
then along each joint. This avoids sharp deformation seams where one finger's
influence ends. The fingers curl gently at rest, open for the wave, and form a
loose cup for presentation. The wrist bridge blends between palm and forearm;
axial palm rotation is shared with the forearm. The existing two forearm twist
joints carry 20% and 65% of pronation to spread rotation along the sleeve instead
of concentrating it at the elbow. Wrist swing is limited to 0.82
radians, so lowering a gesture cannot fold the palm backward excessively.

An earlier procedural hand replacement was rejected during visual review. It
had a mismatched smooth appearance, incorrect thumb orientation, and a cuff gap.
The current asset uses the character's own higher-detail source instead.

Reduced motion freezes the rig in its neutral standing pose, including gaze and
actions. Returning from a hidden tab clamps elapsed time so animation does not
jump forward. The camera reset eases around the character instead of cutting
through it. Hand/head/body hit proxies avoid raycasting the entire skinned mesh
on every frame; hover checks run at most 12.5 times per second.

## Asset preparation

From the repository root, with Python, NumPy, Pillow, and the web dependencies installed:

```sh
python3 tools/mascot/prepare-studio-asset.py
node tools/mascot/build-hands.mjs
```

This preserves the original assets and writes `charaf-studio.glb`. It removes
unused imported animation data, repacks referenced buffers, resizes base color
to 2048 px and normal/roughness textures to 1024 px, and embeds optimized JPEGs.
The hand builder calls `extract-source-hand.py` to isolate and simplify the source
hand, sample its colors, and then bind five finger chains. Original assets remain
unchanged. The body and shared hand assets total **3,427,836 bytes**, **17.4% smaller** than
the original 4,149,168-byte GLB, despite the added finger rig.
The browser needs neither Python nor a Tripo key. Mobile uses a 1.5 pixel-ratio
cap and 1024 px shadows; desktop uses 1.75 and 2048 px.

## Review and verification

Run `npm run dev` from `web`, then open:

- `/motion-lab.html?authored`: current motion, with clip selection, playback,
  scrubbing, view presets, and orbit controls.
- `/motion-lab.html?authored&view=profile&clip=wave&play`: the greeting from the
  right profile. Autoplay respects the browser's reduced-motion preference.
- `/motion-lab.html`: original Tripo clips for comparison.
- `/motion-lab.html?authored&hands=original`: current body motion with the original
  lower-detail hands, for visual comparison.

The lab is a development entry and is not included in the production build.

```sh
cd web
npm run build
npm test
```

The motion tests evaluate the actual loaded runtime skeleton. They check foot
drift and mesh grounding, greeting hand height, jump anticipation/clearance/
landing, a complete turn, gesture restarts and interruptions, quaternion
continuity, 30/60/120 fps consistency, reduced-motion stability, five finger
chains per hand, normalized skin weights, finger opening, surface stretch,
correct thumb orientation, and cuff coverage through gestures. A profile-wave
regression checks wrist-to-forearm alignment, elbow placement, per-frame rotation,
hand proportions, and uninterrupted approach motion throughout the lift, greeting,
and return. Cuff checks also cover the inner hems and anatomical wrist thickness.
The existing
studio suite also checks seven viewport sizes, visible geometry, orbit/picking,
chat reactions, and WebGL fallback.

## Model limitations

The imported character has no facial blendshapes or separate eyeballs. The
current motion and new hand rig improve body performance, hand articulation,
and head attention. Lip-sync and eyelid animation still require a facial rig
and corresponding geometry.
