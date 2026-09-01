# The theme split — structure in the core, the brand in the product (spec, 2026-09-01)

Owner: "а чого у нас зміна ui впливає на все ядро, винеси в ui тему зовсім на рівень dreamstudio бо люди
хочуть свою ui". Today `packages/runtime/theme.css` (1007 lines) mixes two things that change for two
different reasons: the STRUCTURE every consumer needs (the density ladder, the chrome contract, the fit and
split-screen rules, the watch ladder, the surface classes) and the MATERIAL of one product (DreamStudio's
true-black ground, the amber/cyan pair, the luminous rim + bloom, the portal chrome with its 12 sprites,
the Geist wordmark). Every brand tweak is therefore a core release, and a second product cannot bring its
own look. This spec separates them.

## Contract

**The core ships `packages/runtime/runtime.css`** — structure plus a NEUTRAL default material, so a
consumer with no brand file renders a clean, plain, accessible UI (and the core's own generated demo passes
every gate on it). It owns:

- the density ladder (`--ms-*`, `--r-*`, `--bw-*`, the height and TV steps, `--ms-r-in`), the chrome
  contract (`--hdr-h`, `--dock-h`, `--dock-w` fallbacks; `.ms-fit`, `.ms-stage`, `.ms-side`, `.ms-cols`,
  the split-screen and watch ladders, the dock's position rule);
- the surface SYSTEM: `.sf-raised / .sf-inset / .sf-pressed / .sf-e1…e5 / .sf-frost / .sf-track` and the
  role rules (buttons, badges, switches, progress, nav rail, cards, alerts, sheets) — each reading tokens
  (`--sf-drop`, `--sf-sink`, `--sf-press`, `--sf-lift2`, `--sf-sink2`, `--sf-inset-face`, `--sf-press-face`,
  `--sf-track-face`, `--nm-cast`, `--lm-*`, `--ms-vol-*`), never a literal;
- the hooks the runtime's markup carries and their GEOMETRY-FREE defaults: `header.navbar` (sticky, the
  height, the pane gradient off `--color-base-100`), `[data-dock-fade]`, `[data-garland]`, `[data-empty]`,
  `[data-theme-art]`, `[data-title]` (mono, uppercase, weight, size, tracking), `[data-island]`,
  `.ms-decor`, `.modal-box`, motion rules (`prefers-reduced-motion`, the sheet transition);
- the neutral defaults for every token — flat: a 1px neutral rim, no bloom, no sprites (`--ds-*: none`),
  neutral bases (`signal` = #111/#1a1a1a on #f0f0f0 ink; `signal-light` = #ffffff/#f4f4f4 on #111 ink),
  a system font stack. The two theme NAMES stay — `signal` / `signal-light` — because the runtime's toggle,
  the gate and `scaffold` address them; a brand recolours them, it does not rename them.

**The core's `packages/runtime/theme.css` is one line** — `@import "./runtime.css";` — so an existing page
that links `/_rt/theme.css` keeps working and a consumer with no brand gets the neutral default.

**A product ships `rt/theme.css`** — `@import "./runtime.css";` first, then its material: the palettes for
the two theme names, the `--sf-* / --lm-* / --ms-vol-*` token values, the fonts, the header band and
hairline, the garland geometry, the corner curls, the theme-toggle art, the empty-state scatter, the
enclosure's volume and walls, the wordmark bloom — plus the sprites it references (`rt/ds-*.webp`). The
overlay REPLACES the core's `theme.css` by name, in the gate's server and in the build alike. DreamStudio's
`rt/theme.css` is the luminous material, moved verbatim: the acceptance test is the eye — the store in
both themes must look the same as before the split, and every product gate stays green.

**What moves with it:** the brand tests (`the material: light IS the structure`, `the pair of light is
text-safe`, `PWA chrome colours track the theme bases`, `a SURFACE is extruded`) leave
`packages/runtime/tests/theme_test.js` for the product's `rt/tests/theme_test.js` (barrel `rt/rt_test.js`),
reading `rt/theme.css`; the structural tests stay and read `runtime.css`. The sprites and
`tools/art/ds-import.mjs`'s output move to `rt/`; the importer stays in the core as a generic png→alpha-webp
tool with an `--out` directory.

## Mechanism changes (each a named failure today)

1. **Overlay precedence** — `packages/gates/serve-handler.mjs` serves `/_rt/` framework-first; the build
   copies the overlay ON TOP. A product `rt/theme.css` would win in dist and lose under the gate. Fix: the
   overlay wins everywhere (rt/ first, then the framework), for every file type the build already copies
   (.js, .css, .json, .webp).
2. **`scaffold` measures `theme-color` off the CORE's theme.css.** With the brand in the overlay it must
   read `rt/theme.css` when the tree has one — else a product ships PWA chrome in the neutral colours.
3. **The SW precache lists what index.html loads by tag** (`theme.css`) and does not follow `@import`, so
   `runtime.css` would be a cache miss offline. `deploy/sw.mjs` follows same-origin `@import` in the CSS
   it precaches. No build-time flattening: one extra cached request is not worth a bundler.
4. **`rtmap`** builds the preflight map from `rt/*.js` only — unchanged; CSS is not imported by modules.

## Acceptance

- Core: `deno task gates` green; the generated demo verifies in CI on the NEUTRAL default (a plain,
  legible UI; axe green in both themes).
- Product: `deno task gates` green; `deno task build`; deploy green; `vps/eye.sh store` and `--light`
  indistinguishable from the pre-split shots (v4/v5 in the session scratch); the header, garland, curls,
  theme art and empty-state scatter all present; `theme-color` in every built manifest unchanged.
- No file in the core references a sprite, a brand colour or Geist by name.

## Status — SHIPPED (core 1.1.0, 2026-09-01)

Measured before the push: core `deno task gates` green on the neutral default (the demo's manifest
colours re-measured to `#111114`); the core checkout's suites + the product's suites on the product tree
— 658 passed, 0 failed; `deno run -A <core>/deploy/build.mjs` in the product: `dist/_rt/theme.css` is the
LUMINOUS module, `runtime.css` and the 12 sprites present, every `sw.js` precaches `runtime.css`. The
acceptance shots (store, both modes) are compared after the deploy.

## Decision log

- `@import` chain over a build-time concatenation: one cached request, zero new machinery.
- Theme NAMES stay `signal` / `signal-light` (API); a brand recolours, never renames.
- Overlay-by-name (`rt/theme.css` replaces the core's) over a second `<link>`: no page rescaffold across
  73 apps, and the core's own theme.css keeps consumers without a brand working.
- Version: core **1.1.0** (a consumer that never had `rt/theme.css` sees the neutral look — a visible
  change, hence minor, not patch); DreamStudio bumps in the same hour with its `rt/theme.css`.
