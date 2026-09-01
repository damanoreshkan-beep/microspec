/**
 * # authorless — the frozen author. A recipe in, a complete list-family app out, no model.
 *
 * The moat is not the model; it is the contract, the runtime and the gates. This script is the existence
 * proof: a plain function turns a recipe (a source URL and a field map) into a full list-family app —
 * spec.json, data.js, i18n in uk and en, brand, e2e — that must clear the SAME ajv + preflight + Chromium
 * gates as any hand- or model-authored app. Swap the author, keep the floor. It is also how the appless
 * core gets its gate material: tools/demo.mjs generates apps/books from recipes/books.json before any gate
 * runs, and the history of the farm is verified against a generated app. It exports nothing.
 *
 * ![The authorless node in the author lane, the only script node there before scaffold](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/pipeline-authorless.svg)
 *
 * ## Usage
 * ```sh
 * deno run -A jsr:@microspec/core/authorless recipes/books.json           # writes apps/books/
 * deno run -A jsr:@microspec/core/authorless recipes/books.json --check   # temp dir, then ajv + preflight
 * ```
 * The 8n8 node `authorless` runs it with `--recipe=<path>` from the runner (default `recipes/<id>.json`);
 * `deno task demo` runs it on the books recipe when the tree has no apps. The generated app is not yet
 * runnable: the script ends by naming the next step, `scaffold` over the new directory.
 *
 * ## Flags and arguments
 * | argument | meaning |
 * | --- | --- |
 * | `<recipe.json>` | positional, required: the recipe. Missing → usage line, exit 2 |
 * | `--check` | generate into a temp dir (`authorless_<id>_…`) instead of `apps/<id>/`, then run the browser-free gates over it |
 *
 * A recipe: `{ id, source, proxy?, root, map, urlTemplate?, searchParam?, compact?, join?, joinCap?,
 * translate?, badges?, detail?, theme?, icon, brand, source_url, i18n: { uk, en } }`. Map values are dot
 * paths into a source row (`authors.0.name`); `join` names the fields whose source value is an array and
 * must be flattened in the adapter, capped at `joinCap` (default 8); `compact` names counts rendered as
 * 1.2K / 3M. `icon` is a lucide name and is required — it becomes the PWA icon.
 *
 * ## What it checks / produces
 * Writes seven files under `apps/<id>/` (or the temp dir):
 * - `spec.json` — the list family: a `feed` list tab with search, a `saved` tab over favourites, a `me`
 *   profile tab with theme, language, install and the source link; a card that drills IN to a detail
 *   (the outbound link lives in the detail's actions, always ending with the source), badges from the recipe.
 * - `data.js` — the adapter: `load()` fetches the source (through the feed proxy when `proxy` is set),
 *   picks the mapped fields, joins arrays, compacts counts, fills `url` from `urlTemplate`. Under the gate
 *   (`?mock`, verify, shoot) it answers a deterministic twelve-row fixture shaped by the map instead — no
 *   live fetch ever runs in a gate.
 * - `i18n/uk.json`, `i18n/en.json` — the base dictionary every list app needs, kept in lockstep so the
 *   locale-parity gate stays green, merged with the recipe's own strings.
 * - `brand.json` — bg and fg for the icon; `brand.svg` — the raw lucide geometry, fetched from
 *   lucide-static at the pinned version 0.544.0, so the PWA icons can be cut and Chrome will install the app.
 *   An unknown icon name or an icon with no geometry throws, and nothing is written past that point.
 * - `e2e.spec.mjs` — a structural list e2e: cards load, a card opens the detail and Back closes it, search
 *   narrows and restores, save lands in Saved, EN and UA both render, the install modal opens and Back closes it.
 * - Prints `authorless: wrote <dir> (spec + data + i18n×2 + brand + e2e) — 0 lines authored by a model`.
 * - With `--check`, runs validate.mjs over the spec and preflight.mjs over the directory and prints
 *   `✓ conformance: a script-authored app passes ajv + preflight (the author is pluggable)` or
 *   `✗ conformance failed`, with each gate's own output above it.
 *
 * ## Exit codes
 * - `0` — the app was written; with `--check`, ajv and preflight both passed.
 * - `1` — `--check` and either gate failed; also Deno's own code for an uncaught error, such as a lucide
 *   icon that does not exist.
 * - `2` — no recipe path given.
 *
 * ## Where it sits
 * 8n8 node `authorless` · phase author · script, frozen 2026-07-05 · needs: ideate · needed by: none in the
 * DAG. The `demo` node calls it directly (authorless → scaffold → sw → readme) to seed a tree with no apps,
 * so every gate node depends on its output through demo; verify.yml runs the `--check` conformance step
 * on every push.
 *
 * ## Why
 * The frozen author. A recipe (source + field map) → a complete list-family app, no model. This node is
 * the existence proof that agent nodes can freeze: the `spec` node is freezable per family because this
 * already emits it deterministically for the list family, and the `i18n` node is partially frozen because
 * this carries the base dictionary every list app needs, so only app-specific strings are authored.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/gen/authorless.mjs — edit the JSDoc there, never this file.
export {};
