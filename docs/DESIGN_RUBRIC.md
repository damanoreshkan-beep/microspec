# Design taste gate — rubric

The automated gates (axe, overflow@384, the responsive matrix, e2e) prove an app is **correct, accessible, and
responsive**. They cannot see whether it's **well-designed** — a screen can pass every check and still look
generic, incoherent, or cluttered. (`brick`, named in several examples below, was deleted on
2026-07-30; the examples stay, because what they teach does not depend on the app still existing.) This rubric is the fourth gate: an **agent** (Claude, in a session or a
headless CI step) reads server-rendered screenshots (`packages/gates/shoot.mjs` — no local Chromium, no API
key) and judges them here. It's the "VLM" of the farm.

Run — **three shapes, both themes, every time**. One reference shot is not a taste pass: the defects this
rubric exists to catch (amputation, squashing, a transport that collapses into a stub) only appear in the
short window, and the ones axe cannot see only appear in the *other* theme.

```
deno run -A packages/gates/shoot.mjs <app…> --seed                 # the reference device (384×832)
deno run -A packages/gates/shoot.mjs <app…> --seed --bp split      # 412×430 — two apps on one phone
deno run -A packages/gates/shoot.mjs <app…> --seed --bp split-sm   # 360×340 — the floating-window floor
deno run -A packages/gates/shoot.mjs <app…> --seed --theme light   # …and any of the above in the other theme
```

Then download `main.png` **and** `light.png` for each and review them against the criteria below. A verdict
that cites only the tall dark shot is not a verdict — say which shape and which theme each finding came from.

### Looking inside a canvas — `tools/art/frame.mjs`

`shoot.mjs` photographs a **deployed** page, so for an app that draws into a `<canvas>` the eye test cost a
deploy plus a microlink shot per look — one CI round per glance, which is why nobody glanced, which is why
`brick`'s picture drifted (see [GATE_BLINDSPOTS](GATE_BLINDSPOTS.md) §13). One real frame, drawn through the
app's own `render.js` into a PNG, with no browser and no canvas, now costs a fifth of a second:

```
deno run -A tools/art/frame.mjs brick --out /tmp/brick.png
deno run -A tools/art/frame.mjs hunt  --out /tmp/hunt.png --frames 140 --scale 3 --seed 0xB21C
# it re-execs itself with its import map; the explicit form is
deno run -A --import-map=tools/art/frame.importmap.json tools/art/frame.mjs brick --out x.png
```

Defaults are the gate seed, the app's own frame count and `--scale 3`; it prints the buffer's size, seed,
step count and **distinct colour count**, because a preview you cannot check is not evidence. It is the same
`renderFrame()` the browser runs — a second painter against one pass order — so the two cannot diverge
silently. It shows the **game**, never the console around it: chrome, layout, and how much of the screen the
picture is getting are still `shoot.mjs`'s job.

## Criteria

**Hard (block the merge):**
- **No content-less spinner** — the app + a modern skeleton, never a bare spinner. (Also caught by preflight.)
- **No rim-hugging / clipping** — nothing touches or is cut off by the screen edge; consistent gutters.
- **Readable** — no low-contrast or cramped text. (axe catches most; the eye catches the rest.)
- **No overlap / collision** — elements don't visually stack or crowd into each other.
- **A one-screen app does not scroll** — an instrument whose controls run off the bottom is broken, not
  "scrollable". Check the compact states, not just the tall one: `shoot.mjs <app> --bp phone-land`.
- **An instrument's own display gets the space; chrome and body take what is left, never the reverse.**
  A map, a game, a visualiser, a camera view: the thing the app exists to show is sized first, and the
  frame around it is whatever remains. Both console games shipped the other way round — the picture was
  a fraction of a body that was itself sized to its contents, so a 390px phone showed a 155px game with
  two thirds of the viewport empty. **No overflow check can see this**; it is the direction they do not
  measure (GATE_BLINDSPOTS §14). If the app has one subject, assert the *share* it gets, as a fraction
  of its container, in the e2e — a ceiling is not a floor.
- **Split-screen keeps every function** — at `412×430` and `360×340` (two apps on one phone; in the matrix)
  nothing may be dropped to make room. A control that no longer fits becomes an **icon**, or moves into a
  Sheet; a stage moves BESIDE its controls (`.ms-side`), not away. Look for the amputation: a screen that
  "fits" because its save button, its repeat mode or its visualiser quietly stopped rendering is a fail, and
  no overflow check can see it — only the eye can. The dock may drop its labels; it may not drop its
  targets or its accessible names.
- **A player is the player** — anything that plays uses the kit's `Transport` (`/_rt/ui.js`), never a
  hand-rolled play button (preflight bans the toggle; the eye catches the rest). At `split` check the whole
  ladder in one look: the play key still reads as the primary control, prev/next/repeat/shuffle are all
  present, the app's own tools are icons (or an `⋯` that opens them **with their words**), and the seek bar
  still has both timestamps. A transport that lost its repeat mode to fit is the amputation above, in the
  one component where it is easiest to miss.

**Coherence (orange — fix before shipping):**
- **Composed, not squashed** — at a short height the layout should read as a *denser version of itself*
  (tighter rhythm, smaller glyphs), never as the same layout crushed: no collapsed labels, no controls
  pushed under the dock, no element that only fits because it clipped.
- **Kit, not clones** — sheets/strips/panels look identical across apps because they ARE the same
  component. A screen whose sheet or tab strip is subtly its own is a divergence, not a personality.
- **One geometry per concept** — don't mix shapes for the same idea (e.g. a circle toggle beside square
  day-cells for the same "done" state).
- **One representation per state** — never draw the same state twice (e.g. "today" as both a toggle and a
  highlighted history cell).
- **Aligned to a grid** — consistent spacing, edges, and baselines; nothing visibly off.
- **Chrome sanity** — no affordance that does nothing here (e.g. a refresh button on a fully offline app).
- **A preference the user never asked for is a decision you took away from the design.** An option is
  not generosity; it is the author declining to choose, and every branch of it is a thing that must
  stay true. The console catalogue is the case to remember: nine device silhouettes cost each game a
  settings tab whose content was a picture of a settings screen, and — because a table of shells has to
  differ *somewhere* — it made the aperture a styling variable, which is nine chances to be wrong about
  the only number a player can see. Ship the one you would defend; a variant earns its place by being
  asked for.

**Craft (orange — the details that compound):**
- **Concentric radius** — a rounded rectangle nested inside a padded surface takes `--ms-r-in`
  (`outer − padding`), never its parent's radius. Equal radii across a gap make the bezel thicken at the
  corners and thin along the edges; it reads as "off" without naming itself. Pills (`rounded-full`) and
  surfaces more than ~24px apart are exempt. Pinned by `runtime_test.js`.
- **A transition names its properties** — `transition-all` is banned (preflight + unit sweep). The material
  is box-shadow, so `all` cross-fades the extrusion itself on every state change, and it animates layout
  properties off the compositor. A playhead or step marker stays OUT of the transition set, or it smears
  across the row instead of stepping.
- **One icon set** — `lucide:` only (preflight + unit sweep). Mixed libraries differ in stroke weight and
  optical size on the same row, which reads as sloppiness rather than variety. Missing shape → a runtime
  SVG, never a second library.
- **The words are part of the interface** — verb-first buttons, a confirm button that repeats the
  consequence ("Delete project", never "OK"), empty states that orient and point forward, errors that say
  how to fix it, one vocabulary per concept in BOTH locales. No gate can see any of it; it is read on the
  shot, and `--locale en` is the one nobody looks at by accident. Full rules in the skill's `rules/copy.md`.

**Taste (yellow — raise the bar):**
- **Restraint** (Linear / shadcn) — hairlines over heavy borders; no decorative gradients, no emoji soup,
  no purple-AI cliché.
- **Colour = meaning** — colour encodes state/identity, never decoration; and never as text where it fails
  contrast.
- **Clear hierarchy** — an obvious primary action; scannable, not flat or cluttered.
- **Self-evident** — no hand-holding captions or hint text a good UI wouldn't need.

## Modern baseline (2027 — the standing bar, applied without being asked)

Every app is built to the *current* bar by default — nobody has to request "make it modern". This is the
established language; match it and push it forward, never regress to generic. (Mirrored in the skill so it's
a standing assumption, not a per-task ask.)

- **Type:** the Geist superfamily (Geist + Geist Mono, Cyrillic) — never Inter/system defaults.
- **Ink is the brand:** primary IS base-content — `#EDEDF0` dark / `#0A0A0C` light, both NEUTRAL; colour
  (blue secondary/accent, success/warning/error) is for *meaning* only. `packages/runtime/theme.css`.
- **The palette is NEUTRAL GREYSCALE and the material is NEUMORPHIC**
  (`docs/research/neumorphism-migration.md`). This replaced the clay repaint wholesale — surfaces carry no
  hue at all now, and the volume is a symmetric shadow pair rather than an edge treatment. Four rules, and
  the first two get violated by instinct:
  1. **The surface IS the page.** `base-100 === base-200`, and a recess is the same colour as what it sits
     in. A raised object is the page *extruded*, not a lighter panel laid on top — the moment a card gets
     its own tone the pair reads as a drop shadow under a rectangle, which is the look this replaced.
     Lightening a face to say "raised" is the classic mistake and flattens the material instantly.
  2. **Volume is a PAIR: one dark shadow away from the light, one light shadow toward it.** A single-sided
     shadow is a card on a page. Both halves, always, at 45° — x and y offsets are the same token so the
     farm has exactly one light source and no component can drift its own.
  3. **The base tone needs headroom in BOTH directions**, which is why dark is `#2A2A2E` and light is
     `#EEEEF1` rather than the near-black/near-white they replaced. On `#0A0A0B` there is nothing to darken
     toward; on `#FFFAF2` nothing to lighten toward. Either way the counter-highlight dies and the
     extrusion collapses to a bevel. **This is physics, not taste — do not "clean up" the base to pure
     black or pure white.**
  4. **The shadow is NEUTRAL.** The clay system tinted it with `--app-accent`; this one must not, or every
     surface starts saying something and colour stops meaning anything. `--app-accent` stays a MARK colour.
  **Check the COMPOSITED pair, never the solid one.** The farm renders `text-base-content/60` in 66 files;
  an alpha over a surface is what axe measures. Dropping the light page from `#FFFAF2` to `#EEEEF1` cost
  exactly that pair its margin (4.45:1 — under the floor), and it was paid for by taking the ink to
  near-black. Muted text is the binding constraint of any light theme, so the **base tone is set by
  contrast, not by taste**. `runtime_test.js` computes it locally and matches axe exactly.
- **No glass over our own surface, and no hairlines.** Frosted glass and the extrusion answer the same
  question and cannot both be on screen — the blur erases the very shadow pair that makes the surface read.
  Sheets are opaque (`.modal-box`), which also makes their text contrast deterministic. Blur over FOREIGN
  content (a video frame, a camera feed) is still correct. Preflight bans both an app-authored
  `shadow-{sm..2xl}` and a blur sitting on a `bg-base-*` surface.
- **One page scroll:** content flows in `<main>`; no `position:fixed` panel with a nested `overflow-y-auto`.
  Overflow → a history-backed sheet (`S.screen`). A **single-screen** tab declares `"fit": true` and then
  must not scroll *at all*, at any viewport height — the verify gate enforces it across the matrix.
- **One kit, not fifty:** `/_rt/ui.js` — Sheet · Segmented · Island · Panel · Slider · **Transport**. A
  bespoke copy of any of them is a defect (preflight bans a hand-rolled `modal-bottom` **and a hand-rolled
  play/pause toggle**). Components size off the `--ms-*` density tokens, which step by viewport HEIGHT, and
  carry the app's own hue via `--app-accent` (`spec.accent`) — a MARK colour for dots/rings/fills, never text.
- **The screen is a lit volume, not a flat sheet** (`theme.css` — "the enclosure"). A viewport-fixed wash
  lights the box from above and the walls are an edge-only inner shadow + rim. Surfaces then MEAN
  something: **raised** (`sf-raised` — dock, sheet, island, button, card) vs **recessed** (`sf-inset` — a
  slider track, a rail, a field, a skeleton: something a value sits in) vs **pressed** (`sf-pressed` — the
  only state you cause by touching). The light never touches type, never sits behind text, and never
  animates — a full-viewport layer repainting forever is a battery bill, not a design.
- **A widget declares what it IS, it never draws a shadow.** `sf-raised` · `sf-inset` · `sf-pressed`, or a
  rung of the ladder `sf-e1`…`sf-e5`. Those read `--nm-dark`/`--nm-light`, so they invert with the theme
  and compact with the density ladder (`--nm-d`) for free. A hardcoded `rgba(0,0,0,.5)` does neither: it is
  invisible on a dark page and a bruise on a light one. **Preflight enforces this.**
- **Instant app-shell** (`#boot`), opaque sheets (`.modal-box`), rounder radii, **haptics** on tap.
- **Delete safety:** reversible → `store.undo` (undo-toast); severe → `store.confirm` (danger sheet).
- **Floors that are also gates:** no spinners (skeletons), installable (build + verify PWA gates),
  history-backed overlays, i18n parity (en + uk).
- **No emoji, ever** — they're OS-specific colour clip-art, cheap and unthemeable. Use a crafted vector (iconify
  `lucide:*`/`mdi:*`, a runtime SVG like `/_rt/zodiac.js` `Sign`) or, where a component can't render (a native
  `<option>`, a data string), plain words. Preflight enforces it (`\p{Emoji_Presentation}`).

### A LIVE STAGE: atmosphere that is the data, and the three ways it goes wrong

`tab.stage` (dashboard) and `HeroStage` (tool) put a WebGPU scene behind a screen, driven by real numbers —
`weather`'s sky is this hour's cloud cover, precipitation, wind and sun altitude. Judge one offline before
it ships: `deno run -A tools/art/hero.mjs <app> --vary a,b,c,d --light 0|1 [--sheet 3x3]`, which renders the
same WGSL at the reference device in ~1.4 s. **A data-driven scene is judged by its STATES**, so render the
extremes (clear noon, overcast rain, night, snow) in *both* themes — a single pretty frame proves nothing
about the other twenty the data can produce.

Three failures, all found on the weather sky, all invisible to every gate:

1. **Compose in DISPLAY space, not linear.** Against `#2A2A2E` (0.024 linear) an innocent-looking `+0.055`
   is a 2.3× lift, so every term slams into its ceiling and the frame renders as one flat slab with no
   subject in it. In display space the numbers mean what they look like — base 0.165, `+0.03` is a quiet
   step — and the budget is legible to the next reader. **Write the budget down in the shader** and keep the
   sum inside the clamp; if a frame is riding the clamp, the bug is the budget.
2. **A radius is in p-units and a p-unit is the frame HEIGHT** (832 px on the reference device). A "halo" of
   0.85 is a 707 px radius — the whole screen, i.e. a flat global lift with no glow anywhere in it. Convert
   every distance to pixels before believing it, cell grids included: a 0.016-of-a-cell rain streak is
   0.44 px, which is arithmetically present and visually absent.
3. **Legibility is the shader's job, because axe cannot see a canvas.** It reads the DOM background and will
   sign off on white-on-white. So a stage under type carries an explicit luminance clamp — weather's frame
   may move 0.17 toward the page's own extreme and 0.30 away from it, measured to keep `base-content` at
   6.4:1 worst-case dark and 12.6:1 light. Moving that number moves a contrast floor for every string on
   the screen; it is a contract, not a look.

And one design rule that is not a number: **do not paint the stock version of the subject.** The catalogue
answer for a sky is saturated cerulean with white cumulus, and it would be the most saturated object in the
farm — this palette is neutral and colour means something. Weather is carried by structure and motion
instead, with hue confined to light TEMPERATURE (chroma under ~0.05, warm low sun, cool high sun). The same
logic forced day and night apart in kind rather than in brightness: **daylight is broad light with no disc,
night is a small crisp disc plus stars**, because in an ink palette a grey circle is a grey circle and a
clear noon rendered as a clear midnight until the two stopped being the same object at different values.

Three more, found on `hoard`'s molten heap (GLSL on `/_rt/glstage.js`) and each of them a whole render cycle:

4. **A frequency is in p-units too, and p.x is TINY.** `p = (uv-0.5)*vec2(aspect,1.0)` makes the p-unit the
   frame HEIGHT, so on a 384×832 phone `p.x` spans only ±0.23. `fbm(p*1.6)` is therefore **less than one
   noise cell across the whole width** and renders as a flat slab with no structure in it — the same class
   of error as the 707 px "halo", pointing the other way. The multiplier for N features across the width is
   **N × (height/width)**, which is N × 2.17 at the reference device; a cell at frequency f is 832/f px and
   an fbm doubles four times. State the intended feature size in PIXELS in the shader and derive the number.
5. **`floor(coord/n)` + hash is a visible LATTICE.** Sparkles, gems, stars and dust laid out on that grid
   read as a broken particle system, because the eye finds the alignment instantly. Jitter the point inside
   its cell and give it a radial falloff. And gate it on the thing it belongs to: `hoard`'s glints were
   gated on a `crest` term that is 1 everywhere ABOVE the pile, and sprinkled treasure across the empty sky.
6. **A metal held under a flat luminance ceiling is not metal.** Gold clamped into a legibility band renders
   as khaki: what the eye reads as metal is a few per cent of pixels going far brighter than the body ever
   does. Let the specular terms (rim, glints) past the clamp — and **buy the licence with a height gate**,
   so the overshoot fades out below the band where type sits (`hoard`: out by up 0.62, the amount block
   starts at 0.65). The body's clamp, which is the actual contrast contract, stays untouched.

Also from `hoard`, on the light theme: **on near-white paper a warm material must be DARKER than the paper.**
A band of [0.58, 0.95] rendered a gold field as lemon candy; [0.50, 0.88] plus a `pow(f, 1.7)` on the body —
so only the highlights climb — reads as gold leaf. Work the floor out from the contrast requirement rather
than guessing: 4.5:1 against `base-content` #0A0A0C allows a floor of display **0.472**.

When a genuinely new next-year pattern is relevant, do a quick trend-research pass, fold it in with restraint,
and **update this section + the skill** so the baseline compounds.

## Verdict format (what the agent emits)

```json
{
  "app": "habits",
  "score": 0,
  "blocked": false,
  "findings": [{ "severity": "red|orange|yellow", "criterion": "one-representation-per-state", "note": "…" }],
  "strengths": ["restrained dark theme", "colour=meaning on non-text elements"]
}
```

Policy: `blocked: true` only on a **hard** (red) finding — those are objective. Orange/yellow are design
debt to fix, not build-blockers (an agent's aesthetic judgment is non-deterministic; don't gate the build on
taste, gate it on the objective floor and *surface* the taste).

## Review log (what the agent taste gate found)

Each row is a real finding no axe/overflow/e2e check could see. 🔴 fixed (hard), 🟠 fixed, 🟡 = logged debt.

| App | Sev | Finding | Status |
|---|---|---|---|
| habits | 🟠 | "today" drawn twice (circle toggle + ringed week-cell), two geometries | fixed — strip is now the 7 days before today |
| habits · rave · ruler | 🟠 | dead refresh button on offline/tool apps (no-op `load`) | fixed — `app.canRefresh` hides it for tool/stream apps |
| ruler | 🟠 | total-distance **skeleton never resolves** in the no-GPS/denied state (a disguised infinite loader) | fixed — shows "—" once located OR errored |
| rave | 🟡 | preset chips (Техно/Ейсід/…) have no active/selected state | fixed — active chip is `btn-primary` while the pattern still matches it |
| rave | 🟡 | 8 FX sliders are icon-only; several icons ambiguous (drive? reverb?) | fixed — each slider now labelled (icon + name caption) |
| rave (generated) | 🟠 | pressing Generate yields a mostly-dark 16×16 matrix — the ~6 voices it drew carry the same visual weight as the 10 it skipped, so the payoff is illegible | fixed — silent tracks render off-cells at `bg-base-300/20`; verified by re-shooting the live deploy. Note the first attempt (`/40`) shipped and did NOT work — base-300 over base-200 in the dark theme is too small a delta, and only the frame showed it. Nothing is hidden or untappable; every row keeps its height, hit area and aria state |
| rave | 🟡 | the FX rack (6 labelled sliders) now outweighs the instrument: it eats ~40% of the fixed header and clips the sequencer mid-row at the dock. Note the cause — the earlier fix on line 62 (labelling ambiguous icons) doubled the rack height. A fix traded one defect for another | open — needs a layout call (collapse the rack? move FX behind a sheet? two-column labels?), not a unilateral restructure |
| rave | 🟢 | hat / ohat / ride are near-identical blues (cyan-400 / sky-400 / teal-400), adjacent rows hard to tell apart | wontfix — deliberate family coding (warm = low end, blues = cymbals, greens/purples = bass); hue carries the family, position carries the voice |
| farm (dock) | 🔴 | the active tab was **never visible** — `text-primary` vs `text-base-content/80` is 100% vs 80% of ONE colour (this theme sets primary = base-content), a measured **1.56:1** where 3:1 is the floor for telling two UI states apart. Both states pass axe individually; axe never compares a state to a state | fixed — the active tab is a filled ink pill, 16.6:1 against the island. The signal is a shape, not a luminance step on a 9px glyph. See [GATE_BLINDSPOTS](GATE_BLINDSPOTS.md) |
| farm (dock) | 🟠 | dock labels clipped their diacritics — "ЛІНІЙКА" rendered as "ЛІНІИКА": theme.css uppercases them while the class had `leading-none` + `truncate`, so Й lost its breve. The runtime was misspelling Ukrainian | fixed — `leading-[1.4]`; also repaired launches ("НАИБЛИЖЧІ") |
| farm (dock) | 🟡 | island redesign, twice wrong before right: `flex-1` (a ZERO basis) inside `fit-content` squeezed the tabs and truncate ate the labels ("ГОЛО…"); `auto-cols-fr` then sized every column to the WIDEST, so a one-letter "Я" sat in a column built for "ЗБЕРЕЖЕНІ" and the island grew to 80% of the screen | fixed — content-sized columns + `min-w-14` (above the 44px tap floor). Both failures were the wrong layout primitive, not wrong taste |
| ruler | 🟠 | a GPS instrument that never showed a coordinate — distance, area and ±accuracy were all there; "where am I" was not. Every gate checked the DERIVED numbers | fixed — lat/lng at 5 decimals, tap to copy, guarded by an e2e |
| frontier · hf | 🟡 | two cards show identical `14K★` — `compact()` rounded away the difference | fixed — 1 decimal through 99.9K (14.2K vs 13.6K) |
| frontier | 🟡 | "Деталі ↗" used an external-link arrow for an in-app drill-down | fixed — runtime uses a chevron when the card drills into a detail view |
| brick | 🔴 | the density hierarchy was **inverted**: the source art's outlines all landed on the densest ink, so the ground was heavier than the character standing on it and the first frame read as a picture of a floor. On a display whose only variable is how dark a segment is, **density IS attention** | fixed — every class of thing is remapped into its own band (backdrop 1 · terrain 1-3 · objects 2-3 · actors 2-4), so the one thing you control is the one thing you can always find |
| brick | 🔴 | every block in the game was lit from the **wrong side** — the extrusion let the source art's own contour serve as the lit edge, and Kenney draws contours dark, so the face turned toward the light was the heavy one | fixed — the lit edge is drawn by `extrude()`, never inherited. The same rule as `--nm-light` in theme.css: a widget declares what it IS and the material draws the light |
| brick | 🟠 | six brick tiles in a row merged into one dark bar — extruded edge-to-edge, adjacent blocks butt together with no seam | fixed — one row and one column of each cell are cleared. Note the first attempt shrank the art to make room and **resampled the crate into a blank slab**: it solved the separation and destroyed the texture, which is a trade nobody asked for |
| brick | 🟡 | clouds drawn as rectangles read as a rendering artefact rather than as sky | fixed — three rounded lobes per cloud, flattened underneath |
| brick · hunt | 🔴 | the game was ~155px (brick) and ~115px (hunt) wide on a 390px phone, in a console body that shrink-wrapped its contents, so two thirds of the viewport was empty page. **This gate missed it too** — the shot was looked at more than once and read as "a console, a bit small", which is exactly what a taste note sounds like when the defect is a number | fixed — the nine-shell catalogue is gone, one device fills the view, the aperture takes the whole body; an e2e in each game now measures the body against `#view` and the canvas against the body in fractions |

| mirage · farm (kit) | 🔴 | the mode strip ran out of its island at 412×430 — not the app: the deployed CSS had no `[&>button]:flex-1` and no `@container` at all, because the build's class scanner cut every token that starts with `[` or `@`. Every Segmented, the Transport's demotion and the Slider's inline caption were source-only for the life of the compat build; every gate green (CI runs source + CDN) | fixed — scanner admits `[`/`@`, build self-check + unit pin (GATE_BLINDSPOTS §15) |
| mirage · farm (kit) | 🟠 | a fitted Segmented SQUASHED in a narrow column ("Т… · О.. · О..", then one letter each at 360×340) — two options with the same visible text | fixed — the kit measures the labelled width and demotes to glyphs (aria-label keeps the word) |
| mirage | 🟠 | three labelled result pills truncated on the reference device | fixed — one word (the hand-off) + two glyphs (save, share) |

Every finding fixed. The taste gate now has zero open debt on the reviewed apps.

Strengths repeatedly noted: restrained dark palette (no gradients / emoji soup), colour = meaning carried
by non-text elements (a11y-safe), clear hierarchy. `frontier` correctly **keeps** refresh (it has a real
`load`) — validating the auto-detect.
