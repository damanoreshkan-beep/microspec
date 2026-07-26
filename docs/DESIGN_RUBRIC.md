# Design taste gate — rubric

The automated gates (axe, overflow@384, watch@200, e2e) prove an app is **correct, accessible, and
responsive**. They cannot see whether it's **well-designed** — a screen can pass every check and still look
generic, incoherent, or cluttered. This rubric is the fourth gate: an **agent** (Claude, in a session or a
headless CI step) reads server-rendered screenshots (`packages/gates/shoot.mjs` — no local Chromium, no API
key) and judges them here. It's the "VLM" of the farm.

Run — **three shapes, both themes, every time**. One reference shot is not a taste pass: the defects this
rubric exists to catch (amputation, squashing, a transport that collapses into a stub) only appear in the
short window, and the ones axe cannot see only appear in the *other* theme.

```
deno run -A packages/gates/shoot.mjs <app…> --seed                 # the reference device (384×832)
deno run -A packages/gates/shoot.mjs <app…> --seed --bp split      # 412×430 — two apps on one phone
deno run -A packages/gates/shoot.mjs <app…> --seed --bp split-sm   # 360×340 — the floating-window floor
deno run -A packages/gates/shoot.mjs <app…> --seed --bp watch      # 208×248 — watch mode (rail + pager)
deno run -A packages/gates/shoot.mjs <app…> --seed --theme light   # …and any of the above in the other theme
```

Then download `main.png` **and** `light.png` for each and review them against the criteria below. A verdict
that cites only the tall dark shot is not a verdict — say which shape and which theme each finding came from.

## Criteria

**Hard (block the merge):**
- **No content-less spinner** — the app + a modern skeleton, never a bare spinner. (Also caught by preflight.)
- **No rim-hugging / clipping** — nothing touches or is cut off by the screen edge; consistent gutters.
- **Readable** — no low-contrast or cramped text. (axe catches most; the eye catches the rest.)
- **No overlap / collision** — elements don't visually stack or crowd into each other.
- **A one-screen app does not scroll** — an instrument whose controls run off the bottom is broken, not
  "scrollable". Check the compact states, not just the tall one: `shoot.mjs <app> --bp phone-land`.
- **Split-screen keeps every function** — at `412×430` and `360×340` (two apps on one phone; in the matrix)
  nothing may be dropped to make room. A control that no longer fits becomes an **icon**, or moves into a
  Sheet; a stage moves BESIDE its controls (`.ms-side`), not away. Look for the amputation: a screen that
  "fits" because its save button, its repeat mode or its visualiser quietly stopped rendering is a fail, and
  no overflow check can see it — only the eye can. The dock may drop its labels; it may not drop its
  targets or its accessible names.
- **Watch mode reaches everything** — at `208×248` and `200×200` the dock is a vertical **rail** on the
  right (icons only, targets intact, every tab one tap away) and a `.ms-side` layout is a **swipe pager**,
  not a squeezed split. Check that: both pages are reachable, the indicator says which one you are on, the
  header kept its controls and lost only its wordmark, and nothing is under the rail. A watch screen that
  "works" because half its controls are off-canvas with no way back is the amputation rule again, at the
  size where it is most tempting.
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
- **Ink is the brand:** near-white primary; colour (purple secondary/accent, success/warning/error) is for
  *meaning* only. `packages/runtime/theme.css`.
- **Floating glass islands:** dock + header are `bg-base-100/80 backdrop-blur-xl` + hairline + rim; a tool
  app's persistent controls become islands like them.
- **One page scroll:** content flows in `<main>`; no `position:fixed` panel with a nested `overflow-y-auto`.
  Overflow → a history-backed sheet (`S.screen`). A **single-screen** tab declares `"fit": true` and then
  must not scroll *at all*, at any viewport height — the verify gate enforces it across the matrix.
- **One kit, not fifty:** `/_rt/ui.js` — Sheet · Segmented · Island · Panel · Slider · **Transport**. A
  bespoke copy of any of them is a defect (preflight bans a hand-rolled `modal-bottom` **and a hand-rolled
  play/pause toggle**). Components size off the `--ms-*` density tokens, which step by viewport HEIGHT, and
  carry the app's own hue via `--app-accent` (`spec.accent`) — a MARK colour for dots/rings/fills, never text.
- **The screen is a lit volume, not a flat sheet** (`theme.css` — "the enclosure"). A viewport-fixed wash
  lights the box from above, the app's accent bounces off the bottom, and the walls are an edge-only inner
  shadow + rim. Surfaces then MEAN something: **raised** (dock, sheet, island — a lip catching that light)
  vs **recessed** (`.ms-trough` — a slider track, a rail, a field: something a value sits in). The light
  never touches type, never sits behind text, and never animates — a full-viewport layer repainting forever
  is a battery bill, not a design.
- **Instant app-shell** (`#boot`), **liquid-glass sheets** (`.modal-box`), rounder radii, **haptics** on tap.
- **Delete safety:** reversible → `store.undo` (undo-toast); severe → `store.confirm` (danger sheet).
- **Floors that are also gates:** no spinners (skeletons), installable (build + verify PWA gates),
  history-backed overlays, i18n parity (en + uk).
- **No emoji, ever** — they're OS-specific colour clip-art, cheap and unthemeable. Use a crafted vector (iconify
  `lucide:*`/`mdi:*`, a runtime SVG like `/_rt/zodiac.js` `Sign`) or, where a component can't render (a native
  `<option>`, a data string), plain words. Preflight enforces it (`\p{Emoji_Presentation}`).

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

Every finding fixed. The taste gate now has zero open debt on the reviewed apps.

Strengths repeatedly noted: restrained dark palette (no gradients / emoji soup), colour = meaning carried
by non-text elements (a11y-safe), clear hierarchy. `frontier` correctly **keeps** refresh (it has a real
`load`) — validating the auto-detect.
