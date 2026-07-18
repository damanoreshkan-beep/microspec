// microspec runtime — app state factory. Builds the nanostores state graph for one app + the
// side-effecting helpers (load, fav, toast, swap). No rendering here; render.js subscribes to these.
import { atom, map, computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { dictFor } from "./i18n.js";

const JSON_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return {}; } } };

// createApp(spec, dataLoad) → { spec, S (state), load, toast, toggleFav, favKey, swap }
export function createApp(spec, dataLoad) {
  const ns = (spec.id || "app") + ":";
  const conv = spec.tabs.find((t) => t.type === "converter");
  const sortTab = spec.tabs.find((t) => Array.isArray(t.sort) && t.sort.length);
  // filters + sort persist across sessions (declared at the schema level; the runtime remembers the choice)
  const FKEY = ns + "filters";
  let savedFilters = {};
  try { savedFilters = JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch { /* bad/empty */ }

  const S = {
    // persisted preferences
    locale: persistentAtom(ns + "locale", "uk"),
    theme: persistentAtom(ns + "theme", spec.theme || "dim"),
    fav: persistentAtom(ns + "fav", {}, JSON_CODEC),
    amount: persistentAtom(ns + "amount", "100"),
    from: persistentAtom(ns + "from", conv?.defaultFrom || "USD"),
    to: persistentAtom(ns + "to", conv?.defaultTo || conv?.base || "UAH"),
    // ephemeral UI state
    query: atom(""),
    tab: atom(spec.tabs?.[0]?.id),
    sort: persistentAtom(ns + "sort", sortTab?.sort?.[0]?.key || ""),
    // next = opaque cursor for the following page (null = no more); loadingMore/moreError = paging state
    data: map({ items: [], meta: {}, loading: true, error: false, next: null, loadingMore: false, moreError: false }),
    filters: map({ ...(spec.filters?.defaults || {}), ...savedFilters }),
    toast: atom(""),
    // history-backed overlays (index.js watches these for the back-button invariant)
    sheet: atom(false),
    detail: atom(null),
    screen: atom(null),
    // The video an in-app `play` action opened: { url, title, poster, key }. Stacks ON TOP of detail, so
    // Back returns to the item rather than to the list.
    player: atom(null),
    installEvent: atom(null),
    installOpen: atom(false),
    qrOpen: atom(false),          // desktop "open on phone" self-QR (history-backed like the others)
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
    S.toast.set(key);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => S.toast.set(""), 2200);
  }

  const favKey = (it) => it[spec.fav?.key];
  function toggleFav(it) {
    const k = favKey(it);
    if (k == null) return;
    const f = { ...S.fav.get() };
    if (f[k]) { delete f[k]; toast("removed"); } else { f[k] = it; toast("saved"); }
    S.fav.set(f);
  }

  function swap() { const a = S.from.get(); S.from.set(S.to.get()); S.to.set(a); }

  return { spec, S, load, loadMore, toast, toggleFav, favKey, swap };
}
