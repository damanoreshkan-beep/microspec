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
   `deno run -A deploy/manifest.mjs` → regenerates the launcher list `apps/home/apps.json`.

5. **Author `e2e.spec.mjs`** — `export default [{ name, run(h) }]`. Poll on a *real* content marker, not
   `.card` (the skeleton is also `.card`): `[data-fav]` for data feeds, or the tool's own marker
   (`[data-mark]`, `[data-sun]`, `[data-bearing]`). Test the routing invariant: open every overlay /
   sub-screen and assert `h.back()` closes it (not exits). Note badge/label CSS uppercases text → use `/i`
   regexes.

6. **Push → CI is the gate** (below). **Check the run-level conclusion**, not streamed per-job output.

## Tool apps — compose the SYSTEMIC runtime, don't rebuild

A `type:"tool"` tab renders the `view.js` export named by its `view` key. Props: `{ S, t, tab, toast,
screen, openScreen, closeScreen }`; read reactive state with `useStore(S.t | S.filters | S.locale)`.
Compose the shared runtime components instead of writing geometry/astronomy from scratch:

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

## Systemic capabilities (declare in the spec — reusable across apps)

Layouts `feed`/`row`/`grid`/`table` · `detail` · `search`/`searchFetch` · `paginate` (infinite scroll) ·
`sort` (persisted segmented control) · `filters` types `select`/`toggle`/`segment`/`range`/`multi`
(persisted) · `stream` (live source) · `chart` (SVG heat bars) · table columns
(`heat`/`sub`/`lg`/`muted`/`mono`/`align`/`format`) · `translate` · `enrich` · date `format`
`ago`/`when`/`since`. Add a capability to the schema+runtime once; every app reuses it. See `SCHEMA.md`.

## Quality gate — BOTH themes

CI: `unit` (runtime tests + ajv over every spec) → a Chromium `verify` job per changed app
(packages/ change → whole farm). Each verify runs:
**axe 0 critical/serious in DARK *and* LIGHT** · no overflow@384 · glance@200 · e2e · shots
(`main.png` + `light.png`).

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
