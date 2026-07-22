# Handpan — realistic volumetric tone fields (gyroscope light): research note

Deep-research pass (2026-07-22) backing a one-shot build. Replace the flat ring-circles with realistic 3D
**steel dome/dimple** buttons that catch a **specular highlight that shifts with the gyroscope**. Sources below.

## 1. Physical truth — what a handpan tone field actually looks like

- Made of **nitrided / brushed steel** — a dark, warm, matte-satin metal (NOT mirror chrome). Soft, broad
  specular glints, not sharp reflections.
- Each outer **tone field** = a hammered oval with a central **dimple** (concave dish) inside a slightly
  **raised rim**. The central **ding** domes **outward** (convex bump).
- So the lighting model: a concave dish → the lit spot sits on the *raised rim toward the light* and the dish
  interior shadows on the far side; a convex dome → highlight on the side facing the light, shadow opposite,
  and it casts the biggest drop shadow. Move the light → the glint slides across the metal = the volume cue.

## 2. Technique — light-reactive via CSS custom properties (the performant way)

Follow the CSS-Tricks custom-property parallax pattern: **JS owns the numbers, CSS owns the pixels.**
- One rAF loop reads the gyroscope (`/_rt/sensors.js` `tilt` β/γ, already permission-gated + screen-orientation
  corrected), smooths + clamps it to a light vector in **[-1,1]** via the unit-tested `Parallax` (EMA α, clamp
  maxDeg) from `/_rt/spectrum.js`, and writes just **two CSS vars** `--lx/--ly` on the pan container.
- Every field reads those vars in `calc()` to position its **specular glint** (`radial-gradient(circle at
  calc(50% + var(--lx)*30%) …)`) and to shift its **box-shadow** layers (drop opposite the light; inset rim
  highlight toward it; inset dish shadow away). No React re-render — CSS recalcs 10 small elements per frame.
- **Idle drift** when the gyro is off / absent (and in the headless gate): a slow automatic light sweep (period
  ~14 s) so the metal always feels alive and the shot shows the volume. **prefers-reduced-motion** → freeze the
  light at a fixed top-left and drop the press animation (static 3D shading is not motion, so it stays).
- **Permission**: iOS gates `DeviceOrientation` behind a gesture. Reuse the existing **immersion ("Depth")
  toggle** (`enableImmersion` → `tilt.request()`), which now powers BOTH the resonance parallax and the button
  light from one stream. Buttons are volumetric *always* (static shading + idle drift); enabling Depth makes
  them react to tilt.

## 3. The material (neumorphism-evolved + liquid-glass, 2026/27), with restraint

Dark-steel radial base (dish darker centre / raised lighter rim; ding lighter top / dark base = bulge) +
layered reactive shadows for extrusion + a soft **screen-blended white glint** pseudo-element for the specular.
Tactile micro-interaction on strike: a quick **press-in keyframe** (scale dip + settle) and an accent-violet
**drop-shadow glow** that lingers over the note's ring-out. Avoid refractive distortion (kills legibility) and
neon glassy orbs — keep it a matte, believable metal (design-taste: restraint, colour = meaning).

## 4. Why HTML/CSS, not three.js

The buttons must stay **interactive, accessible, and gate-testable**. Modelling them in the existing WebGL
scene would mean raycast hit-testing + HTML label overlays + no a11y, and WebGL only renders in CI. Real DOM
buttons keep `data-field` + `elementFromPoint` hit-testing, `aria-label`, focus, and work with zero WebGL —
the 3D is pure CSS light-reactive material. This is the "or html, whichever is convenient" the owner offered,
and it's the robust choice. (The resonance sand-field stays three.js behind it.)

## Pitfalls captured
- Don't write per-frame React state — write CSS vars (setProperty) and let `calc()` do the work.
- Process β/γ (smooth + clamp), never feed raw gyro to CSS — jitter + nausea.
- Gate the light behind the existing tilt permission; never open the sensor cold on iOS.
- Keep the specular soft + the metal matte — a shiny glass orb reads cheap, not like a handpan.
- Idle drift + reduced-motion fallback so the metal is alive on every device and the headless shot shows depth.

## Sources
- CSS-Tricks, *Parallax Powered by CSS Custom Properties* (the var-driven, render-free technique + reduced-motion).
- Subvisual/HackMD, *Moving things around — gyroscopes, mousemove, and perspective* (β/γ mapping, process the value).
- wagerfield/**parallax** (deviceorientation engine, null-value fallback).
- Speckyboy, *Metallic Effects with CSS* + FreeFrontend iridescent neumorphic button (layered gradients/shadows, moving highlight).
- Handpan acoustics/anatomy: Wikipedia *Handpan*, sound-sculpture.de buying guide, instruments-du-monde (ding convex, tone fields = raised rim + concave dimple, nitrided steel).
- Tubik/Pixelmatters 2026 UI trends (light-reactive materials, liquid-glass, tactile micro-interactions; skip refraction that hurts legibility).
