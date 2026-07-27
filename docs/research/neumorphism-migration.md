# Neumorphism migration — what we have, what neumorphism.io is, and what the delta actually costs

Research note for the request: *"стандартизувати дизайн систему у всіх апках, прибрати кастомні компоненти,
мігрувати повністю на neumorphism.io, нашу дизайн систему можеш викинуть, повний редизайн, оціни обсяг."*

Everything below is measured from the repo at `e72323b` or sourced. Nothing is estimated from memory.

## 1. What our design system actually is

There are four layers, and only two of them are ours.

| Layer | What | Size | Ours? |
|---|---|---|---|
| **Tailwind CSS v4** | `@tailwindcss/browser@4` — in-browser JIT, **no build step, no npm, no config file** | CDN | no |
| **DaisyUI 5** | loaded as a **precompiled stylesheet** (`daisyui@5` + `daisyui@5/themes.css`), *not* as a Tailwind plugin | CDN | no |
| **`/_rt/theme.css`** | the CLAY themes (`signal` dark / `signal-light` light), the `--ms-*` density ladder, `--app-accent`, and **the SURFACE SYSTEM** | **667 lines** | **yes** |
| **`/_rt/ui.js`** | the kit — `Sheet · Segmented · Island · Panel · Slider · Transport` | **369 lines** | **yes** |

Plus `/_rt/render.js` (**916 lines**) — the spec-driven renderer that draws whole apps with no app code at all.

So: **there is no third-party "design system library" to throw out.** DaisyUI is a class vocabulary; the
design system is 1036 lines of our own CSS + components sitting on top of it.

### How it is wired (this matters for the plugin question)

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet">
<link href="/_rt/theme.css" rel="stylesheet">
```

Zero-build, zero-dependency, Deno-only. There is no `node_modules`, no `tailwind.config.js`, no PostCSS.

## 2. The finding that changes the whole question

**The farm already migrated to a soft-UI material system.** It is not "our old flat design system" — it is a
measured four-state surface system, landed over the last cycle (`docs/research/surface-system.md`,
`docs/research/claymorphism.md`, `theme.css:336-575`).

It has exactly the anatomy neumorphism has:

- **four surface states** — `BASE` · `RAISED` · `INSET` · `PRESSED`, with measured luminance deltas
  (+2.5 / +0.6 / −12.6 / −33.2 against the page)
- **five elevations** — `.sf-e1`…`.sf-e5` (flat · hover · raised · modal · popover)
- **one light source**, no exceptions
- **role-based application** — every DaisyUI node already declares a state: `.btn` raised, `.input`/`.select`
  /`.textarea` inset, `.toggle`/`.checkbox`/`.radio` a slot with a raised knob, `.progress`/`.skeleton` a
  trough, the dock rail inset with the active pill **raised out of it**, `.card` base, `.alert` raised,
  `.modal-box` L4, toast L5.
- a unit test enforces it: *"the surface system: every interactive node declares a state, and none draws its
  own shadow"* (`runtime_test.js:3687`).

That last bullet is the important one. **The style is applied by ROLE in one stylesheet, not per app.**
Changing the material means changing ~10 CSS custom properties, not touching 60 apps.

## 3. What neumorphism.io actually produces

A single-page generator. Inputs: base colour, size, radius, **distance (1–30px)**, **intensity (1–50)**,
**blur (0–60px)**, light-source quadrant, shape (`flat` / `concave` / `convex` / `pressed`).

Output is only ever two declarations:

```css
border-radius: 50px;
background: #e0e0e0;
box-shadow: 20px 20px 60px #bebebe,      /* dark, away from the light */
           -20px -20px 60px #ffffff;     /* light, toward the light */
```

- shadow colours = the base colour converted to HSL, then lightness ±intensity
- `concave` / `convex` swap in a `linear-gradient` background; `pressed` makes both shadows `inset`
- the light source is a **45° quadrant** — both `x` and `y` offsets are non-zero
- **hard requirement: the element's background must equal the page's background.** The whole illusion is
  that nothing is a separate object; it is the page extruded.

### Us vs it — the actual delta

| | neumorphism.io | ours (`theme.css`) |
|---|---|---|
| light source | 45° top-left (x **and** y offset) | directly above (**x = 0**) |
| raised face | = page colour | = `base-100` (same idea) ✓ |
| shadows | 2 outer, symmetric light+dark | rim on top + hue-matched drop below |
| shadow colour | HSL lighten/darken, neutral | **tinted with `--app-accent`** (the clay move) |
| recessed | `inset` version of the same pair | face **genuinely darkens** (−12.6 / −33.2) |
| shapes | flat / concave / convex / pressed | raised / inset / pressed |
| borders | none | 1px `--sf-edge` hairline |
| themes | one, mid-tone (`#e0e0e0`) | **two**, inverted (dark + light) |
| a11y | 1.2–1.5:1 on components | axe-gated ≥4.5:1 text, both themes, 60 apps |

**Structurally we are already there.** The literal differences are: rotate the light 45°, add the second
(light) counter-shadow, add the concave/convex gradients, drop the hairlines, and flatten the palette to a
mid-tone.

## 4. Three hard blockers, on facts

### 4.1 `tailwindcss-neumorphism` cannot be used here

- npm package, **v0.1.0, last published ~6 years ago**, written against the **Tailwind v3 plugin API**.
- Our Tailwind is **v4, in the browser**. `@tailwindcss/browser` has no module resolver — it cannot load an
  npm plugin at all. DaisyUI only works because it ships as **precompiled CSS**, not as a plugin.
- Our toolchain is Deno-only, zero-dependency: adding npm + a build step to get shadow utilities would be a
  larger architectural change than the redesign itself.

The plugin's whole output is `.nm-flat-*` / `.nm-inset-*` / `.nm-concave-*` — i.e. shadow presets keyed by
colour. We can express the identical thing in `theme.css` in ~15 lines, themed, without npm. **The plugin is
off the table on facts, not on preference; its effect is not.**

### 4.2 The axe gate will go red farm-wide on *pure* neumorphism

Pure neumorphism's defining trait — a low-contrast extrusion on a monochrome base — measures **~1.2–1.5:1**
between a control and its background. WCAG requires **3:1** for UI component boundaries and **4.5:1** for
text. This is the documented reason the style stalled in 2020–21 and is still the standing 2026 verdict.

Our `verify` gate runs **axe-core in BOTH themes** on every app × every tab × 9 breakpoints. It is not
advisory — `deploy.yml` is `workflow_run`-gated on it, so **a red verify never deploys**.

We have been burned by exactly this: commit `e02b538` — *"Every solid pair passed and all 58 apps still
failed: the contrast that matters is composited"* — and `4c2d4b4`, where muted text at 60% alpha dropped to
3.72:1 across all 58 apps the moment the surfaces were repainted.

**A literal neumorphism.io migration therefore has an unbounded tail**: not "restyle 60 apps", but
"restyle 60 apps and then negotiate contrast back into a style whose definition is low contrast."

The way through is the one the current system already takes: keep the *material* (extrusion, recess, one
light), keep contrast in the **face and the type**, and never let the shadow carry the meaning.

### 4.3 uiverse.io is MIT — and still the wrong source

Licence is fine (MIT, attribution appreciated not required). The problem is shape: uiverse elements are
standalone HTML+CSS snippets with **hardcoded hex colours and their own class names**. Pasting them:

- bypasses `--app-accent`, `--ms-*` density, both themes, the elevation ladder;
- has no i18n / `aria-label` / `aria-pressed` (our e2e asserts state, not classes);
- **is precisely the "кастомні компоненти" you asked to remove** — it would create them, not delete them.

Useful as **visual reference**. Not as a component source.

## 5. The measured scope of the farm

| Thing | Count |
|---|---|
| apps | **60** |
| tabs (screens) across all specs | **145** |
| apps drawn **entirely by `render.js`** (zero app code) | **13** |
| apps with their own view code | **47** |
| app view-layer LOC | **9 788** |
| all app JS (minus generated `sw.js`, vendored assets, adapters) | **12 008** |
| per-app CSS files | **0** ← everything is utility classes + `theme.css` |
| apps importing the kit (`/_rt/ui.js`) | **22** |
| apps **not** importing the kit | **38** |
| app-authored surface/material classes (`rounded-*`, `bg-base-*`, `shadow-*`, `border-base-content/*`, `backdrop-blur-*`) | **598** |
| breakpoints swept per tab | **9** |
| themes gated | **2** |

The 598 hand-authored surface declarations are the real debt, and they are style-independent: `rounded-2xl`
×162, `rounded-full` ×106, `bg-base-100` ×60, `border-base-content/10` ×44, `shadow-lg` ×10. Every one of
them is an app deciding a material question the design system should own.

## 6. Three options, scoped

### A — literal "throw it out, go pure neumorphism.io"

1. repaint both themes to a mid-tone base (neumorphism cannot extrude from `#0A0A0B` — there is no room to
   darken symmetrically), ~120 lines
2. rewrite the surface layer: 45° light, dual shadows, concave/convex gradients, drop hairlines, ~200 lines
3. re-tune the kit's 6 components + `render.js` (916 lines) against the new material
4. sweep **598** surface declarations across **47** apps
5. rewrite the surface unit tests + the contrast floors
6. **fight axe back to green across 60 apps × 145 tabs × 2 themes** ← the unbounded part
7. taste pass: 145 tabs × 2 themes × 3 shapes of screenshot

**~12–18 build/verify cycles**, of which steps 1–5 are predictable and step 6 is not. The risk is not the
work; it is that the endpoint may be unreachable while the axe gate stands — and the gate is what keeps
prod deployable.

### B — finish the material we already have (the delta tune)

Rotate the light, add the counter-highlight, push the radius scale, deepen `distance`/`blur` toward the
neumorphic end of the same dial. **`theme.css` values only** — because the system is role-based, this
repaints every one of the 60 apps with **zero app edits**.

**~1–2 cycles + 1 taste pass.** Reversible (it is a variable block). Gate-safe by construction.

### C — the standardization you actually named ("прибрати кастомні компоненти")

Independent of style, and worth doing under any of the above:

- **38 apps** off the kit → onto `Sheet / Segmented / Island / Panel / Slider / Transport`
  (note: of 23 candidates audited earlier, only 13 had a real `Segmented` strip — classify before converting)
- **598** app-authored surface declarations → deleted, the role rules in `theme.css` take over
- new preflight bans so they cannot come back (the farm already bans `modal-bottom`, hand-rolled
  play/pause, spinners and emoji this way — same mechanism)

**~4–6 cycles**, mechanical, gate-verifiable app by app, and it is what makes any future restyle a
one-file change instead of a 60-app sweep.

## 7. DECIDED — and what actually shipped

The owner chose **A: literal neumorphism, everything at once**, plus two calls that changed the plan:

1. **Palette back to black-and-white, not pastel.** Clay is out; surfaces are neutral greyscale, colour is
   for meaning only. Light base `#EEEEF1` (chosen over `#F5F5F7` and literal `#FFFFFF`), dark
   `#2A2A2E`.
2. **Relax axe for component boundaries, keep text at 4.5:1.** In the event **nothing needed relaxing** —
   see the correction below.

### The correction that made A affordable

§4.2 above overstated the axe blocker, and the mistake is worth keeping. Our gate
(`browser-lib.mjs:344-366`) runs axe with default rules and fails on `critical`/`serious`. **axe-core has
no automated rule for WCAG 1.4.11 non-text contrast** — component boundaries are a manual-review item and
were never gated. The 3:1 number is a property of the STYLE, not of a check we run.

So the only automated constraint is TEXT contrast, in both themes, plus the composited floors in
`runtime_test.js`. That is tractable, and it is what turned A from "12-18 cycles with an unbounded tail"
into ordinary work. **The binding constraint moved rather than disappeared**: dropping the light page from
`#FFFAF2` to `#EEEEF1` took `text-base-content/60` to 4.45:1 — under the floor — and it was paid for by
taking the light ink to near-black `#0A0A0C` (5.01:1). Solved in a scratch script against the farm's own
floor maths *before* any hex was written into `theme.css`.

### Shipped

- **Palette** — both themes repainted neutral, zero chroma. `base-100 === base-200` in each (the premise:
  a raised object is the page extruded, not a lighter panel). Every value checked against the composited
  contrast floors with margin.
- **Material** — `.sf-raised` / `.sf-inset` / `.sf-pressed` rebuilt on a symmetric shadow pair at 45°
  (`--nm-dark`/`--nm-light`, offset `--nm-d`, blur `--nm-b`), stepping with the density ladder. Elevation
  `sf-e1`…`sf-e5` kept; L4/L5 add a one-sided cast because a floating object has no far side to catch the
  counter-light. Hairline borders dropped farm-wide (`--border: 0`).
- **Role rules** — every node re-pointed: buttons, badges, fields + focus ring, toggle/checkbox/radio,
  progress, skeleton, dock, tabs, cards, alerts, menus, sheet, toast.
- **Glass removed** from everything that is our own surface: the sheet is opaque, and the dock, all four
  shell headers, `Island`, `Panel` and `Segmented` lost `backdrop-blur`. **Blur over foreign content
  survives on purpose** — reel's chips over a video frame, cam's viewfinder, LED and flash ring.
- **Apps swept** — 27 hand-authored shadows and 13 glass panels across 14 apps. `cam`'s button deck and
  `handpan`'s steel bowl were carrying hardcoded `rgba(0,0,0,…)` that would have become a bruise on the
  light theme; both now read the tokens.
- **Two new gates, so it cannot come back**: preflight bans an app-authored `shadow-{sm..2xl}` and frosted
  glass on a `bg-base-*` surface; a unit test asserts the pair is symmetric, the light stays at 45°,
  `base-100 === base-200`, the recess is the same colour, and the depth steps with density.
- **Docs** — `DESIGN_RUBRIC.md` and the skill's `rules/design.md` rewritten; the theme-token memory
  repointed off clay.

Local gates: ajv + preflight (60 apps) + **310** unit tests + `sw --check` + `counts --check`, all green.

## 7b. The taste pass — what it found, and why it is only 1/10 done

Sixty agents were fanned out, one per app, each to shoot four shapes and judge its own PNGs. **Only six
apps were actually reviewed** (`actions`, `air`, `ambient`, `apkforge`, `books`, `breathe`). The rest saw
nothing.

**Cause, and it was mine.** I told every agent to pass `--fresh` on every shot. `--fresh` is `force=true`,
a *paid re-render* — 60 apps × 4 shapes ≈ 240 forced renders against a free daily microlink allowance,
which the pass exhausted around the letter `b`. The instruction was right in intent (a cache hit right
after a deploy returns the build you just replaced) and wrong in dosage: only the apps shot *before* the
deploy needed forcing. **Next pass: no `--fresh` by default; force only on a re-shoot of an app already
photographed today, and run in waves.**

**One agent's report had to be thrown out entirely.** `handpan` returned `shotsRead: 4`, a `broken`
verdict and confident pixel measurements of the light theme — from files dated **five days before the
redesign** (`handpan.png`, `handpan_mock.png`; there is no `handpan@phone~light.png` at all). A stale
artifact read as fresh evidence is worse than no evidence, because it is *specific*. Any future fan-out
must verify the shot's mtime, not the agent's claim.

### What the six real reviews found — and it was worth the pass on its own

Two systemic defects, both **measured off screenshots before anyone could explain them**, and both
confirmed as arithmetic afterwards:

1. **The light theme's pair was lopsided 2.4:1.** `--nm-dark #C6C6CC` is −39 from a `#EEEEF1` base while
   `--nm-light #FFFFFF` is only +16. Dark was exactly ±16. That single asymmetry is why light read as an
   ordinary drop shadow with a faint halo instead of an extrusion — the redesign's core premise, quietly
   half-failing in one theme. Now −21/+16 (1.3×); a perfectly symmetric ±16 would be too faint to carry
   the material, and going further requires a darker base, which is the owner's call.
2. **Blur exceeded 2× its offset**, so each half bled back around the *near* edges and drew a 1px dark rim
   between every card and its own highlight — "the page extruded" turning back into "a rectangle with a
   border". Fixed at the base *and at all four density steps*, which is where the newly-written gate
   immediately caught me: I had fixed the base pair and left the steps at 2.5× and 3×.

Plus two regressions I introduced and had not seen:

3. **Every range track went invisible.** `--range-bg` pointed at `--sf-inset-face`, which the repaint
   redefined to `base-100` — the exact colour of the surface the slider sits on. A 6px track cannot hold a
   shadow pair, so it is the one place tone must stand in for depth: `--sf-track-face` is now a real step.
4. **119 files still carried the pre-redesign `#0A0A0B`** in `theme_color` / `background_color` / the
   `#boot` shell, so every installed PWA showed a near-black splash and status bar against a `#2A2A2E`
   app. The boot dock stub was outright *invisible*, because it relied on `base-100` being lighter than
   `base-200` — which by design it no longer is. No screenshot could ever have caught this: microlink
   renders the page, never the OS chrome around it. A code read found it.

Both fixes ship with the gate that holds them: a symmetry assertion (max 1.5× ratio, both themes, and it
says "move the base" rather than "widen the strong side"), a blur:offset check across *every* declaration
site, and a PWA-chrome check that pins `theme_color`/`background_color`/`<meta theme-color>` to the theme
bases.

## 7c. Material unification — every surface declares what it is

78 bespoke surfaces across 32 apps had never adopted the material: still painting depth with a hairline
or, far more often, a **tone step** — a colour standing in for a shadow. Fanned out 14 agents (one per
heavy app, the rest batched so no two agents ever shared a file). Result: **111 surfaces converted, 60
borders removed, 61 tone steps replaced**, the last 3 frosted-glass sticky rows gone.

**The rule the pass was built on: geometry carries meaning and is not ours to touch.** rave's pads are
the worked example — a cell said on/off with `bg-base-300` vs `bg-base-300/25` and now says it with
material (OFF a recess, ON raised in its track's colour). The 16 columns, cell height, beat grouping and
sweep ring are byte-identical. Nothing became a `Segmented`, `Panel` or `Island`.

**The refusals were the most valuable output**, and they are the reason to keep briefing agents to stop
rather than to comply:

- **handpan's steel tone fields** look exactly like an app painting its own depth, and converting them
  was the obvious move. The agent stopped: those shadows are a live specular driven by the gyroscope
  (`--lx`/`--ly` written per frame), and a shadow pair cannot express a directional highlight that moves
  with the phone. The ding is convex, the outer fields are concave dimples — the vocabulary was already
  literal and correct. Converting would have deleted the light-reactivity.
- **rave's pager ticks** sit over a live three.js canvas, where a near-base tone would vanish against
  arbitrary content — ink stays.
- **reel's scrims and chips over video** — foreign content, blur and dark tone are correct there.
- **~12 `border-b` rules** that separate list rows rather than outline an object.

Two e2e specs moved and both got **stronger**: `ambient` stopped asserting a class substring
(`border-primary`) for `data-on`/`aria-pressed`; `transit` gained two assertions it never had. Both
attributes were checked to render the expected values rather than trusting the agents' claim.

**A gate hole found by this pass:** the glass ban only matched `backdrop-blur-<suffix>`, so four sticky
headers using Tailwind's bare default `backdrop-blur` walked straight through the check that exists to
catch them. Widened. Both material bans now scan **with comments stripped** — `outpost` was failing its
own app for a note describing the hairline-and-glass it had already removed, and a gate that punishes
documentation teaches people to delete the documentation.

### Still open

*(Kit migration and the hairline sweep — the two items that stood here — are DONE: §7c. What follows is
what genuinely remains.)*

- **THE BIG ONE: 54 of 60 apps have never been looked at.** The screenshot quota died 6 apps in, and the
  owner stopped the work there on cost. Everything since §7b is verified by **code and gates only**. A
  green gate is a floor, not a verdict — `docs/GATE_BLINDSPOTS.md` is the catalogue of defects that
  shipped with every gate green, and the two material defects this redesign actually had were both found
  by **eye**, on screenshots, and neither was visible to any gate. Assume more are waiting.
  When resuming: **no `--fresh` by default** (it is a paid re-render; 60 apps × 4 shapes exhausts the free
  daily tier), force only a re-shoot of something already photographed that day, and run in waves.
  **Verify each PNG's mtime before trusting a verdict** — one agent returned confident pixel measurements
  read off files five days older than the redesign.
- **Specific things a review flagged that were never confirmed or fixed** (from the 6 apps that did get
  looked at, all still open):
  - `--hdr-h` is a fixed 3.5rem and appears in **no** density media query, while `--dock-h` is measured
    and does compact. At 360×340 the header still costs 56px — 16.5% of the viewport — and one app
    measured 58% of a split-sm screen as chrome. Same class of defect as the `--dock-h` lesson.
  - `breathe` amputates at split and split-sm: the phase label, the countdown numeral and the play key
    are all off-screen (hardcoded `max-w-[210px]` orb + fixed `gap-5`, and the tab declares no `"fit"`,
    which is why no gate caught it).
  - `Transport` may collapse to zero width when placed beside something in a flex row (`@container` is
    inline-size containment, so it contributes no intrinsic width). Reported against stale screenshots, so
    **unconfirmed** — but it is a kit-level claim and cheap to check in code.
  - `ambient`'s disabled Transport disc renders a face *lighter* than the page in dark — the one move the
    material forbids — with the play glyph at 1.73:1. Disabled controls are exempt from axe, so no gate
    sees it.
  - `btcflow` and `crypto` gate their fixtures on their own `isLocal` check instead of `/_rt/gate.js`, so
    `?mock` seeds nothing on the live host. Their screens can only populate from a live socket, which
    means an empty shot there is a **failed capture, not an empty-state defect**.
  - `air` rendered LIVE data under `?mock` — worth checking whether the flag reaches every app.

## 8. Original recommendation (superseded by §7)

**C first, then B.** In that order the second one is nearly free, because C is what turns a redesign into a
variable edit. A is the same visual destination as B plus a contrast fight the deploy gate is designed to
lose on our behalf.

If the goal is specifically *"it should look like neumorphism.io, not like what's on prod now"* — that is
answerable in **one cycle** by pushing the dial in B and shooting it, before committing 12–18 cycles to A.
The dial is: light angle, counter-highlight strength, `distance` / `blur` / `intensity`, radius, and whether
the hairline stays.
