/* @ts-self-types="./store.d.ts" */
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
// microspec runtime — app state factory. Builds the nanostores state graph for one app + the
// side-effecting helpers (load, fav, toast, swap). No rendering here; render.js subscribes to these.
import { atom, map, computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { dictFor } from "./i18n.js";

const JSON_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return {}; } } };

// createApp(spec, dataLoad) → { spec, S (state), load, toast, toggleFav, favKey, swap }
/**
 * Build the nanostores state graph and side-effecting helpers for one app.
 * @param spec the app spec (id, tabs, filters, i18n, theme, fav)
 * @param dataLoad async (filters) → { items, meta, next } — the app's data.js loader
 * @returns { spec, S, load, loadMore, toast, undo, confirm, toggleFav, favKey, swap }
 */
export function createApp(spec, dataLoad) {
  const ns = (spec.id || "app") + ":";
  const conv = spec.tabs.find((t) => t.type === "converter");
  const sortTab = spec.tabs.find((t) => Array.isArray(t.sort) && t.sort.length);
  const segTab = spec.tabs.find((t) => Array.isArray(t.segments) && t.segments.length);
  // filters + sort persist across sessions (declared at the schema level; the runtime remembers the choice)
  const FKEY = ns + "filters";
  let savedFilters = {};
  try { savedFilters = JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch { /* bad/empty */ }

  // `?locale=en` — a URL override, and it exists for the same reason `?theme=` does (see index.js): the
  // screenshot service is the only browser this project has, and the farm's stored default is `uk`, so
  // EVERY still it could produce shipped Cyrillic chrome — including the ones in the public README. The
  // override is validated against the app's OWN dicts, so an unknown value falls through to the stored
  // preference rather than rendering raw keys.
  // It does NOT persist: under override the atom is a plain one, nothing reaches localStorage, so a shared
  // link cannot silently change someone's language (the same promise the theme override makes).
  const urlLocale = (() => {
    try {
      const q = new URLSearchParams(location.search).get("locale");
      return q && spec.i18n?.[q] ? q : null;
    } catch { return null; }
  })();

  const S = {
    // persisted preferences
    locale: urlLocale ? atom(urlLocale) : persistentAtom(ns + "locale", "uk"),
    theme: persistentAtom(ns + "theme", spec.theme || "dim"),
    fav: persistentAtom(ns + "fav", {}, JSON_CODEC),
    amount: persistentAtom(ns + "amount", "100"),
    from: persistentAtom(ns + "from", conv?.defaultFrom || "USD"),
    to: persistentAtom(ns + "to", conv?.defaultTo || conv?.base || "UAH"),
    // ephemeral UI state
    query: atom(""),
    tab: atom(spec.tabs?.[0]?.id),
    sort: persistentAtom(ns + "sort", sortTab?.sort?.[0]?.key || ""),
    seg: persistentAtom(ns + "seg", segTab?.segments?.[0]?.key || ""),   // one-of-N top filter strip (tab.segments)
    toggles: persistentAtom(ns + "toggles", {}, JSON_CODEC),   // pinned per-tab multi-toggle strip (tab.toggles); {} = all on

    // next = opaque cursor for the following page (null = no more); loadingMore/moreError = paging state
    data: map({ items: [], meta: {}, loading: true, error: false, next: null, loadingMore: false, moreError: false }),
    filters: map({ ...(spec.filters?.defaults || {}), ...savedFilters }),
    toast: atom(""),
    // history-backed overlays (index.js watches these for the back-button invariant)
    // A drill-down STACK inside a tab (reel: swipe a video → its own page becomes the next feed, as deep as
    // you like). Unlike every other overlay it is worth one history entry PER LEVEL — its length IS its
    // depth — so Back walks the drill-down back one step at a time instead of collapsing it. The elements
    // are the app's own (a label shown while dragging back); the runtime only counts them.
    stack: atom([]),
    // CLEAN SCREEN — the runtime's chrome steps off the surface entirely (app bar, dock, dock fade) so a
    // full-bleed app is nothing but its content. It lives here rather than in an app because the runtime
    // OWNS that chrome: an app can only reach it by `display:none` on someone else's element, which also
    // silently falsifies the measured --hdr-h/--dock-h every fit screen's math is built from. Registered as
    // an overlay in index.js, so hiding the dock never strands anyone: system Back brings it all back, and
    // the runtime paints one quiet door (CleanExit) for the tap that means the same thing.
    clean: atom(false),
    sheet: atom(false),
    detail: atom(null),
    screen: atom(null),
    // The video an in-app `play` action opened: { url, title, poster, key }. Stacks ON TOP of detail, so
    // Back returns to the item rather than to the list.
    player: atom(null),
    installEvent: atom(null),
    installOpen: atom(false),
    qrOpen: atom(false),          // desktop "open on phone" self-QR (history-backed like the others)
    confirm: atom(null),          // { title, body?, verb, onConfirm } — danger-confirm sheet (history-backed)
    undo: atom(null),             // { fn, label } — interactive undo snackbar; NOT history-backed (transient)
    update: atom(false),          // a newer build is cached and ready — offer a restart (see index.js)
  };
  S.t = computed(S.locale, (l) => dictFor(spec.i18n, l));
  // persist filter selections as JSON (keeps booleans intact, unlike per-key string storage)
  S.filters.listen((v) => { try { localStorage.setItem(FKEY, JSON.stringify(v)); } catch { /* private mode / quota */ } });

  // Full (re)load — page one. Resets the accumulated list + pagination cursor. Fires on init, filter
  // change/refetch, searchFetch query change, and manual refresh.
  async function load() {
    S.data.set({ ...S.data.get(), loading: true, error: false, moreError: false });
    try {
      // searchFetch family: the trimmed query reaches data.js as filters.q. `next` (optional) is the
      // cursor for infinite scroll — data.js returns it and receives it back as filters.cursor.
      const { items, meta, next } = await dataLoad({ ...S.filters.get(), q: S.query.get().trim() });
      S.data.set({ items: items || [], meta: meta || {}, loading: false, error: false, next: next ?? null, loadingMore: false, moreError: false });
    } catch {
      S.data.set({ items: [], meta: {}, loading: false, error: true, next: null, loadingMore: false, moreError: false });
    }
  }

  // Append the next page (infinite scroll). No-op if there's no cursor or a load is already in flight —
  // so the IntersectionObserver can fire freely. A failed page keeps the list and flags moreError (retry).
  async function loadMore() {
    const d = S.data.get();
    if (d.next == null || d.loading || d.loadingMore) return;
    S.data.set({ ...d, loadingMore: true, moreError: false });
    try {
      const { items, meta, next } = await dataLoad({ ...S.filters.get(), q: S.query.get().trim(), cursor: d.next });
      const cur = S.data.get();
      S.data.set({ ...cur, items: [...cur.items, ...(items || [])], meta: { ...cur.meta, ...(meta || {}) }, next: next ?? null, loadingMore: false });
    } catch {
      S.data.set({ ...S.data.get(), loadingMore: false, moreError: true });
    }
  }

  let toastTimer;
  function toast(key) {
    S.undo.set(null);                                  // a plain toast supersedes any pending undo snackbar
    S.toast.set(key);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => S.toast.set(""), 2200);
  }

  // Delete safety — the reversible half. A destructive action does its delete OPTIMISTICALLY (the caller
  // removes it and captures what's needed to restore), then calls undo(restore, label): an interactive
  // snackbar offers "Undo" for 5s. NN/g's preferred pattern — an undo you notice protects a mis-tap far
  // better than a confirm dialog clicked reflexively. High-consequence deletes use confirm() instead.
  let undoTimer;
  function undo(fn, label = "") {
    clearTimeout(undoTimer); clearTimeout(toastTimer);
    S.toast.set(""); S.undo.set({ fn, label });
    undoTimer = setTimeout(() => S.undo.set(null), 5000);
  }
  // Delete safety — the irreversible half. Opens a history-backed danger-confirm sheet (Back = cancel). The
  // caller carries the copy (name the thing, say what's lost) and the verb; onConfirm runs only on explicit tap.
  function confirm(opts) { S.confirm.set(opts); }

  const favKey = (it) => it[spec.fav?.key];
  function toggleFav(it) {
    const k = favKey(it);
    if (k == null) return;
    const f = { ...S.fav.get() };
    if (f[k]) { const prev = f[k]; delete f[k]; S.fav.set(f); undo(() => { const g = { ...S.fav.get() }; g[k] = prev; S.fav.set(g); }); }
    else { f[k] = it; S.fav.set(f); toast("saved"); }
  }

  function swap() { const a = S.from.get(); S.from.set(S.to.get()); S.to.set(a); }

  return { spec, S, load, loadMore, toast, undo, confirm, toggleFav, favKey, swap };
}
