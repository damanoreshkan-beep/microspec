# sigil — research note

**Goal (one-shot target):** an installable micro-PWA that forges a *sigil* — a personal glyph encoding a
statement of intent — from typed text, deterministically, and renders it as a **powerful, unusual 3D
talisman** (three.js), with a 2D fallback so the browser-free gates still pass. Create + keep + share.

## The two authentic techniques (sourced, not invented)

1. **Spare distillation** (Austin Osman Spare, *The Book of Pleasure*, 1913 → chaos-magic canon).
   Write the intent in the present tense → **strike the vowels and every repeated consonant** → what
   remains is combined into one glyph that no longer reads as letters.
   Sources: juniperdivination "AOS method"; mysticryst "The Original Sigil Technique".

2. **Agrippa kamea trace** (Cornelius Agrippa, *De Occulta Philosophia* II, 1533).
   Each planet owns a **magic square (kamea)** whose side is the planet's number — Saturn 3×3, Jupiter 4×4,
   Mars 5×5, Sun 6×6, Venus 7×7, Mercury 8×8, Moon 9×9. A name is converted to numbers and drawn as **one
   continuous line** through those numbered cells → a unique planetary sigil.
   Sources: learnreligions "Planetary Intelligence Sigils"; occult-study "Agrippa and the Magic Squares".

## The composition we build (decision — closed)

`intent → distill (Spare) → attribute a planet (deterministic hash) → trace the distilled letters across
that planet's kamea (Agrippa) → smooth to a flowing curve → forge in 3D`.

- **Distill** — Unicode-aware (Latin **and** Ukrainian): keep letters, uppercase, drop vowels
  (`AEIOU` + `А Е Є И І Ї О У Ю Я`), keep first occurrence of each consonant. Honors the farm's en+uk rule.
- **Attribute** — a 32-bit FNV-1a hash of the normalized intent picks one of the 7 classical planets, so the
  square **order varies 3–9** and every sigil carries a planet (rendered as its `astro.js` shaded token).
- **Trace** — each distilled letter → a number in `1..order²` (alphabet rank, wrapped) → that number's cell
  in the kamea → the cell centre. Successive centres are connected: the classical continuous line.
  Traditional marks: a small **start ring** on the first letter, a short **perpendicular end bar** on the last.
- **Squares** — odd orders by the **Siamese** method, doubly-even (4, 8) by the **diagonal-complement**
  method, and order 6 is the **canonical Agrippa Sun kamea** hard-coded (the tricky singly-even case; avoids
  a Strachey-construction bug). Every square is asserted **magic** in unit tests (rows = cols = both
  diagonals = `n(n²+1)/2`).

All of the above is **pure, deterministic, unit-tested** in `/_rt/sigil.js` — never in the app
(farm rule: depth lives in the runtime like `groove.js` / `astro.js`). The app owns only taste + the binding.

## The 3D — "powerful & unusual", within the farm's proven constraints

Follows `reference_webgl_threejs_in_farm` + the `rave` pattern exactly:

- **three lazy-imported inside the effect**, init **probe-guarded on `getContext('webgl')`** (NOT gate-guarded)
  → CI's headless Chrome renders the real 3D; preflight's linkedom (no WebGL) throws → caught → **Canvas2D
  fallback** draws the smoothed path + kamea dots (keeps a `[data-sigil]` marker so preflight/e2e pass).
- The sigil curve → `THREE.CatmullRomCurve3` (a hash-seeded gentle z-relief so it is a ribbon in space, not a
  flat decal) → **`TubeGeometry`**. Unlike `rave` (MeshBasic only), the filament is a **`MeshStandardMaterial`
  metal** lit by **one moving `PointLight`** — no GLSL, screenshot-verifiable — so a real **specular glint
  travels along the forged line** as the light moves. This is the "forged talisman" look.
- **Gyro-reactive** (optional, behind a gesture like `rave` immersion — NOT a required reading, so this is
  *not* a sensor app): `tilt` drives the light vector + a slow parallax; when absent, a seeded idle rotation
  keeps the shot alive (never a dead flatline — the `rave` idle lesson).
- **Forge animation**: on generate, the tube reveals along its length via `geometry.setDrawRange` (the line
  draws itself), and visited kamea nodes flare (accent), unvisited stay dim ink.
- Perf discipline (rave-proven): **one** reused `WebGLRenderer`, **DPR ≤ 1.5**, geometry disposed + rebuilt on
  regenerate (never leak contexts), scratch objects hoisted, additive back-shell for glow (`depthWrite:false`),
  no post-processing.

## Design (baseline, not re-decided)

Theme `signal` (the mystic cluster — tarot/transit/horoscope — and `rave` all use it). **Ink is the brand**:
the filament is near-white; **purple accent = meaning** (the forged/attributed state, the active node). Geist
+ Geist Mono. Floating-glass control island for the intent field + forge, like the dock. One page scroll.
No emoji (planet = `astro.js` token + its name word; no `♄`). No hint captions — the craft is self-evident.

## Surfaces & invariants

- Tabs: **Forge** (create) · **Grimoire** (saved, IndexedDB via `/_rt/db.js collection`) · **Me** (profile).
- Grimoire item → history-backed detail sheet (`S.screen`) showing the big sigil + intent + planet + a
  **share** action (canvas → `toBlob` → `navigator.share({files})`, download fallback). Every sheet passes the
  `h.back()` routing test.
- **Delete safety**: removing a saved sigil uses the undo-toast (`store.undo`) — a mis-tap is recoverable.
- i18n en+uk parity on every string; both themes pass axe (dark + light); no overflow@384.

## Pitfalls captured (so the build lands once)

- **Duplicate consecutive cells** collapse a Catmull curve → dedupe consecutive identical points; guarantee ≥2
  points (fall back to the square centre) so a one-consonant intent still yields a mark.
- **All-vowel / empty intent** → `sigilPath` returns `null`; the view shows the empty forge, not a throw.
- **Theme-flip colours must be CSS** (the view doesn't re-render on toggle) — filament/nodes use theme vars,
  never a JS-computed hex.
- **Motion is progressive enhancement**, so no `[data-live]` requirement; but the 2D fallback still needs its
  own render marker for the gate.
