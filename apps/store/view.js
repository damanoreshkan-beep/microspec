import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
const AppArt = (a, color, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:${color}`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:${color}`);
const Tile = (a, cls) => html`<div class=${`relative shrink-0 rounded-[24%] overflow-hidden bg-black sf-raised sf-e2 flex items-center justify-center ${cls}`}>${AppArt(a, "var(--color-base-content)", a.icon ? "100%" : "45%")}</div>`;
const SEEN = collection("seen");      
const CATALOG = collection("catalog");
const appUrl = (id, install = false) => `../${id}/${install ? "?install=1" : ""}`;   
const shotUrl = (a) => `./assets/shot-${a.id}.webp`;
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
const FEATURED = (spec.featured || []).map((id) => apps.find((a) => a.id === id)).filter(Boolean);
const isFeatured = (a) => FEATURED.some((f) => f.id === a.id);

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), locale = useStore(S.locale);
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const screensOf = (a) => a.screens?.[locale] || a.screens?.en || [];
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");   
  const [seen, setSeen] = useState(null);   
  const [fresh, setFresh] = useState(null); 
  useEffect(() => {
    Promise.all([SEEN.all(), CATALOG.all()]).then(([s, c]) => {
      setSeen(Object.fromEntries(s.map((x) => [x.id, x.v])));
      const ids = apps.map((a) => a.id);
      const rec = c.find((x) => x.id === "known");
      const known = rec ? new Set(rec.ids || []) : null;
      setFresh(known ? new Set(ids.filter((i) => !known.has(i))) : new Set());
      CATALOG.put("known", { ids }).catch(() => {});
    }).catch(() => { setSeen({}); setFresh(new Set()); });
  }, []);
  const badgeOf = (a) => (!seen || !fresh ? null : fresh.has(a.id) && !(a.id in seen) ? "new" : (a.id in seen) && seen[a.id] !== a.version ? "upd" : null);
  const installed = (a) => !!seen && a.id in seen;   
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a, install = false) => { remember(a); try { window.open(appUrl(a.id, install), "_blank", "noopener"); } catch { location.assign(appUrl(a.id, install)); } };
  const tag = (b, sm) => b === "new" ? html`<span class=${`badge badge-secondary ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`badge badge-warning ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "updBadge")}</span>` : null;
  const needsUsb = (a) => (a.needs || []).includes("usb");
  const deviceNote = (a) => needsUsb(a) ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-2xl px-3 py-2">${Icon("lucide:usb", "shrink-0")}<span>${T(t, a.deviceNote || "needsDeviceHackrf")}</span></div>` : null;
  const tap = (a) => (installed(a) ? launch(a) : openScreen(a.id));

  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const page = html`<${Sheet} id="appsheet" size="lg" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const b = badgeOf(sel), scr = screensOf(sel); return html`<div class="flex flex-col gap-5 py-1">
      <div class="flex items-center gap-4">
        <div class="relative shrink-0">
          <div class="absolute inset-0 rounded-[24%] blur-2xl opacity-40" style="background:var(--app-accent)" aria-hidden="true"></div>
          ${Tile(sel, "w-24 h-24")}
        </div>
        <div class="min-w-0 flex flex-col gap-1">
          <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-lg leading-tight">${nameOf(sel)}</span>${b ? tag(b, true) : null}${isFeatured(sel) ? html`<span class="badge badge-secondary badge-sm font-bold">${T(t, "premium")}</span>` : null}</div>
          <div class="text-xs font-mono uppercase tracking-wide text-muted">${T(t, catKey(sel.category))} · v${sel.version || "1.0"}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button id="open-app" class="btn btn-secondary rounded-2xl gap-2 flex-1 min-w-0" onClick=${() => launch(sel)}>${Icon("lucide:external-link")}${T(t, "openApp")}</button>
        <button id="install-app" class="btn btn-outline rounded-2xl gap-2 flex-1 min-w-0" onClick=${() => launch(sel, true)}>${Icon("lucide:download")}${T(t, "installApp")}</button>
      </div>
      ${deviceNote(sel)}
      <p class="text-base-content/80 leading-relaxed break-words">${taglineOf(sel)}</p>
      ${sel.shot ? html`<div class="rounded-[var(--ms-r-in)] overflow-hidden sf-inset bg-black mx-auto w-full max-w-[16rem]"><img src=${shotUrl(sel)} alt="" loading="lazy" decoding="async" class="w-full h-auto block" /></div>` : null}
      ${scr.length ? html`<div class="flex flex-col gap-2">
        <div class="text-[0.62rem] font-mono uppercase tracking-wide text-muted px-1">${T(t, "screens")}</div>
        <div class="flex flex-wrap gap-1.5">${scr.map((s) => html`<span class="badge badge-ghost" key=${s}>${s}</span>`)}</div>
      </div>` : null}
      <div class="flex flex-col rounded-[var(--ms-r-in)] overflow-hidden sf-raised sf-e2">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300/50 text-sm">${Icon("lucide:wifi-off", "text-muted")}<span class="flex-1">${T(t, "offlineYes")}</span>${Icon("lucide:check", "text-[var(--app-accent)]")}</div>
        <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300/50 text-sm">${Icon("lucide:smartphone", "text-muted")}<span class="flex-1">${T(t, "installableYes")}</span>${Icon("lucide:check", "text-[var(--app-accent)]")}</div>
        <div class="flex items-center gap-3 px-4 py-3 text-sm">${Icon("lucide:tag", "text-muted")}<span class="flex-1">${T(t, "version")}</span><span class="font-mono tabular-nums">v${sel.version || "1.0"}</span></div>
      </div>
      <div class="flex flex-col gap-1">
        <div class="text-[0.62rem] font-mono uppercase tracking-wide text-muted px-1 flex items-center justify-between"><span>${T(t, "whatsNew")}</span>${b === "upd" ? html`<span class="normal-case text-warning">${T(t, "newVersion")}</span>` : null}</div>
        <p class="text-sm text-base-content/80 px-1">${T(t, "whatsNewBody")}</p>
      </div>
    </div>`; })() : null}
  <//>`;

  
  const Featured = (a) => html`<button data-featured data-app=${a.id} aria-label=${nameOf(a)} key=${a.id} onClick=${() => tap(a)}
      class="group relative snap-center shrink-0 w-[84%] max-w-[22rem] aspect-[4/5] rounded-[var(--ms-r)] overflow-hidden bg-black sf-raised sf-e3 text-left transition-[transform,box-shadow] duration-150 active:scale-[.98]">
    ${a.shot ? html`<img src=${shotUrl(a)} alt="" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover object-top opacity-90" />` : null}
    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" aria-hidden="true"></div>
    <span class="absolute top-3 left-3 badge badge-secondary badge-sm font-bold">${T(t, "premium")}</span>
    <div class="absolute inset-x-0 bottom-0 p-4 flex items-end gap-3 text-white">
      ${Tile(a, "w-14 h-14")}
      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <span class="font-bold leading-tight truncate">${nameOf(a)}</span>
        <span class="text-xs text-white/75 leading-snug line-clamp-2">${taglineOf(a)}</span>
      </div>
    </div>
  </button>`;
  const RailTile = (a) => { const b = badgeOf(a); return html`<button data-app=${a.id} aria-label=${nameOf(a)} key=${a.id} onClick=${() => tap(a)} class="group snap-start shrink-0 w-[4.6rem] flex flex-col items-center gap-1.5 min-w-0">
    <div class="relative w-full">
      ${Tile(a, "w-full aspect-square transition-[transform,box-shadow] duration-150 group-active:scale-90")}
      ${b ? html`<span class="absolute top-1 right-1">${tag(b)}</span>` : installed(a) ? html`<span data-installed class="absolute bottom-1 right-1 grid place-items-center w-[18px] h-[18px] rounded-full bg-base-300 sf-e2" title=${T(t, "installed")}>${Icon("lucide:check", "text-[0.66rem] text-[var(--app-accent)]")}</span>` : null}
    </div>
    <div class="text-[0.68rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${nameOf(a)}</div>
  </button>`; };
  const Row = (a) => { const b = badgeOf(a); return html`<div data-app=${a.id} key=${a.id} class="flex items-center gap-3 py-2.5 border-b border-base-300/50 last:border-0">
    <button aria-label=${nameOf(a)} onClick=${() => openScreen(a.id)} class="flex items-center gap-3 flex-1 min-w-0 text-left">
      ${Tile(a, "w-14 h-14")}
      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <span class="font-medium leading-tight truncate flex items-center gap-2">${nameOf(a)}${b ? tag(b) : null}</span>
        <span class="text-xs text-muted leading-snug line-clamp-2">${taglineOf(a)}</span>
      </div>
    </button>
    <button class="btn btn-sm btn-secondary rounded-full px-4 shrink-0" aria-label=${`${T(t, "openApp")} — ${nameOf(a)}`} onClick=${() => launch(a)}>${T(t, "openApp")}</button>
  </div>`; };
  const rail = (items) => html`<div class="flex gap-3 overflow-x-auto snap-x px-1 -mx-1 pb-1 [scrollbar-width:none]">${items.map(RailTile)}</div>`;
  const list = (items) => html`<div class="flex flex-col rounded-[var(--ms-r)] sf-raised sf-e2 px-3">${items.map(Row)}</div>`;
  const heading = (label, meta) => html`<div class="text-[0.62rem] font-mono uppercase tracking-wide text-muted px-1 flex items-center justify-between gap-3"><span>${label}</span><span class="normal-case tabular-nums">${meta}</span></div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const searchBar = html`<div class="relative">
    <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${T(t, "search")} aria-label=${T(t, "search")} class="input input-bordered w-full rounded-2xl pl-10" />
    ${Icon("lucide:search", "absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 text-lg pointer-events-none")}
  </div>`;

  
  const query = q.trim().toLowerCase();
  if (query) {
    const found = apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}${found.length ? list(found) : noResults}${page}</div>`;
  }

  
  
  const chips = html`<${Segmented} attr="data-cat" scroll label=${T(t, "categories")}
    items=${["all", ...CATS].map((c) => ({ id: c, label: T(t, catKey(c)) }))}
    value=${cat} onChange=${setCat} />`;

  
  if (cat !== "all") {
    const items = apps.filter((a) => a.category === cat).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}${chips}
      ${heading(T(t, catKey(cat)), `${items.length} ${T(t, "inCategory")}`)}
      ${items.every(needsUsb) ? html`<div class="text-xs text-warning px-1">${T(t, "needsDevice")}</div>` : null}
      ${items.length ? list(items) : noResults}
      ${page}
    </div>`;
  }

  
  return html`<div class="flex flex-col gap-5">${searchBar}${chips}
    ${FEATURED.length ? html`<div class="flex flex-col gap-2">
      ${heading(T(t, "featured"), FEATURED.length)}
      <div class="flex gap-3 overflow-x-auto snap-x snap-mandatory px-1 -mx-1 pb-1 [scrollbar-width:none]">${FEATURED.map(Featured)}</div>
    </div>` : null}
    <div class="flex flex-col gap-5">
      ${CATS.map((c) => {
        const items = apps.filter((a) => a.category === c).sort(byName);
        if (!items.length) return null;
        return html`<div class="flex flex-col gap-2" key=${c}>
          
          <button class="text-left" onClick=${() => setCat(c)} aria-label=${`${T(t, catKey(c))} — ${T(t, "seeAll")}`}>${heading(html`${T(t, catKey(c))}${items.every(needsUsb) ? html`<span class="normal-case text-warning"> · ${T(t, "needsDevice")}</span>` : null}`, html`${items.length} ${Icon("lucide:chevron-right", "align-[-2px]")}`)}</button>
          ${rail(items)}
        </div>`;
      })}
    </div>
    ${page}
  </div>`;
}
