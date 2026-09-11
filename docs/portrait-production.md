# Cartoon Mascot Provenance

## Identity Source

`assets/video/centre.png` is the original cartoon portrait. It is unchanged.
The new studio does not render the previously generated `twin-studio.png`.
No newly generated human face is used.

The original face was detected locally with MediaPipe Face Landmarker. Its
478 landmarks, 852 facial triangles, face oval, eye contours, and lip contours
are stored in `web/src/lib/face-landmarks.json`. MediaPipe is a development-only
dependency. Visitors do not download or run it, and no webcam is requested.

## Real 3D Geometry

`web/src/lib/mascot.ts` maps the first 468 landmarks into a Three.js facial mesh,
including the estimated depth of the nose, cheeks, forehead, and jaw. Texture
UVs sample the original face directly from the source image.

The face boundary extends continuously around a closed cranium. Boundary
colors are sampled from the same image. The ears, curls, body, clothes, hands,
legs, and shoes are modeled geometry, not photographs or camera-facing planes.
Separate joint groups animate the shoulders, elbows, hands, hips, and head.
The back and body are approximations because no full rigged model was supplied.

Real eyeballs, irises, and highlights follow the pointer. Face vertices deform
for blinking and expressive mouth motion. The latter is not phoneme-aligned
lip sync; browser speech synthesis provides optional audio independently.

The original image is never overwritten. Runtime sampling constructs geometry
and material data in memory. No portrait is sent to an external service.

## Scene

The laptop, pedestal, die, and confetti are Three.js geometry. The laptop screen
is a live canvas texture reflecting the conversational state. The geometry
toggle renders the actual character topology, not a replacement illustration.

The prior portrait/point-cloud implementation has been retired. Original
source videos and images remain available in `assets/`.
