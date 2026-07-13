# Authoring a microspec app (the agent-driven loop)

There is **no autonomous API generator** — the LLM in the loop is the agent (Claude) working in-session.
The human gives a prompt; the agent authors two files; deterministic tooling does the rest; CI is the gate.

## The loop

```
prompt → probe source → author spec.json (ajv-gated) → author data.js → scaffold → e2e → push → CI green
```

1. **Probe the data source first** (never build on an unverified API): check status / CORS / shape with a
   plain `deno eval` fetch. Confirm it returns `ACAO: *` to a browser `Origin` (direct works on a static
   host), or plan the `/feed` fallback. Pick a keyless, CORS-friendly source.

2. **Author `spec.json`** — the declarative app (theme, tabs, card slots, detail, filters, i18n uk+en).
   The families are: `list` (feed|row) · `converter` · `dashboard` · `tool` · `profile`, plus top-level
   `detail`, per-list `search`/`searchFetch`, and `filters`. See `packages/schema/SCHEMA.md`.
   **Card layouts:** `feed` (rich card), `row` (compact title+value), `grid` (Android-style launcher
   icon tile — a rounded `bg`/`fg` glyph tile + 2-line label, whole tile a same-tab link). The store home
   is itself a microapp: `apps/home` (list/`grid` + profile), assembled at the site ROOT by build.mjs; its
   app list is generated from every spec by `deno run -A deploy/manifest.mjs` → `apps/home/apps.json`
   (build.mjs regenerates it automatically; rerun it after adding an app).
   **No raw cards (enforced):** a `feed` card must carry a preview slot — at least one of
   `subtitle` / `body` / `image`; a title-only feed card is rejected by the validator. Use `layout:"row"`
   for a compact title+value line, or `layout:"grid"` for an icon tile (needs `icon` or `image`). If the source API has no preview text (e.g. Hacker News), add top-level
   `enrich: { url, body }` — the runtime fetches each item's article description and fills that `body`
   field (cached, fail-open). Foreign-language body follows the UI locale via top-level `translate: [...]`
   (list the field names, including an enriched `body`).
   **Gate it immediately:**
   ```
   deno run -A packages/schema/validate.mjs apps/<id>/spec.json     # exit 1 + path-named errors if bad
   ```

3. **Author `data.js`** (data app) — `export async function load(filters) → { items, meta }`, using
   `import { viaProxy, isJsonObject } from "/_rt/feed.js"`. Every field a card/detail references must
   exist on each item. **Never format dates in data.js** (it has no locale — a baked string freezes one
   language): return the raw timestamp and let the card `meta`/detail row render it locale-aware with
   `format: "ago"` (past relative) or `format: "when"` (future absolute+countdown). For `searchFetch`, read `filters.q`. For a **tool** app author `view.js` instead
   (export a function named by the tab's `view` key; props `{ S, toast, openScreen, closeScreen }`).

4. **Scaffold the boilerplate** — never hand-write the shell:
   ```
   deno run -A packages/gen/scaffold.mjs apps/<id>            # index.html + manifest + sw + icon.svg
   ```
   Mode is auto-detected: `tool` if `view.js` exists, else `data`. Provide `brand.json` `{bg,fg}` +
   `brand.svg` (lucide paths) for the icon; both optional (defaults apply).

5. **Author `e2e.spec.mjs`** — `export default [{ name, run(h) }]`. Poll on `[data-fav]` (real cards),
   **not** `.card` (the loading skeleton is also `.card`). Test the routing invariant: open every overlay
   / sub-screen and assert `h.back()` closes it (not exits).

6. **Push → CI is the gate.** `unit` (runtime tests + ajv over every spec) then a Chromium `verify` job
   per app (axe 0 critical/serious · no overflow@384 · glance@200 · e2e · shot). **Check the run-level
   conclusion**, not per-job output, before calling it done. Fix what the gate catches (usually contrast
   → raise muted opacity; scrollable region → `tabindex=0`).

## Why two files

Everything else is commodity the tooling owns: the render catalog (`packages/runtime`), the gate
(`packages/gates`), and the shell (`scaffold`). The agent writes only the **spec** (taste) and the
**adapter** (the one bespoke fetch) — that is the whole per-app surface.
