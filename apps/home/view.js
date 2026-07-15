// microspec store — the farm's launcher, as a real app store: a searchable icon grid, a per-app description
// screen (history-backed) with an Open button, and a NEW badge on apps you haven't opened yet (tracked in
// IndexedDB via /_rt/db.js). The store lives in its OWN scope (/store/), so opening an app is out-of-scope →
// the app is independently installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
const SEEN = collection("seen");   // { id → { v: lastSeenVersion } } — powers NEW / update badges
const appUrl = (id) => `../${id}/`;   // store is /…/store/, apps are siblings /…/<id>/

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const [q, setQ] = useState("");
  const [seen, setSeen] = useState(null);   // { id: version } last opened at (null while loading from IndexedDB)
  useEffect(() => { SEEN.all().then((r) => setSeen(Object.fromEntries(r.map((x) => [x.id, x.v])))).catch(() => setSeen({})); }, []);
  const badgeOf = (a) => (!seen ? null : !(a.id in seen) ? "new" : seen[a.id] !== a.version ? "upd" : null);   // never opened / opened-older-version / current
  const launch = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); try { window.open(appUrl(a.id), "_blank", "noopener"); } catch { location.assign(appUrl(a.id)); } };
  const tag = (b, sm) => b === "new" ? html`<span class=${`badge badge-primary ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`badge badge-warning ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "updBadge")}</span>` : null;

  // ── per-app description screen (history-backed: Back closes it) ──
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  if (sel) return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto flex flex-col" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${sel.title}</div></header>
    <div class="flex-1 flex flex-col items-center gap-5 px-6 py-8 max-w-xl mx-auto w-full">
      <div class="w-24 h-24 rounded-[24%] flex items-center justify-center shadow-lg border border-base-content/10 shrink-0" style=${`background:${sel.bg}`}>${Icon(sel.glyph, "text-5xl", `color:${sel.fg}`)}</div>
      <div class="flex items-center gap-2 flex-wrap justify-center"><h1 class="text-2xl font-bold text-center">${sel.title}</h1>${tag(badgeOf(sel), true)}</div>
      <p class="text-base-content/70 text-center leading-relaxed break-words">${sel.tagline}</p>
      <button id="open-app" class="btn btn-primary btn-lg rounded-2xl gap-2 w-full max-w-xs mt-1" onClick=${() => launch(sel)}>${Icon("lucide:external-link")}${T(t, "openApp")}</button>
      <div class="text-xs text-base-content/50 tabular-nums flex items-center gap-1.5">v${sel.version || "1.0"}${badgeOf(sel) === "upd" ? html`<span class="text-warning font-medium">· ${T(t, "newVersion")}</span>` : null}</div>
    </div>
  </div>`;

  // ── searchable icon grid ──
  const query = q.trim().toLowerCase();
  const list = query ? apps.filter((a) => (a.title + " " + (a.tagline || "")).toLowerCase().includes(query)) : apps;
  return html`<div class="flex flex-col gap-4">
    <div class="relative">
      <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${T(t, "search")} aria-label=${T(t, "search")} class="input input-bordered w-full rounded-2xl pl-10" />
      ${Icon("lucide:search", "absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 text-lg pointer-events-none")}
    </div>
    ${list.length ? html`<div class="grid grid-cols-4 gap-x-3 gap-y-4 @max-[300px]:grid-cols-3">
      ${list.map((a) => html`<button data-app=${a.id} class="flex flex-col items-center gap-1.5 active:scale-90 transition-transform min-w-0" onClick=${() => openScreen(a.id)} key=${a.id}>
        <div class="relative aspect-square w-full rounded-[24%] flex items-center justify-center border border-base-content/10 shadow-sm" style=${`background:${a.bg}`}>
          ${Icon(a.glyph, "text-3xl", `color:${a.fg}`)}
          ${(() => { const b = badgeOf(a); return b ? html`<span class="absolute top-1 right-1">${tag(b)}</span>` : null; })()}
        </div>
        <div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${a.title}</div>
      </button>`)}
    </div>` : html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`}
  </div>`;
}
