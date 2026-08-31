# Luminous icons — the DreamStudio style contract (2026-08-31)

The owner's own visual language, distilled from 34 reference frames (two series: plexus brains on black,
spectral figures in a gilded hall), and validated with 24 generated icons in three rounds. Everything
below is measured; the UNVERIFIED list is at the end.

## The style, in six rules

1. **Light IS the structure.** An object has no solid surfaces: it is woven from thin luminous filaments and
   bright nodes (plexus / fibre-optic / a string of points). Form reads through the lattice and its glow, not
   through fill or material.
2. **Volume comes from bloom and translucency**, never from shadow or bevel. Depth is a glow gradient: hot core
   → soft halo → black. Near nodes are hotter, far ones dimmer; you can see through the object.
3. **The ground is deep black** and there is a lot of air: the subject takes ~40–55 % of the frame in the
   references. No text, no frame, no tile drawn into the picture.
4. **Two temperature poles on black:** warm amber/gold ↔ electric cyan, magenta as a rare third. Colour lives
   only in the light; ground and "body" carry none. Decision (owner, 2026-08-31): **ONE pair farm-wide —
   amber + cyan**; magenta stays out of the icon set.
5. **The support plane is scattered light, not a floor** — particles, a holographic ring, a reflection. For a
   square icon a floor costs space and varies per image, so the icon contract removes it (rule 6 in the prompt).
6. **Cinematic, dreamlike, luxurious** — not technical.

This is the opposite of the farm's previous language (matte noir, one violet neon, neumorphic shadow pairs).
Icons are the first artefact of the new language; the design-system repaint is a separate task.

## Brand

The product is **DreamStudio** (`dreamstudio.mooo.com`). **microspec** is the name of the core technology
(the spec + adapter runtime) and stays in technical docs and the repo name; it leaves the store/launcher UI.
(Owner, 2026-08-31.)

## The generation recipe (VERIFIED, rounds 1–3)

- **Model: `mrfakename/Z-Image-Turbo` only** (owner's pick; FLUX.1-schnell only as an outage fallback — it
  renders a different filament look, and two models in one grid read as two sets). 1024×1024, PNG, ~25 s.
- **Where it runs:** the edge's browser pods (`microspec-vpn-p1…p4`, each its own egress), reached from
  inside `microspec-edge`: `POST http://<pod>:8765/gen {ids:["mrfakename/Z-Image-Turbo"], prompt,
  size:{w:1024,h:1024}, k:1, concurrency:1}` → `{job}`; `GET /job/<id>` answers `image/png` when done.
  Four pods in parallel, sequential per pod: **8 icons in 60 s**, 24/24 delivered, zero refusals across
  three rounds. The phone's own IP is NOT the place to run this: ZeroGPU anonymous = 2 GPU-min/day/IP and
  `@spaces.GPU` (60 s declared) admits two runs. (`edge/browser/server.mjs:380`, measured 2026-08-31.)
- **Prompt template** — subject phrase first, then the fixed style block:

      <SUBJECT>, drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of
      bright threads and points of light, translucent, nothing solid, no paper, no metal, no glass,
      volumetric bloom, floating alone in an empty pure black void with generous empty space around it,
      no floor, no ground, no reflection, no shadow, warm amber gold light with clearly visible electric
      cyan accents on the outer nodes, cinematic, no text, no letters

- **The subject phrase decides legibility, not the style.** Round 1 ("a radio antenna emitting waves", "a
  camera lens") produced blobs; round 2 ("the silhouette of a tall radio mast with three concentric arcs of
  radio waves above it", "…camera lens seen from the front, concentric aperture rings") read at 512 px.
  Rule: **name a strong silhouette plus ONE distinguishing feature**, as "the silhouette of …".
- **Objects the model knows as a material resist the style** (paper, metal tines, mirror tiles). "no paper"
  in the style block was ignored twice for "an open book"; **"the outline of an open book drawn as glowing
  lines, two fanned page blocks meeting at a spine"** worked. Phrase such subjects as outlines/lines.
- **Cyan needs an explicit anchor** ("clearly visible … on the outer nodes"); with "hints of cyan" (round 1)
  the set came out mono-amber.
- **Ground:** "a faint scatter of particles beneath it" (round 1–2) produced a reflective floor in 7/8. The
  round-3 block ("no floor, no ground, no reflection, no shadow") removed it in 5/8 and left a faint glow in
  3/8 — acceptable for a tile.

Measured geometry of the delivered frames (`geom.mjs`, luminance > 30, 2 px stride): background corners
0–13/255 (true black); subject bbox 610–940 px wide of 1024 (60–92 %), centre within ±30 px of the frame
centre except floor-bearing frames (books/kalimba: +60…+130 px low). So: **no auto-crop** — the full frame
IS the "any" tile; the maskable tile scales the frame to 0.74 so an 82 %-wide subject stays inside Android's
80 % safe circle.

## The asset pipeline (VERIFIED spikes, no new toolchain)

- **Master in the repo: `apps/<id>/icon.webp`, 1024², opaque, quality 90.** Measured on two icons: q88 =
  94–130 KB, round-trip mean error 1.3/255 (max 21); PNG of the same frame = 1.2 MB. 75 masters ≈ 9 MB.
  With an alpha plane WebP grows to 380–530 KB (alpha is lossless) — so alpha is DERIVED at build, not stored.
- **Alpha from luminance is exact here:** the ground is black, so every pixel is colour·α on black;
  α = max(r,g,b) above the measured black floor (corners + 2), colour = pixel/α. This yields the transparent
  APK adaptive foreground (`icon-fg-432.png`) and lets a consumer composite on any ground.
- **On a light ground the glow reads as washed pastel** (composited on #EEEEF1: legible, weak). Decision:
  **an icon always carries its black ground** — it is a picture, like a real app icon; the light theme shows
  black tiles with a soft shadow, not a re-tint (the iconTint path is retired for these).
- **Derivatives via the resvg already in `deploy/icons.mjs`** (`<image href="data:image/png;base64,…">` +
  `clipPath rx` renders correctly, corner α = 0, centre α = 255): `icon-192/512.png` (rx 20 %), the maskable
  pair (scale 0.74 on black), `apple-touch-icon.png` (180, square), `icon-fg-432.png` (alpha-derived). Cost
  ≈ 1.6 s per app on this phone.
- **`favicon.ico`** = an ICO container of PNG frames 16/32/48 (Vista+ format), 60 lines of Deno; `file`
  confirms "MS Windows icon resource — 3 icons … PNG image data". 9 KB.
- **`icon.svg`** = an SVG wrapper embedding a 256² WebP (`@jsquash/webp` encodes in Deno; 9 KB at q82 →
  ~12 KB SVG). A real vectorisation would destroy the bloom. The wrapper is what README (`<img
  src="icon.svg">`), `<link rel="icon">` and the store grid consume, so those keep working unchanged.
- **Consumers to walk in one edit** (enumerated, `rules` §4): `deploy/build.mjs` copy allow-list (add
  `webp`), `deploy/icons.mjs`, `deploy/build-app.mjs`, `deploy/manifest.mjs` (`art`), `apps/store/view.js`
  (`AppArt`), `deploy/og.mjs` (card uses brand paths — switch to the master), `deploy/readme.mjs` (fine),
  `packages/gen/scaffold.mjs` (`icon.svg` writer), `packages/runtime/apk.js` (reads fg/mask — contract kept),
  `deploy/sw.mjs` (precache comes from `<link>` tags → `icon.svg` already in).

## UNVERIFIED / open

- `brand.svg` (lucide paths) stays for now as the `og.png` glyph and the store's no-icon fallback; whether
  og cards move to the master is a Phase 4 (store/logo) call.
- 76 chrome files (`index.html` `<link rel="icon">`) are untouched; `favicon.ico` is emitted beside the icons
  and picked up by the root only. Adding the `<link>` belongs to the base repaint (theme_test gates chrome).
- The DreamStudio logo: not yet generated (Phase 4); the round-0 "sphere of interwoven light threads" is
  the lead.
