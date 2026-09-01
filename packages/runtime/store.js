/* @ts-self-types="./store.d.ts" */
/**
 * App state factory. The one export, createApp(spec, dataLoad), builds the nanostores state graph for one
 * app — persisted preferences, ephemeral UI state, the history-backed overlays index.js watches — plus the
 * side-effecting helpers (load/loadMore, toast, undo/confirm, toggleFav, swap). No rendering here;
 * render.js subscribes to these.
 * @module
 */
import { atom, map, computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { dictFor } from "./i18n.js";

const JSON_CODEC = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return {}; } } };

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
  const FKEY = ns + "filters";
  let savedFilters = {};
  try { savedFilters = JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch {  }

  const urlLocale = (() => {
    try {
      const q = new URLSearchParams(location.search).get("locale");
      return q && spec.i18n?.[q] ? q : null;
    } catch { return null; }
  })();

  const S = {
    locale: urlLocale ? atom(urlLocale) : persistentAtom(ns + "locale", "uk"),
    theme: persistentAtom(ns + "theme", spec.theme || "dim"),
    fav: persistentAtom(ns + "fav", {}, JSON_CODEC),
    amount: persistentAtom(ns + "amount", "100"),
    from: persistentAtom(ns + "from", conv?.defaultFrom || "USD"),
    to: persistentAtom(ns + "to", conv?.defaultTo || conv?.base || "UAH"),
    query: atom(""),
    tab: atom(spec.tabs?.[0]?.id),
    sort: persistentAtom(ns + "sort", sortTab?.sort?.[0]?.key || ""),
    seg: persistentAtom(ns + "seg", segTab?.segments?.[0]?.key || ""),   
    toggles: persistentAtom(ns + "toggles", {}, JSON_CODEC),   

    data: map({ items: [], meta: {}, loading: true, error: false, next: null, loadingMore: false, moreError: false }),
    filters: map({ ...(spec.filters?.defaults || {}), ...savedFilters }),
    toast: atom(""),
    stack: atom([]),
    clean: atom(false),
    sheet: atom(false),
    detail: atom(null),
    screen: atom(null),
    player: atom(null),
    installEvent: atom(null),
    installOpen: atom(false),
    qrOpen: atom(false),          
    confirm: atom(null),          
    undo: atom(null),             
    update: atom(false),          
  };
  S.t = computed(S.locale, (l) => dictFor(spec.i18n, l));
  S.filters.listen((v) => { try { localStorage.setItem(FKEY, JSON.stringify(v)); } catch {  } });

  async function load() {
    S.data.set({ ...S.data.get(), loading: true, error: false, moreError: false });
    try {
      const { items, meta, next } = await dataLoad({ ...S.filters.get(), q: S.query.get().trim() });
      S.data.set({ items: items || [], meta: meta || {}, loading: false, error: false, next: next ?? null, loadingMore: false, moreError: false });
    } catch {
      S.data.set({ items: [], meta: {}, loading: false, error: true, next: null, loadingMore: false, moreError: false });
    }
  }

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
    S.undo.set(null);                                  
    S.toast.set(key);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => S.toast.set(""), 2200);
  }

  let undoTimer;
  function undo(fn, label = "") {
    clearTimeout(undoTimer); clearTimeout(toastTimer);
    S.toast.set(""); S.undo.set({ fn, label });
    undoTimer = setTimeout(() => S.undo.set(null), 5000);
  }
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
