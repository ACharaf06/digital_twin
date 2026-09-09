# Mobile Compatibility Plan

The site is currently **desktop-first**. This document is the reference for the
future phone-compatibility pass — what breaks on touch, the chosen strategy, and
a concrete checklist. No mobile code has been written yet.

Breakpoint convention: **"mobile" = below Tailwind `md` (< 768px)**. Desktop
behaviour stays exactly as-is.

---

## Why the current build isn't phone-ready

- **The background video scrubs on `mousemove`.** Touch devices have no mouse, so
  the video never scrubs and freezes on frame 0 — the "eyes follow you" effect is
  dead on mobile.
- **iOS Safari may not even paint that first frame** of a muted, non-autoplaying
  video until it's played/seeked — worst case the background is black.
- **`public/video.mp4` is ~8.7 MB** (1080p, all-keyframe on purpose). Heavy to
  preload on cellular.
- **The `DigitalTwin` panel is positioned for desktop-left** with fixed heights;
  it gets vertically tight on small screens and the on-screen keyboard shoves the
  layout when the input is focused.
- Navbar has already been removed, so nothing to do there.

---

## Strategy (decided)

Below `md`, **replace the interactive video scene with a static image** and reflow
the UI for touch. Present **two clear entry points instead of two scroll axes**:

- **Chat sheet** → "talk to me"
- **Laptop tap** → "see my work"

This is cleaner than the desktop mouse-eyes + scroll-zoom scheme and maps
naturally to touch. Desktop code is untouched — everything below is a `< md` branch.

---

## 1. Static hero image (replaces the scrub video on mobile)

- Render a static `<img>` instead of the `<video>` on mobile, and **do not load
  the 8.7 MB video at all** on phones (no `preload`). Keep the `<video>` path for
  `md+` only.
- Export a front-facing frame → `public/hero-mobile.jpg` (or `.webp`), compressed.
- **Portrait framing:** the source stacks nicely — face high, laptop lower-center.
  A portrait crop of the right-hand column gives **face in the top third, laptop
  in the middle third, chat at the bottom.** Use `object-fit: cover` with
  `object-position` tuned toward center/right; the empty red on the left crops out.
- (Optional, nice-to-have) also give the desktop `<video>` a `poster` frame so it
  never flashes black while loading.

## 2. Chat as a bottom sheet

- Full-screen static image; `DigitalTwin` becomes a **bottom sheet** over it
  (glass over the image, cohesive and app-like).
- **Default = collapsed "peek"**: just the header + input (or a single
  "Ask my digital twin" pill). First paint = striking image + invitation, not a
  wall of chat.
- **Tap to expand** to ~85 dvh for a real conversation; a drag handle / close
  collapses it back.
- Full width; respect **safe-area insets** (`env(safe-area-inset-*)`) for the
  notch and home indicator.
- **Keyboard handling:** keep the sheet above the keyboard on input focus — use
  `dvh` units and, if needed, the `visualViewport` API.
- Reuse the existing `DigitalTwin` logic as-is; only the container / positioning
  changes at the breakpoint.

## 3. Enter-the-laptop (zoom) on mobile

- **Do NOT use scroll-scrubbed zoom on mobile.** Mobile address bars hide/show on
  scroll, changing viewport height mid-animation → scroll-linked scale is janky.
  The laptop is also a small target, partly under the sheet.
- Make the **laptop screen a tap target**: subtle glow + an "Enter" affordance on
  the blank screen.
- On tap: play the **same zoom-into-screen transition as desktop** (scale +
  translate toward the screen center until it fills the viewport), then crossfade
  the view-2 HTML content in.
- **Reversible**: back gesture / close button returns to the hero.
- Same view-2 content + overlay as desktop — **only the trigger differs**
  (desktop scroll vs. mobile tap). One codebase.

---

## Assets to produce

- `public/hero-mobile.jpg` / `.webp` — portrait-friendly static frame
  (~1080–1440px tall), compressed.
- (Optional) `public/hero-poster.jpg` — poster frame for the desktop `<video>`.

## iOS / mobile caveats checklist

- Use **`dvh`** (dynamic viewport height), not `vh`, to avoid address-bar jump.
- Respect **safe-area insets**.
- Tap targets **≥ 44px**.
- Honour **`prefers-reduced-motion`** — tone down the aura + zoom.
- **Never preload the heavy video** on mobile.

---

## Implementation checklist (for the later pass)

- [ ] `BackgroundVideo`: `md+` renders `<video>`; `< md` renders static `<img>`,
      and the video is not fetched on mobile.
- [ ] Export & add `public/hero-mobile` image.
- [ ] `DigitalTwin`: mobile bottom-sheet layout with collapsed/expanded states.
- [ ] Safe-area + `dvh` + keyboard handling on the sheet.
- [ ] Build view-2 (inside-the-laptop) content + the shared zoom overlay.
- [ ] Wire laptop **tap-to-enter** (mobile) and **scroll-zoom** (desktop) to the
      same view-2.
- [ ] `prefers-reduced-motion` fallbacks.
- [ ] Test on real iOS Safari + Android Chrome.

## Open questions

- What is the view-2 (inside-the-laptop) content? (projects grid, sections, …)
- Should desktop also use click-to-enter for consistency, or keep scroll-zoom?
- `CONTACT` in `DigitalTwin.tsx` is still the placeholder `hello@mainframe.co` —
  replace before launch.
