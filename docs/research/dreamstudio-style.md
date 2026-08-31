# DreamStudio style — the portal, the two sides, the tilt engine (research, 2026-08-31)

The owner's artistic logic, stated once so every later pass builds on it and not beside it:

> **The screen is a PORTAL.** The chrome (header, dock) is the portal's *rim* — it catches light; it never
> drops a flat black shadow. Depth is told with LIGHT, not with blur or grey smears. And the portal has two
> sides: **NIGHT** (the dark theme — the moon's side: black depth, woven light filaments, fireflies,
> amber + cyan) and **DAY** (the paper theme — the sun's side: gilded golden threads and rays on warm
> paper). Themes are identities, not palettes; the theme toggle is literally sun and moon.

Everything sensor-driven below is "a game engine, purely for design": real device tilt moves the LIGHT on
the rim — the way a lacquered box turns under a lamp — not layers sliding (parallax is explicitly *not*
the effect; the owner said so).

## The tilt engine — the math (verified sources)

**Input.** `deviceorientation`: `beta` = rotation about X (front-back, −180…180), `gamma` = rotation about
Y (left-right, −90…90) ([MDN gamma](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/gamma),
[MDN device orientation events](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events)).
`alpha` (compass) is NOT used — the farm already learned a heading must never come off alpha
(`[[reference_compass_gimbal_look]]`).

**Normalisation.** The rest pose of a phone in a hand is ~β=40°, not 0 — normalise against a slowly-adapted
rest pose, not against flat-on-table:
`tx = clamp((γ − γ₀) / 30, −1, 1)`, `ty = clamp((β − β₀) / 30, −1, 1)`, where `(β₀, γ₀)` is an EMA of the
input with a very low constant (τ ≈ 8 s) — the "where the hand settled" tracker. 30° of tilt = full travel.

**Smoothing: the 1€ filter** (Casiez, Roussel, Vogel — CHI 2012,
[paper](https://direction.bordeaux.inria.fr/~roussel/publications/2012-CHI-one-euro-filter.pdf),
[reference impl](https://github.com/jaantollander/OneEuroFilter)). An adaptive low-pass: slow motion →
low cutoff (kills jitter), fast motion → high cutoff (kills lag).

    α(fc, Δt) = 1 / (1 + 1/(2π·fc·Δt))          — smoothing factor of one exponential stage
    x̂ᵢ  = α·xᵢ + (1−α)·x̂ᵢ₋₁                     — exponential smoothing
    dxᵢ = (xᵢ − x̂ᵢ₋₁)/Δt, smoothed with fc = d_cutoff (1 Hz)
    fc  = min_cutoff + β_gain·|d̂x|               — the adaptive cutoff

  Starting constants for tilt-as-light: `min_cutoff = 1.0 Hz`, `β_gain = 0.02`, `d_cutoff = 1.0 Hz` —
  tune by eye on the device, they are the two knobs the paper says to tune (jitter ↔ lag).

**Light from tilt.** The rim light is a directional highlight whose screen offset is simply
`(dx, dy) = (k·tx, k·ty)` with k ≈ 4–8 px for chrome hairlines and k ≈ 12–20 px for the enclosure wash —
moved with `transform: translate3d()`, never `background-position` (transform composites; position paints).
This is the farm's own gyro-specular precedent (handpan's light-reactive buttons,
`[[reference_gyro_material_buttons]]`) promoted to the SYSTEM.

**What we deliberately do NOT do:** full head-coupled off-axis projection
([Kooima, Generalized Perspective Projection](https://www.semanticscholar.org/paper/14d1b312aba825bcce17edd67e3fdc139f1a76a2),
[head-coupled perspective](https://en.wikipedia.org/wiki/Head-coupled_perspective)) — it needs eye tracking
to be honest; with tilt alone it lies about the geometry and reads as wobble. The portal's depth comes from
the LIGHT moving and from static depth cues (rim occlusion, luminance falloff), which is exactly the
"не зовсім параллакс" the owner asked for.

## Energy budget (the hard rules)

Sources: [web.dev device orientation](https://web.dev/articles/device-orientation),
[MDN devicemotion](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicemotion_event).

- **Zero rAF at rest.** The engine is EVENT-driven: a sensor event updates the filter; ONE
  `requestAnimationFrame` is scheduled only if none is pending (rAF-coalescing), writes the two custom
  properties (`--ds-tx`, `--ds-ty`) once, and stops. No loop, ever.
- **Dead-band**: |Δ| < 0.004 after filtering → no write at all. A phone on a table costs nothing.
- **Consumers are compositor-only**: `transform: translate3d(calc(var(--ds-tx)*Npx), …)` and `opacity` on
  fixed, `will-change`-free layers (a handful of small elements; the browser promotes them on first move).
- **Pause on `visibilitychange`** (unsubscribe), resubscribe on visible; **`prefers-reduced-motion`
  disables the subscription entirely** — the portal is then lit statically.
- **iOS permission**: `DeviceOrientationEvent.requestPermission()` exists and needs a user gesture; NEVER
  prompt for decoration — if permission is not already granted (or the API absent), stay static. Sensor
  apps that already asked (compass, handpan) get the effect for free.
- Weak phones: no canvas in chrome, no animated blur/filter, sprites are small webp (<15 KB) decoded once.

## The two sprite sets

Generated like the icons (Z-Image on the pods), each set on ITS OWN ground so the alpha is exact math:

- **Night** (`/_rt/ds/n-*.webp`): corner curl, dock strand, particle scatter, portal ring, horizon arc,
  wisp — woven amber filaments + cyan sparks on pure black; α = max(r,g,b) above the measured black floor
  (`alphaFromBlack`, deploy/icons.mjs — already shipped for the APK foregrounds).
- **Day** (`/_rt/ds/d-*.webp`): sun disc, corner ray curl, strand with sun motifs, golden motes, horizon
  arc, sun+moon pair — gilded golden threads on pure white paper; α = "distance from white":
  for a pixel P over white, P = C·α + 255·(1−α) ⇒ **α = 1 − min(r,g,b)/255, C = (P − 255·(1−α))/α**
  (the exact mirror of the black-ground formula; min channel because gold removes blue first).

Use is RESTRAINED and chrome-only: the dock's strand, a corner curl in the enclosure, the scatter behind
empty states — decoration wears `.ms-decor` (the watch ladder already drops it), never under text, and the
axe bed never changes because sprites sit in the chrome band, not behind content.

## The portal chrome (what replaces the black shadows)

Today's offenders, measured (`theme.css`, `render.js`): `--nm-cast rgba(0,0,0,.9)` composed into
`.sf-e4/.sf-e5/.sf-frost/.modal-box/[data-toast]/menus`, and `DockFade`'s solid
`linear-gradient(base-200 38% → transparent)` band under the dock — on true black these read as flat black
smears (the owner: "банальна чорна тінь").

- Dark/night: floating things separate by **rim + bloom + a tight dark EDGE veil** (blur ≤ 8px, spread
  negative — an occlusion line, not a smear); the cast term goes.
- Paper/day: a soft warm cast IS honest daylight — it stays (`rgba(40,32,20,.22)`).
- Header = the portal's lip: its lit hairline moves with `--ds-tx` (the light slides along the edge as the
  phone tilts). Dock the same, opposite phase (light source is above).
- The enclosure gains a depth falloff (radial darkening toward the rim on night; a warm paper vignette on
  day) — static, cheap, and the one place a corner sprite may live.
