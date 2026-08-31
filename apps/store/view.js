// DreamStudio store — the farm's launcher in the App Store's own structure (2026-08-31, second cut): a
// VERTICAL page with no horizontal scroller on it at all (the first cut's snap rails fought the vertical
// swipe on a phone), made of: a large "Today" title, a stack of full-width featured cards (a REAL capture of
// the app as the ground, eyebrow + title + one line, the icon row with an Open pill), then a section per
// category — three rows and "See all". A category or a search is the full list of rows. The app page (the
// kit's Sheet, large) is the App Store product page: icon + name + Open, an information strip, a carousel
// of real per-screen captures, the description, What's new, Information. NEW badges live in IndexedDB via
// /_rt/db.js. The account card on the Me tab comes from the runtime (profile.account) — the same sealed
// session tide and nova use. The store lives in its OWN scope (/store/), so opening an app is out-of-scope
// → the app is independently installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
// The app's REAL icon: the icon.svg wrapper — a 256² WebP of light on its own black ground — fills the tile
// in both themes, because the glow is the identity and re-tinting it would wash it out
// (docs/research/luminous-icons.md). An app without one falls back to its brand paths, then to a glyph.
const AppArt = (a, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:var(--color-base-content)`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:var(--color-base-content)`);
// A tile: the icon on its own black ground with the farm's lit rim. `cls` sizes it.
const Tile = (a, cls) => html`<div class=${`relative shrink-0 rounded-[22%] overflow-hidden bg-black sf-raised sf-e2 flex items-center justify-center ${cls}`}>${AppArt(a, a.icon ? "100%" : "46%")}</div>`;
const SEEN = collection("seen");      // { id → { v: lastSeenVersion } } — "you have opened this"
// The catalogue you had already been SHOWN — a different question, used to share its answer. `seen` is
// empty for a first-time visitor, so "not in seen" marked all apps NEW: a wall of identical badges. NEW
// means "appeared since your last visit": the first visit establishes the baseline and marks nothing.
const CATALOG = collection("catalog");
const appUrl = (id, install = false) => `../${id}/${install ? "?install=1" : ""}`;   // store is /…/store/, apps are siblings /…/<id>/
// Every screen is captured in BOTH themes (the eye batch runs twice), so a paper store shows paper apps —
// dark captures in the light theme were the tell that nothing was adapted. The view subscribes to S.theme
// (below), the one sanctioned way for markup to follow the toggle live.
const shotUrl = (a, tab, light) => `./assets/shot-${a.id}--${tab}${light ? "--light" : ""}.webp`;
// Section order: everyday utilities first. Each app declares its own `category` in spec.json (carried into
// apps.json by the manifest), so the sections group themselves — the store never hard-codes where an app goes.
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
const FEATURED = (spec.featured || []).map((id) => apps.find((a) => a.id === id)).filter(Boolean);
const isFeatured = (a) => FEATURED.some((f) => f.id === a.id);
const ROWS_PER_SECTION = 3;

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), locale = useStore(S.locale);
  const light = useStore(S.theme) === "signal-light";
  const firstShot = (a) => (a.shots?.length ? shotUrl(a, a.shots[0], light) : null);
  // The tile text is the APP's string, not the store's — the manifest carries every locale and the view picks.
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const screensOf = (a) => a.screens?.[locale] || a.screens?.en || [];
  // The first sentence is the App Store's "subtitle"; the whole paragraph is the description on the page.
  const subtitleOf = (a) => { const s = taglineOf(a); const m = /^(.{12,90}?[.!?—])\s/.exec(s + " "); return m ? m[1].replace(/[—.]$/, "") : s; };
  // The manifest bakes ONE order (uk-collated) — the sort belongs to the render, beside the names it sorts.
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  // ONE page, no inner navigation (owner, 2026-08-31): the first cut's category switch was LOCAL state, so
  // the hardware Back could not return from it — a violation of the farm's routing invariant (every
  // dismissable state is history-backed). Rather than wiring history into a filter, the mechanism is GONE:
  // everything is on the one scrolling page, search filters it in place, and the only overlay is the app
  // page, which rides S.screen and already answers Back.
  const [q, setQ] = useState("");
  const [seen, setSeen] = useState(null);   // { id: version } last opened at (null while loading from IndexedDB)
  const [fresh, setFresh] = useState(null); // ids that were NOT in the catalogue last visit (null = loading)
  const [more, setMore] = useState(false);  // the page's description, expanded
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
  useEffect(() => { setMore(false); }, [screen]);
  const badgeOf = (a) => (!seen || !fresh ? null : fresh.has(a.id) && !(a.id in seen) ? "new" : (a.id in seen) && seen[a.id] !== a.version ? "upd" : null);
  const installed = (a) => !!seen && a.id in seen;   // opened at least once = the store's actionable "installed" (no cross-origin install API)
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a, install = false) => { remember(a); try { window.open(appUrl(a.id, install), "_blank", "noopener"); } catch { location.assign(appUrl(a.id, install)); } };
  const tag = (b) => b === "new" ? html`<span class="badge badge-secondary badge-xs font-bold px-1 leading-none">${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class="badge badge-warning badge-xs font-bold px-1 leading-none">${T(t, "updBadge")}</span>` : null;
  const needsUsb = (a) => (a.needs || []).includes("usb");
  // Tap: the app page for anything you have not opened yet (discovery), a straight launch for one you have.
  const tap = (a) => (installed(a) ? launch(a) : openScreen(a.id));
  // The App Store's GET: a quiet pill — the accent as TEXT on a base-300 pill, never a filled button on
  // every row (thirty amber buttons is a wall, not a store). The page's own Open is the one filled button.
  const pill = (a, extra = "") => html`<button class=${`btn btn-xs rounded-full px-3.5 min-h-7 h-7 bg-base-300 border-0 text-secondary font-bold shrink-0 ${extra}`} aria-label=${`${T(t, "openApp")} — ${nameOf(a)}`} onClick=${(e) => { e.stopPropagation(); launch(a); }}>${installed(a) ? Icon("lucide:external-link", "text-sm") : T(t, "openApp")}</button>`;

  // ── the app PAGE (history-backed via S.screen: Back closes it) ──
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const page = html`<${Sheet} id="appsheet" size="lg" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const b = badgeOf(sel), scr = screensOf(sel), shots = sel.shots || [], desc = taglineOf(sel), long = desc.length > 180; return html`<div class="flex flex-col gap-6 pb-2">
      ${/* The product header: icon left, name / subtitle / the one filled Open + a quiet Install beside it. */""}
      <div class="flex items-start gap-4">
        ${Tile(sel, "w-28 h-28")}
        <div class="min-w-0 flex-1 flex flex-col gap-1 pt-0.5">
          <div class="font-bold text-[1.35rem] leading-tight break-words">${nameOf(sel)}</div>
          <div class="text-sm text-muted leading-snug line-clamp-2">${subtitleOf(sel)}</div>
          <div class="flex items-center gap-2 mt-2">
            <button id="open-app" class="btn btn-sm btn-secondary rounded-full px-5 min-h-8 h-8 font-bold" onClick=${() => launch(sel)}>${T(t, "openApp")}</button>
            <button id="install-app" class="btn btn-sm btn-ghost rounded-full px-3 min-h-8 h-8 gap-1.5" onClick=${() => launch(sel, true)}>${Icon("lucide:download", "text-base")}${T(t, "installApp")}</button>
          </div>
        </div>
      </div>
      ${/* The information strip — the App Store's row of facts under the header: a label in small caps, the
            value below, hairlines between. Version · category · offline · screens. */""}
      <div class="grid grid-cols-4 divide-x divide-base-300/60 border-y border-base-300/50 py-3 text-center">
        ${[[T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "offline"), T(t, "yes")], [T(t, "screens"), String(scr.length || 1)]].map(([k, v]) => html`<div class="px-1 min-w-0 flex flex-col gap-1" key=${k}>
          <div class="text-[0.58rem] font-mono uppercase tracking-wide text-muted truncate">${k}</div>
          <div class="text-sm font-semibold truncate">${v}</div>
        </div>`)}
      </div>
      ${needsUsb(sel) ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-2xl px-3 py-2">${Icon("lucide:usb", "shrink-0")}<span>${T(t, sel.deviceNote || "needsDeviceHackrf")}</span></div>` : null}
      ${/* Screenshots — one real capture per screen, in the app's populated state. The ONE horizontal scroller
            in the store: proximity snap (never mandatory — that is what fought the vertical swipe), its own
            overscroll, no scrollbar. */""}
      ${shots.length ? html`<div class="flex flex-col gap-2">
        <div class="font-bold text-lg px-0.5">${T(t, "screenshots")}</div>
        <div class="flex gap-3 overflow-x-auto snap-x [overscroll-behavior-x:contain] [scrollbar-width:none] -mx-[var(--ms-pad)] px-[var(--ms-pad)] pb-1">
          ${shots.map((tab, i) => html`<figure key=${tab} class="snap-start shrink-0 w-[62%] max-w-[15rem] rounded-[1.1rem] overflow-hidden bg-black sf-raised sf-e2 aspect-[384/832]">
            <img src=${shotUrl(sel, tab, light)} alt=${scr[i] || ""} loading=${i ? "lazy" : "eager"} decoding="async" class="w-full h-full object-cover object-top block" />
          </figure>`)}
        </div>
      </div>` : null}
      ${/* The description — the app's own paragraph, clamped with a "more" like the App Store's. */""}
      <div class="flex flex-col gap-1">
        <p class=${`text-[0.95rem] leading-relaxed text-base-content/85 break-words ${more || !long ? "" : "line-clamp-3"}`}>${desc}</p>
        ${long ? html`<button class="self-end text-sm font-semibold text-secondary" onClick=${() => setMore(!more)}>${more ? T(t, "less") : T(t, "more")}</button>` : null}
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between px-0.5"><span class="font-bold text-lg">${T(t, "whatsNew")}</span><span class="text-xs font-mono text-muted">v${sel.version || "1.0"}${b === "upd" ? html` · <span class="text-warning">${T(t, "newVersion")}</span>` : ""}</span></div>
        <p class="text-sm text-base-content/80">${T(t, "whatsNewBody")}</p>
      </div>
      <div class="flex flex-col gap-1">
        <div class="font-bold text-lg px-0.5">${T(t, "info")}</div>
        <div class="flex flex-col text-sm">
          ${[[T(t, "developer"), "DreamStudio"], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "offline"), T(t, "yes")], [T(t, "installation"), T(t, "homeScreen")], ...(needsUsb(sel) ? [[T(t, "device"), "USB"]] : []), ...(scr.length ? [[T(t, "screens"), scr.join(" · ")]] : [])].map(([k, v]) => html`<div class="flex items-start justify-between gap-4 py-2.5 border-b border-base-300/50 last:border-0" key=${k}><span class="text-muted shrink-0">${k}</span><span class="text-right break-words">${v}</span></div>`)}
        </div>
      </div>
    </div>`; })() : null}
  <//>`;

  // ── the shapes: FEATURED card, list ROW ──
  // A featured card is SMALL and tidy (owner, 2026-08-31): text on the left, the capture on the right as a
  // proportional thumbnail — the box carries the capture's own 384:832 aspect, so nothing is ever stretched
  // or cropped, and no text sits on the picture. A full-bleed tap layer sits under the content and the pill
  // above it — never a button inside a button (axe: nested-interactive).
  const Featured = (a) => { const shot = firstShot(a); return html`<article key=${a.id} class="relative rounded-[var(--ms-r)] sf-raised sf-e2 overflow-hidden">
    <button data-featured data-app=${a.id} aria-label=${nameOf(a)} onClick=${() => tap(a)} class="absolute inset-0 w-full h-full rounded-[inherit] text-left"></button>
    <div class="relative flex items-stretch gap-3 p-[var(--ms-pad)] pointer-events-none">
      <div class="min-w-0 flex-1 flex flex-col gap-1.5">
        <div class="text-[0.58rem] font-mono uppercase tracking-[.14em] text-secondary">${T(t, "premium")} · ${T(t, catKey(a.category))}</div>
        <div class="flex items-center gap-2.5 min-w-0">
          ${Tile(a, "w-10 h-10")}
          <span class="font-bold text-[1.05rem] leading-tight truncate">${nameOf(a)}</span>
        </div>
        <p class="text-[0.8rem] text-muted leading-snug line-clamp-3">${subtitleOf(a)}</p>
        <div class="mt-auto pt-1">${pill(a, "pointer-events-auto")}</div>
      </div>
      ${shot ? html`<div class="shrink-0 self-center w-[4.7rem] aspect-[384/832] rounded-[0.6rem] overflow-hidden bg-black ring-1 ring-base-300/60"><img src=${shot} alt="" loading="lazy" decoding="async" class="w-full h-full block" /></div>` : null}
    </div>
  </article>`; };
  const Row = (a) => { const b = badgeOf(a); return html`<div data-app=${a.id} key=${a.id} class="flex items-center gap-3 py-2">
    <button aria-label=${nameOf(a)} onClick=${() => tap(a)} class="flex items-center gap-3 flex-1 min-w-0 text-left">
      ${Tile(a, "w-[3.25rem] h-[3.25rem]")}
      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <span class="font-semibold text-[0.9rem] leading-tight truncate flex items-center gap-2">${nameOf(a)}${b ? tag(b) : null}${isFeatured(a) ? Icon("lucide:sparkles", "text-secondary text-xs") : null}</span>
        <span class="text-[0.78rem] text-muted leading-snug truncate">${subtitleOf(a)}</span>
      </div>
    </button>
    ${pill(a)}
  </div>`; };
  // A plain column with a full-width hairline between rows — the first cut indented every row after the
  // first with a margin meant for the divider alone, and the whole list stepped sideways.
  const rows = (items) => html`<div class="flex flex-col [&>div+div]:border-t [&>div+div]:border-base-300/40">${items.map(Row)}</div>`;
  const sectionHead = (label, count) => html`<div class="flex items-baseline justify-between gap-3 px-0.5">
    <span class="font-bold text-[1.15rem] leading-tight tracking-tight">${label}</span>
    <span class="text-xs text-muted tabular-nums shrink-0">${count}</span>
  </div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const searchBar = html`<div class="relative">
    <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${T(t, "search")} aria-label=${T(t, "search")} class="input input-bordered w-full rounded-2xl pl-10" />
    ${Icon("lucide:search", "absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 text-lg pointer-events-none")}
  </div>`;
  const dateLine = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // search filters the one page in place — the list remounts (key) so the stagger plays
  const query = q.trim().toLowerCase();
  if (query) {
    const found = apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}
      <div class="ms-stagger flex flex-col" key=${query}>${found.length ? rows(found) : noResults}</div>
      ${page}
    </div>`;
  }

  // TODAY — the whole store on one scroll: the featured stack, then every category with ALL its apps.
  return html`<div class="flex flex-col gap-7">${searchBar}
    <div class="flex flex-col gap-0.5 px-0.5">
      <div class="text-[0.62rem] font-mono uppercase tracking-[.14em] text-muted">${dateLine}</div>
      <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "today")}</h2>
    </div>
    ${FEATURED.length ? html`<div class="ms-stagger flex flex-col gap-3">${FEATURED.map((a, i) => html`<div style=${`--i:${i}`} key=${a.id}>${Featured(a)}</div>`)}</div>` : null}
    ${CATS.map((c) => {
      const items = apps.filter((a) => a.category === c).sort(byName);
      if (!items.length) return null;
      return html`<div class="flex flex-col gap-2" key=${c}>
        ${sectionHead(T(t, catKey(c)), items.length)}
        ${items.every(needsUsb) ? html`<div class="text-xs text-warning px-0.5">${T(t, "needsDevice")}</div>` : null}
        ${rows(items)}
      </div>`;
    })}
    ${page}
  </div>`;
}
