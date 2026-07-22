// microspec store — the farm's launcher, as a real app store: a searchable icon grid, a per-app description
// screen (history-backed) with an Open button, and a NEW badge on apps you haven't opened yet (tracked in
// IndexedDB via /_rt/db.js). The store lives in its OWN scope (/store/), so opening an app is out-of-scope →
// the app is independently installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { collection } from "/_rt/db.js";
import { iconTint } from "/_rt/colour.js";
import apps from "./apps.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
const SEEN = collection("seen");   // { id → { v: lastSeenVersion } } — powers NEW / update badges
const appUrl = (id) => `../${id}/`;   // store is /…/store/, apps are siblings /…/<id>/
// Section order: everyday utilities first. Each app declares its own `category` in spec.json (carried into
// apps.json by the manifest), so the grid groups itself — the store never hard-codes which app goes where.
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), theme = useStore(S.theme);
  const dark = theme !== "signal-light";   // the accent-lit dark tile vs the pastel light tile (iconTint)
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");   // active category chip; "all" shows every section
  const [seen, setSeen] = useState(null);   // { id: version } last opened at (null while loading from IndexedDB)
  useEffect(() => { SEEN.all().then((r) => setSeen(Object.fromEntries(r.map((x) => [x.id, x.v])))).catch(() => setSeen({})); }, []);
  const badgeOf = (a) => (!seen ? null : !(a.id in seen) ? "new" : seen[a.id] !== a.version ? "upd" : null);   // never opened / opened-older-version / current
  const installed = (a) => !!seen && a.id in seen;   // opened at least once = the store's actionable "installed" (no cross-origin install API)
  const launch = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); try { window.open(appUrl(a.id), "_blank", "noopener"); } catch { location.assign(appUrl(a.id)); } };
  const tag = (b, sm) => b === "new" ? html`<span class=${`badge badge-primary ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`badge badge-warning ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "updBadge")}</span>` : null;

  // ── per-app description screen (history-backed: Back closes it) ──
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  if (sel) return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto flex flex-col" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${sel.title}</div></header>
    <div class="flex-1 flex flex-col items-center gap-5 px-6 py-8 max-w-xl mx-auto w-full">
      ${(() => { const it = iconTint(sel.bg, sel.fg, dark); return html`<div class="w-24 h-24 rounded-[24%] flex items-center justify-center shadow-lg border border-base-content/10 shrink-0" style=${`background:${it.tile}`}>${Icon(sel.glyph, "text-5xl", `color:${it.glyph}`)}</div>`; })()}
      <div class="flex items-center gap-2 flex-wrap justify-center"><h1 class="text-2xl font-bold text-center">${sel.title}</h1>${tag(badgeOf(sel), true)}</div>
      <p class="text-base-content/70 text-center leading-relaxed break-words">${sel.tagline}</p>
      <button id="open-app" class="btn btn-primary btn-lg rounded-2xl gap-2 w-full max-w-xs mt-1" onClick=${() => launch(sel)}>${Icon("lucide:external-link")}${T(t, "openApp")}</button>
      <div class="text-xs text-base-content/50 tabular-nums flex items-center gap-1.5">v${sel.version || "1.0"}${badgeOf(sel) === "upd" ? html`<span class="text-warning font-medium">· ${T(t, "newVersion")}</span>` : null}</div>
    </div>
  </div>`;

  // ── search + category chips + sectioned icon grid ──
  // Tap: an app you've already opened launches straight away (no detail screen); one you haven't opens its
  // description first, so the detail screen stays a discovery surface. Installed apps carry a quiet corner check.
  const card = (a) => { const it = iconTint(a.bg, a.fg, dark), b = badgeOf(a), inst = installed(a); return html`<button data-app=${a.id} aria-label=${a.title} class="group flex flex-col items-center gap-1.5 min-w-0" onClick=${() => (inst ? launch(a) : openScreen(a.id))} key=${a.id}>
    <div class="relative aspect-square w-full rounded-[26%] flex items-center justify-center border border-base-content/10 shadow-sm transition-transform duration-150 group-active:scale-90" style=${`background:${it.tile}`}>
      ${Icon(a.glyph, "text-3xl", `color:${it.glyph}`)}
      ${b ? html`<span class="absolute top-1 right-1">${tag(b)}</span>`
          : inst ? html`<span data-installed class="absolute bottom-1 right-1 grid place-items-center w-[18px] h-[18px] rounded-full bg-base-100/90 border border-base-content/15 shadow-sm" title=${T(t, "installed")}>${Icon("lucide:check", "text-[0.66rem] text-success")}</span>` : null}
    </div>
    <div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${a.title}</div>
  </button>`; };
  const grid = (items) => html`<div class="grid grid-cols-4 gap-x-3 gap-y-4 @max-[300px]:grid-cols-3">${items.map(card)}</div>`;
  const noResults = html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const searchBar = html`<div class="relative">
    <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${T(t, "search")} aria-label=${T(t, "search")} class="input input-bordered w-full rounded-2xl pl-10" />
    ${Icon("lucide:search", "absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 text-lg pointer-events-none")}
  </div>`;

  // search wins: a flat, un-sectioned result set across the whole farm
  const query = q.trim().toLowerCase();
  if (query) {
    const list = apps.filter((a) => (a.title + " " + (a.tagline || "")).toLowerCase().includes(query));
    return html`<div class="flex flex-col gap-4">${searchBar}${list.length ? grid(list) : noResults}</div>`;
  }

  const shown = cat === "all" ? CATS : [cat];
  return html`<div class="flex flex-col gap-4">${searchBar}
    <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4" role="tablist" aria-label=${T(t, "categories")}>
      ${["all", ...CATS].map((c) => html`<button data-cat=${c} role="tab" aria-selected=${cat === c} class=${`btn btn-sm rounded-full shrink-0 ${cat === c ? "btn-primary" : "btn-ghost border border-base-300"}`} onClick=${() => setCat(c)} key=${c}>${T(t, catKey(c))}</button>`)}
    </div>
    <div class="flex flex-col gap-5">
      ${shown.map((c) => {
        const items = apps.filter((a) => a.category === c);
        if (!items.length) return null;
        return html`<div class="flex flex-col gap-2" key=${c}>
          <div class="text-[0.62rem] font-mono uppercase tracking-wide text-base-content/60 px-1 flex items-center gap-1.5">${T(t, catKey(c))}<span class="text-base-content/60 normal-case tabular-nums">${items.length}</span></div>
          ${grid(items)}
        </div>`;
      })}
    </div>
  </div>`;
}
