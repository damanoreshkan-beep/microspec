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
    data: map({ items: [], meta: {}, loading: true, error: false }),
    filters: map(spec.filters?.defaults ? { ...spec.filters.defaults } : {}),
    toast: atom(""),
    // history-backed overlays (index.js watches these for the back-button invariant)
    sheet: atom(false),
    detail: atom(null),
    screen: atom(null),
    installEvent: atom(null),
    installOpen: atom(false),
  };
  S.t = computed(S.locale, (l) => dictFor(spec.i18n, l));

  async function load() {
    S.data.set({ ...S.data.get(), loading: true, error: false });
    try {
      // searchFetch family: the trimmed query reaches data.js as filters.q
      const { items, meta } = await dataLoad({ ...S.filters.get(), q: S.query.get().trim() });
      S.data.set({ items: items || [], meta: meta || {}, loading: false, error: false });
    } catch {
      S.data.set({ items: [], meta: {}, loading: false, error: true });
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

  return { spec, S, load, toast, toggleFav, favKey, swap };
}
