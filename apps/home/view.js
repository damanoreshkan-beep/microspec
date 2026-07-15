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
const OPENED = collection("opened");
const appUrl = (id) => `../${id}/`;   // store is /…/store/, apps are siblings /…/<id>/

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState(null);   // Set of opened ids (null while loading from IndexedDB)
  useEffect(() => { OPENED.all().then((r) => setOpened(new Set(r.map((x) => x.id)))).catch(() => setOpened(new Set())); }, []);
  const isNew = (id) => opened && !opened.has(id);
  const launch = (id) => { OPENED.put(id, { t: 1 }).catch(() => {}); setOpened((s) => new Set(s || []).add(id)); try { window.open(appUrl(id), "_blank", "noopener"); } catch { location.assign(appUrl(id)); } };

  // ── per-app description screen (history-backed: Back closes it) ──
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  if (sel) return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto flex flex-col" style="padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${sel.title}</div></header>
    <div class="flex-1 flex flex-col items-center gap-5 px-6 py-8 max-w-xl mx-auto w-full">
      <div class="w-24 h-24 rounded-[24%] flex items-center justify-center shadow-lg border border-base-content/10 shrink-0" style=${`background:${sel.bg}`}>${Icon(sel.glyph, "text-5xl", `color:${sel.fg}`)}</div>
      <div class="flex items-center gap-2"><h1 class="text-2xl font-bold text-center">${sel.title}</h1>${isNew(sel.id) ? html`<span class="badge badge-primary badge-sm font-bold">${T(t, "newBadge")}</span>` : null}</div>
      <p class="text-base-content/70 text-center leading-relaxed break-words">${sel.tagline}</p>
      <button id="open-app" class="btn btn-primary btn-lg rounded-2xl gap-2 w-full max-w-xs mt-1" onClick=${() => launch(sel.id)}>${Icon("lucide:external-link")}${T(t, "openApp")}</button>
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
          ${isNew(a.id) ? html`<span class="absolute top-1 right-1 badge badge-primary badge-xs font-bold px-1 leading-none">${T(t, "newBadge")}</span>` : null}
        </div>
        <div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${a.title}</div>
      </button>`)}
    </div>` : html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`}
  </div>`;
}
