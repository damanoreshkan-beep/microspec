# Authoring a microspec app (the agent-driven loop)

There is **no autonomous API generator** — the LLM in the loop is the agent (Claude) working in-session.
The human gives a prompt; the agent authors the app-specific files; deterministic tooling does the rest;
CI is the gate (and it now reviews **both themes**).

## The loop

```
prompt → probe source → author spec.json (ajv-gated) → author data.js|view.js → scaffold → e2e → push → CI green (both themes)
```

1. **Probe the data source first** (never build on an unverified API): check status / CORS / shape with a
   plain `deno eval` fetch. Confirm it returns `ACAO: *` to a browser `Origin` (direct works on a static
   host), or plan the `/feed` fallback. Pick a keyless, CORS-friendly source. (A **tool** app with no
   network — pure math like `sun`/`transit` — skips this.)

2. **Author `spec.json`** — the declarative app *structure only* (theme, tabs, card slots, detail,
   filters). **Translations are NOT inline** — each language is its own file: `apps/<id>/i18n/uk.json`
   and `apps/<id>/i18n/en.json` (flat `{ key: string }` dicts; `en` is the required fallback). index.html
   composes them (`start({ ...spec, i18n })`); the ajv gate composes too, so a missing key still fails.
   Add every new UI string to **all** locale files at once. Families: `list` (feed|row|grid|table) ·
   `converter` · `dashboard` · `tool` · `profile`, plus top-level `detail` and the systemic capabilities
   below. See `packages/schema/SCHEMA.md`.
   **No raw cards (enforced):** a `feed` card must carry a preview slot — at least one of
   `subtitle` / `body` / `image`; a title-only feed card is rejected by the validator. Use `layout:"row"`
   for a compact title+value line, `layout:"grid"` for an icon tile (needs `icon`|`image`), or
   `layout:"table"` for dense columns. If the source has no preview text (e.g. Hacker News), add
   `enrich: { url, body }`; foreign-language text follows the UI locale via `translate: [...]`.
   **Gate it immediately:** `deno run -A packages/schema/validate.mjs apps/<id>/spec.json`.

3. **Author the adapter** — one bespoke piece per app:
   - **data app** → `data.js`: `export async function load(filters) → { items, meta, next }`, using
     `import { viaProxy, isJsonObject } from "/_rt/feed.js"`. Every field a card/detail references must
     exist on each item. **Never format dates here** (no locale → a baked string freezes one language):
     return the raw timestamp; the card `meta`/detail renders it locale-aware with `format` `ago`/`when`/
     `since`. `searchFetch` reads `filters.q`; `paginate` returns a `next` cursor. Missing images: emit a
     deterministic data-URI placeholder so a card is never image-less (see `apps/wiki`).
   - **stream app** → `stream.js` (live WS/SSE rendered as a list).
   - **tool app** → `view.js` (custom Preact view) — see next section.

4. **Scaffold the boilerplate** — never hand-write the shell:
   `deno run -A packages/gen/scaffold.mjs apps/<id>` (index.html + manifest + sw + icon.svg). Mode auto:
   `tool` if `view.js`, `stream` if `stream.js`, else `data`. Provide `brand.json` `{bg,fg}` + `brand.svg`
   (lucide **stroke** paths — the icon wraps them in `fill:none;stroke:fg`). After adding an app, rerun
   `deno run -A deploy/manifest.mjs` → regenerates the launcher list `apps/home/apps.json`, **and**
   `deno run -A deploy/sw.mjs` → regenerates every app's service-worker precache manifest from the real
   import graph. Scaffold only writes a `sw.js` *placeholder*: the shell an app must cache to open offline
   isn't knowable until its imports exist. `deploy/sw.mjs --check` gates this in CI, and it is part of the
   local gate set — run it whenever you change what an app imports or what index.html loads. Never
   hand-edit `apps/<id>/sw.js`; the logic lives once in `packages/runtime/sw-core.js`
   (see [research/offline-first-sw.md](research/offline-first-sw.md)).

5. **Author `e2e.spec.mjs`** — `export default [{ name, run(h) }]`. Poll on a *real* content marker, not
   `.card` (the skeleton is also `.card`): `[data-fav]` for data feeds, or the tool's own marker
   (`[data-mark]`, `[data-sun]`, `[data-bearing]`). Test the routing invariant: open every overlay /
   sub-screen and assert `h.back()` closes it (not exits). Note badge/label CSS uppercases text → use `/i`
   regexes.

6. **Pre-flight locally (browser-free) BEFORE pushing** — catches the render class of bugs in ~2s so you
   don't burn a ~1-min CI round-trip on them:
   ```
   deno run -A --import-map=packages/gates/preflight.importmap.json packages/gates/preflight.mjs apps/<id>
   ```
   It mounts spec+view in a linkedom DOM and fails on: a throwing view (undefined var, bad import, V8-only
   syntax), an **unclosed tag** (htm renders the tag name as literal text → corrupt DOM), a **missing i18n
   key** referenced by the view (`T(t,"x")` in a locale that lacks `x`), or a blank render. It does NOT
   replace verify (axe/overflow/shots need Chromium) — run both: preflight first, then push.

7. **Push → CI is the gate** (below). **Check the run-level conclusion**, not streamed per-job output.

## Tool apps — compose the SYSTEMIC runtime, don't rebuild

A `type:"tool"` tab renders the `view.js` export named by its `view` key. Props: `{ S, t, tab, toast,
screen, openScreen, closeScreen }`; read reactive state with `useStore(S.t | S.filters | S.locale)`.
Compose the shared runtime components instead of writing geometry/astronomy from scratch:

- **`/_rt/ui.js` — the UI kit. Use it; do not build a second one.** Six nodes, and each of them replaced a
  pattern that eight apps had already copied and quietly diverged on:
  - `<Sheet id open onClose title subtitle icon>…</Sheet>` — the ONE bottom sheet. Owns the glass shell,
    drag-to-dismiss, the title row + close, the backdrop, and a `max-h-88dvh` inner scroll (the only
    sanctioned nested scroll — it is what a fit screen overflows *into*). Preflight **fails** any app source
    containing `modal-bottom`. Drive `open`/`onClose` from `S.screen` so Back still closes it.
  - `<Segmented items value onChange variant="solid|outline" size scroll attr="data-x"/>` — the ONE
    tab/option strip. `items: [{id,label,icon?,dot?}]`; every button gets `aria-pressed` and your `attr`,
    so e2e hooks stay yours. `solid` = filled ink pill (primary mode), `outline` = hairline tint (over
    content). `dot` is the only place colour enters.
  - `<Island/>` floating glass over content · `<Panel title/>` solid surface in flow ·
    `<Slider id label value onInput/>` labelled range.
  - `<Transport playing onToggle …/>` — the ONE play control; preflight **fails** a hand-rolled play/pause
    toggle. Everything is opt-in by handler, so the same node is a bare ambient toggle and a full queue
    player: `onPrev`/`onNext`, `onSeek` + `pos`/`dur` (the scrub bar, with `onScrubStart`/`onScrub`/
    `onScrubEnd` for a readout that follows the thumb while the engine is told once, on release), `repeat`
    + `onRepeat`, `shuffle` + `onShuffle`, `title`/`subtitle`, `stopIcon`, `size="md|sm|hero"`. Its a11y
    labels come from the runtime's SYS dictionary in both locales — an app adopting it restates nothing.
    Your own controls go in `actions: [{id, icon, label, onClick, active?, tone?, pulse?, attr?}]`; past
    `keep` they demote into an overflow `Sheet` **with their words** (wire `moreOpen`/`onMore`/`onMoreClose`
    to an `S.screen` value, so Back closes it like every other screen).
    Where the queue goes next is **not** in the widget — it is `advance()` in `/_rt/player.js`, pure and
    unit-tested, and auto-advance is wiring your engine's `ended` event to `advance(…, {manual: false})`.
    Pass `manual: true` for a button press: repeat-one replays a track that ended, but must never trap a
    listener who pressed skip.

  Components size themselves from the **design tokens** in `theme.css` — `--ms-gap/-pad/-r/-ctl/-icon/`
  `-title/-label`, which **step by viewport HEIGHT** (780/670/560px). Never hardcode a gap or a control
  height in an app: one token step compacts the entire farm, including a phone in landscape.
  Padding alone can't save a tall stack, so there is one layout primitive for that: **`.ms-cols`** turns a
  stacked group into a row below 620px of height (`style="--ms-cols:3"`). Three stacked sliders are ~126px
  at any density; three columns are ~42px. Reach for it instead of writing an app-local height media query.

  Per-app colour is `spec.accent` (`#rrggbb`, mirroring `brand.json` `fg`) → the `--app-accent` token. It is
  a **MARK** colour — dots, rings, fills, glow — **never text and never a background under text**. That is
  what lets 56 apps share one component set and still each look like themselves. An app may re-point it at
  runtime for a per-state hue (`drift` follows the active world: one `setProperty`, every shared component
  on screen re-tints).

- **Single-screen tabs — `"fit": true`.** An instrument is not a document. A `fit` tab gets `.ms-fit` on
  `<html>`, `#view` is sized off `--hdr-h`/`--dock-h`, and the page **cannot scroll at any viewport height**.
  The verify gate measures it across the whole breakpoint matrix (320×568 → 1280×900, landscape included)
  and names the offending element. Content that doesn't fit compacts through the tokens or moves into a
  `Sheet` — it does not become a scroll and it does not get clipped. Layout inside a fit view: `h-full
  min-h-0 flex flex-col`, fixed pieces `shrink-0`, and one `flex-1 min-h-0` void that absorbs the height.
  Reference consumer: **`drift`** (stage + transport island; packs + macros).

- `/_rt/globe.js` — `<Globe onPick marker focus points spin/>`: canvas orthographic Earth, **no WebGL so
  it renders in the headless gate**. Location picker / country explorer.
- `/_rt/astro.js` — `BODIES`, `Planet({body})` (shaded micro-sphere, ring/glow), `skyPositions()` (horizon
  az/alt), `eclipticPositions()` (zodiac longitude), `sunHorizon`, `sunTimes`.
- `/_rt/skydial.js` — `<SkyDial marks radial opacityFor fan rotate rim center overlay/>`: a
  **projection-agnostic** circular wheel. Sun compass feeds az+alt+cardinals; a zodiac chart feeds ecliptic
  lon + a fixed ring + sign glyphs. Conjunctions fan into a radial spoke ordered by value; angle placement
  (sin/cos) never spills horizontally.
- `/_rt/timescale.js` — `<TimeScale value now onChange sunrise sunset anchors/>`: day/night sky-ribbon
  scrubber with hour ticks + clickable time-anchor tiles.

Reference consumers: **`sun`** (horizon compass), **`transit`** (live zodiac wheel), **`globe`**. A tool app
may still declare `spec.filters` to get the systemic filter UI + persisted state (the view reads
`useStore(S.filters)`). **Runtime-internal imports must be RELATIVE** (`./astro.js`), never `/_rt/…`: the
build copies `packages/runtime/*` verbatim; only *app* files get the `/_rt/`→`../_rt/` base-path rewrite.

### Drill-down inside a tab — `S.stack`, not your own history

A tab that lets you fall *deeper* (reel: swipe a clip → the page it came from becomes the next feed, as many
levels as you like) is not an overlay: it's N sibling levels, and Back must unwind **one**. That is
`S.stack` — the only overlay atom whose value is an **array**, worth one history entry **per element**
(`/_rt/overlay.js` `overlayDepth`, unit-tested; summed by `index.js`). Never call `history.*` from an app.

The idiom (see `apps/reel/view.js`, `apps/reel/RESEARCH.md`):

```js
const $frames = atom([]);                                 // the states you can go BACK to, deepest last
function push(S, label) { $frames.set([...$frames.get(), snapshot(label)]); S.stack.set([...S.stack.get(), label]); }
function pop(S)  { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); }
function reset(S){ $frames.set([]); if (S.stack.get().length) S.stack.set([]); }   // frames FIRST — see below
S.stack.listen((v) => { while ($frames.get().length > v.length) restoreTop(); });  // ONE reaction, every route in
```

Everything — system Back, an on-screen chevron, a drag — pops `S.stack`; the listener restores. Going back
is a **restore of the captured state, never a refetch**: you land on the exact item you left, mid-list.
Order matters in `reset()`: clear the frames *before* the stack, or the listener restores what you just
dropped. Invalidate in-flight loads with a generation counter — a response for the level you left must never
land in the level you're on.

Rendering rule: a gesture is never the only way. Every push/pop needs a real button too (a11y, and the e2e
surface has no drag). Live drag feedback comes from `usePanX({ onDrag })` — write styles by **ref**, since a
re-render per `pointermove` stutters the gesture it is drawing.

### Naming a page you only have a URL for — `/_rt/sitelabel.js`

`pageLabel(url)` (a readable title derived from the path/search term), `siteName(url)`,
`registrableDomain(host)` and `groupByDomain(list)` — pure, unit-tested, no round-trip, correct offline and
in the gate. Use them instead of showing a truncated raw URL, and group a list of pages by **site** rather
than by hostname (`commons.wikimedia.org` and `wikimedia.org` are one site).

### Haptics are systemic — do not call them for a tap

The runtime delegates one `pointerdown` listener and answers every tappable element itself
(`hapticFor()` in `/_rt/sensors.js`, unit-tested; wired in `index.js`; checked on every app by `verify`).
**Never write `haptic.tick()` for a tap** — you will double-fire on top of the runtime, and an app where
some controls answer and others don't feels broken in a way nobody can name.

Declare intent on the element instead: `data-haptic="bump"` (destructive — clear/delete/reset),
`data-haptic="off"` (this control fires its own, or must stay silent). Typing and disabled controls are
silent by default. Call `haptic.*` from an app **only for an outcome** the tap cannot predict — a save
rejected, a note changing under a sliding finger — never for the touch itself.

In e2e use **`h.tap()`**, not `h.click()`: `click()` dispatches no pointer events, so anything a finger
triggers is invisible to it.

### Sensor apps — seed the mock, and mark what it renders

`/_rt/sensors.js` gives `haptic · geo · compass · wakeLock` — that is the whole list today; motion/mic/camera
do not exist yet and adding one is a deliberate runtime extension. The reading capabilities feed you finished
answers: `compass.start(cb)` reports **true** north (it watches position and
applies the World Magnetic Model itself — never add declination in an app), `geo.watch` reports the full
spec fix `{lat,lng,accuracy,altitude,altitudeAccuracy,heading,speed,t}` where `accuracy` is a **95%**
radius. For anything measured, `/_rt/geofix.js` averages a stationary series into a vertex and propagates
error into a total — a distance printed without its `±` is not a measurement.

**The gate has no hardware.** Left alone your app renders "locating…" forever, and that empty branch is
what a11y and overflow@384 then measure — so the live layout (a rotated dial's bounding box, the
readout at its widest) is checked by nobody and breaks only on a real phone. This has shipped twice.

So: seed a plausible reading when `isGate || MOCK` (see `apps/ruler` — `SAMPLE_FIXES` is a stationary burst,
`apps/sun` — heading `300`, deliberately rotated), and put **`data-live`** on an element that cannot exist
without a reading. Preflight fails any app importing `geo`/`compass`/`motion`/`mic`/`camera` that mounts no
`[data-live]`. Seed the *widest* state, not the tidiest: the string nobody measures is the one that
overflows.

## Systemic capabilities (declare in the spec — reusable across apps)

Layouts `feed`/`row`/`grid`/`table` · `detail` · `search`/`searchFetch` · `paginate` (infinite scroll) ·
`sort` (persisted segmented control) · `filters` types `select`/`toggle`/`segment`/`range`/`multi`
(persisted) · `stream` (live source) · `detail.actions[].play` (in-app video: wakeLock + PiP + fullscreen + resume, all runtime-owned) · `chart` (SVG heat bars) · table columns
(`heat`/`sub`/`lg`/`muted`/`mono`/`align`/`format`) · `translate` · `enrich` · date `format`
`ago`/`when`/`since`. Add a capability to the schema+runtime once; every app reuses it. See `SCHEMA.md`.

## Quality gate — BOTH themes

CI: `unit` (runtime tests + ajv over every spec) → a Chromium `verify` job per changed app
(packages/ change → whole farm). On **every tab** (not just the default) each verify runs:
**axe 0 critical/serious in DARK *and* LIGHT** · no overflow@384 · the responsive matrix per tab; plus e2e and shots
(`main.png` · `tab-<id>.png` per tab · `light.png`).

- **Accessible names.** Every form control (`input`/`select`/`toggle`) needs an accessible name — an
  `aria-label` (or wrapping `<label>`) — even when the visual design shows no text label. axe `label` /
  `select-name` are *critical* and now fire on any tab.

- **Theme-aware only.** Anything that flips with the theme must be theme-aware **CSS** — a DaisyUI var
  class (`text-base-content`, `bg-base-100`) or `light-dark(darkVal, lightVal)` — **never a colour computed
  in JS at render**, because the view doesn't re-render on the theme toggle (a baked `lighten()`/hex won't
  flip). Rule of thumb: muted `base-content/50` fails light, `/60` borderline, **`/70`+ safe both**. Accent
  tints (heat ink) → `light-dark(#darkAmber, rgba(brightAmber))`.
- **Wide content** (tables, wide diagrams) scrolls inside its own `overflow-x-auto`, never the page.
- **Review the shot like a demanding designer** — download `main.png` **and** `light.png`
  (`gh run download -n shot-<app>`) and judge alignment / rim-hug / balance / legibility in BOTH themes.
  A green gate is necessary, not sufficient.
- **Fail-fast / cost:** a verify run >1 min is a warning — investigate (check "Set up job" for GitHub infra
  first). Don't let a job burn minutes red.

## Why this shape

The agent writes only the **spec** (taste) + the one **adapter/view** (the bespoke fetch or custom
surface). Everything else is commodity the toolkit owns: the render catalog (`packages/runtime`), the
gate (`packages/gates`), the shell (`scaffold`), and the shared components (globe · astro · skydial ·
timescale). Build a new capability once, systemically — then every app, and the next one, gets it for free.
