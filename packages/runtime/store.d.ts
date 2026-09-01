/**
 * # runtime/store.js — one state graph per app, and the helpers that mutate it
 *
 * The app state factory. Its one export, `createApp(spec, dataLoad)`, builds the nanostores graph for one
 * app — persisted preferences under a `<spec.id>:` namespace, ephemeral UI state, the data map with its
 * paging cursor, and the history-backed overlays index.js watches for the back-button invariant — plus the
 * side-effecting helpers: `load` / `loadMore`, `toast`, the two halves of delete safety (`undo`, `confirm`),
 * `toggleFav` and `swap`. No rendering here; render.js subscribes to these. What it buys the farm is that
 * 74 apps share one memory of "which tab, which filters, which locale" and one back-stack model, so a
 * screen an app opens is closed by system Back without the app writing a line of history code. The lesson
 * behind `clean`: the runtime owns its chrome, so hiding it must be the runtime's atom — an app hiding
 * someone else's element also falsifies the measured `--hdr-h` / `--dock-h` every fit screen's math is built from.
 *
 * ![The store map: spec and dataLoad flowing into persisted preferences, ephemeral UI state, the data map and the history-backed overlays, with the helpers around them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-store.svg)
 *
 * ## Import
 * ```js
 * import { createApp } from "/_rt/store.js";                    // an app's page: the import map resolves /_rt/
 * import { createApp } from "@microspec/core/runtime/store.js";  // a product rt/ module or a Deno test
 * ```
 * Apps do not import it themselves: `start()` in index.js calls `createApp` once, and a view receives `S`
 * and the helpers as props.
 *
 * ## What it exports
 * - {@link createApp} — `createApp(spec, dataLoad)` → `{ spec, S, load, loadMore, toast, undo, confirm, toggleFav, favKey, swap }`.
 *   `S` holds the atoms: persisted `locale`, `theme`, `fav`, `amount`, `from`, `to`, `sort`, `seg`, `toggles`; ephemeral
 *   `query`, `tab`, `toast`, `installEvent`, `undo`, `update`; the `data` map (`items, meta, loading, error, next,
 *   loadingMore, moreError`) and the `filters` map; the overlays `clean`, `stack`, `sheet`, `detail`, `screen`, `player`,
 *   `installOpen`, `qrOpen`, `confirm`; and `t`, the dictionary computed from `locale`.
 *
 * ## In practice
 * ```js
 * // index.js's start(), reduced: one createApp per app; the helpers reach a view as props.
 * const app = createApp(spec, load);                       // spec.json + data.js's load(filters) → { items, meta, next }
 * app.load();                                              // page one; loadMore() appends the page behind data.next
 *
 * // habits — the irreversible half: a history-backed danger-confirm sheet, Back = cancel
 * const askDelete = () => h && confirm({
 *   title: T(t, "delHabitTitle", { name: h.name }),
 *   body: T(t, "delHabitBody", { n: marks.length }),
 *   verb: T(t, "delete"),
 *   onConfirm: async () => { await removeHabit(h.id); onClose(); },
 * });
 *
 * // reel — the reversible half: delete optimistically, then offer Undo for 5 s
 * const forget = () => { undo(() => setSession(site, cur), siteName(site)); setSession(site, ""); close(); };
 * ```
 *
 * ## How it fits
 * Imports `nanostores`, `@nanostores/persistent` (both pinned on esm.sh in the import map) and `i18n.js`
 * (`dictFor`, behind `S.t`). Imported by index.js, whose `start()` builds the graph and registers the overlays
 * with the history watcher, and read by render.js, which subscribes to every atom it paints. No farm app
 * imports it directly, but every one of the 74 boots through it; 31 apps drive `S.screen` / `S.detail` /
 * `S.player` from their views, and 6 (habits, wish, trail, persona, reel, sigil) call `undo` or `confirm`.
 *
 * ## Invariants and pitfalls
 * - Every persisted key is namespaced by `spec.id` — `<id>:locale`, `<id>:theme`, `<id>:filters` — because all apps share one origin.
 * - `?locale=en` overrides the stored locale only when the app's own `spec.i18n` has that dict, and it never persists: under
 *   override the atom is a plain one, so a shared link cannot silently change someone's language.
 * - Filters (with the `spec.filters.defaults` merged under them) and sort persist as ONE JSON blob, so booleans survive
 *   a reload; per-key string storage was how `false` came back as `"false"`.
 * - `stack` is an array worth one history entry PER level — its length is its depth, so Back walks a drill-down back one
 *   step instead of collapsing it. Every other overlay is worth exactly one entry.
 * - `undo` is NOT history-backed (a transient snackbar); `confirm` is (Back = cancel). A plain `toast()` supersedes any
 *   pending undo; `undo()` clears any pending toast. Undo lives 5 s, a toast 2.2 s.
 * - `loadMore()` is a no-op without a cursor or while any load is in flight, so an IntersectionObserver may fire freely;
 *   a failed page keeps the list and flags `moreError`. `load()` resets the list and the cursor.
 * - `toggleFav` un-favouriting offers `undo`; favouriting toasts `saved`. An item without `spec.fav.key` is ignored.
 * - `player` stacks on top of `detail`, so Back from a video returns to the item, not to the list.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/store.js — edit the JSDoc there, never this file.
/**
 * Build the nanostores state graph and side-effecting helpers for one app.
 * @param spec the app spec (id, tabs, filters, i18n, theme, fav)
 * @param dataLoad async (filters) → { items, meta, next } — the app's data.js loader
 * @returns { spec, S, load, loadMore, toast, undo, confirm, toggleFav, favKey, swap }
 */
export function createApp(spec: any, dataLoad: any): any;
