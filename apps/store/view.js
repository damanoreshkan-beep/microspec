// microspec store — the farm's launcher, as a real app store: a searchable icon grid, a per-app description
// sheet (history-backed) with an Open button, and a NEW badge on apps you haven't opened yet (tracked in
// IndexedDB via /_rt/db.js). The store lives in its OWN scope (/store/), so opening an app is out-of-scope →
// the app is independently installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import { iconTint } from "/_rt/colour.js";
import apps from "./apps.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
// The app's REAL icon: its brand.svg paths rendered inline, inheriting stroke from `currentColor` so the
// theme-adapted `color` (from iconTint) tints it — right in both light and dark. `size` is a CSS length.
// Falls back to the flat iconify glyph for any app that has no brand art.
const AppArt = (a, color, size) => a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:${color}`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:${color}`);
const SEEN = collection("seen");      // { id → { v: lastSeenVersion } } — "you have opened this"
// The catalogue you had already been SHOWN, which is a different question from the one above and used to
// share its answer. `seen` is empty for a first-time visitor, so "not in seen" marked all 68 apps NEW: a
// wall of identical badges, larger than the icons they sat on and, in the light theme, black on pastel.
// A badge on everything is a badge that means nothing. NEW now means "appeared since your last visit" —
// so the first visit establishes the baseline and marks nothing, and a badge is rare enough to be worth
// looking at. Deliberately a separate collection: merging them is what caused this.
const CATALOG = collection("catalog");
const appUrl = (id) => `../${id}/`;   // store is /…/store/, apps are siblings /…/<id>/
// Section order: everyday utilities first. Each app declares its own `category` in spec.json (carried into
// apps.json by the manifest), so the grid groups itself — the store never hard-codes which app goes where.
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), theme = useStore(S.theme), locale = useStore(S.locale);
  // The tile text is the APP's string, not the store's, so it cannot live in this app's dict — the manifest
  // carries every locale and the view picks one. Without this the chrome switched to English and sixty tiles
  // stayed Ukrainian, which is the farm's only surface with no locale parity.
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  // The manifest bakes ONE order (uk-collated), which is the wrong alphabet the moment the names change
  // language — so the sort belongs to the render, beside the names it sorts.
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  // `theme` is subscribed to for the RE-RENDER; the boolean is read off the DOM, which is the only source
  // that knows the theme actually being painted. `?theme=light` (the taste gate's override) sets
  // data-theme WITHOUT writing S.theme — deliberately, so a shared link can't change someone's setting —
  // so keying off the atom drew 60 brand-dark tiles onto a light page in every light-theme screenshot,
  // i.e. the review tool was lying about the one app whose whole surface is tiles. gsmscan already read
  // the DOM for exactly this reason. With no override the two agree, so real users are unaffected.
  void theme;
  const dark = !(typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light"));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");   // active category chip; "all" shows every section
  const [seen, setSeen] = useState(null);   // { id: version } last opened at (null while loading from IndexedDB)
  const [fresh, setFresh] = useState(null); // ids that were NOT in the catalogue last visit (null = loading)
  useEffect(() => {
    Promise.all([SEEN.all(), CATALOG.all()]).then(([s, c]) => {
      setSeen(Object.fromEntries(s.map((x) => [x.id, x.v])));
      const ids = apps.map((a) => a.id);
      const rec = c.find((x) => x.id === "known");
      // No baseline yet → this visitor is meeting the whole farm at once, so nothing is "new" to them.
      // Record what they were shown; anything added later is genuinely new next time.
      const known = rec ? new Set(rec.ids || []) : null;
      setFresh(known ? new Set(ids.filter((i) => !known.has(i))) : new Set());
      CATALOG.put("known", { ids }).catch(() => {});
    }).catch(() => { setSeen({}); setFresh(new Set()); });
  }, []);
  // added since your last visit / opened at an older version / nothing to say
  const badgeOf = (a) => (!seen || !fresh ? null : fresh.has(a.id) && !(a.id in seen) ? "new" : (a.id in seen) && seen[a.id] !== a.version ? "upd" : null);
  const installed = (a) => !!seen && a.id in seen;   // opened at least once = the store's actionable "installed" (no cross-origin install API)
  const launch = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); try { window.open(appUrl(a.id), "_blank", "noopener"); } catch { location.assign(appUrl(a.id)); } };
  const tag = (b, sm) => b === "new" ? html`<span class=${`badge badge-primary ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`badge badge-warning ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "updBadge")}</span>` : null;

  // ── per-app description sheet (history-backed via S.screen: Back closes it) ──
  // The kit's Sheet, not a hand-rolled full-screen overlay: it owns the shell (drag-to-dismiss, title row,
  // close, backdrop, its own inner scroll) and the grid stays behind it, so a peek at an app reads as a peek
  // rather than a navigation. `open` is driven by the routing atom the store already had; only the CONTENTS
  // are mounted conditionally, so `#open-app` genuinely leaves the DOM when the sheet is closed.
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const detail = html`<${Sheet} id="appsheet" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const it = iconTint(sel.bg, sel.fg, dark), b = badgeOf(sel); return html`<div class="flex flex-col items-center gap-5 py-1 text-center">
      ${/* same tile geometry as the grid, badge in the same corner — one representation of "new" per app */""}
      <div class="relative w-24 h-24 rounded-[24%] flex items-center justify-center sf-e3 shrink-0" style=${`background:${it.tile}`}>
        ${AppArt(sel, it.glyph, "3rem")}
        ${b ? html`<span class="absolute top-1.5 right-1.5">${tag(b, true)}</span>` : null}
      </div>
      <p class="text-base-content/70 leading-relaxed break-words">${taglineOf(sel)}</p>
      ${/* Disclosed BEFORE the tap, not after. Six apps open a HackRF One over WebUSB; without one their
            entire surface is a connect screen, and finding that out by launching is the store failing at
            its one job. Driven by the manifest's `needs`, so a future USB/serial app inherits it. */""}
      ${(sel.needs || []).includes("usb") ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-2xl px-3 py-2">${Icon("lucide:usb", "shrink-0")}<span>${T(t, "needsDeviceHackrf")}</span></div>` : null}
      <button id="open-app" class="btn btn-primary btn-lg rounded-2xl gap-2 w-full max-w-xs" onClick=${() => launch(sel)}>${Icon("lucide:external-link")}${T(t, "openApp")}</button>
      <div class="text-xs text-base-content/50 tabular-nums flex items-center gap-1.5">v${sel.version || "1.0"}${b === "upd" ? html`<span class="text-warning font-medium">· ${T(t, "newVersion")}</span>` : null}</div>
    </div>`; })() : null}
  <//>`;

  // ── search + category chips + sectioned icon grid ──
  // Tap: an app you've already opened launches straight away (no detail sheet); one you haven't opens its
  // description first, so the detail sheet stays a discovery surface. Installed apps carry a quiet corner check.
  const card = (a) => { const it = iconTint(a.bg, a.fg, dark), b = badgeOf(a), inst = installed(a); return html`<button data-app=${a.id} aria-label=${nameOf(a)} class="group flex flex-col items-center gap-1.5 min-w-0" onClick=${() => (inst ? launch(a) : openScreen(a.id))} key=${a.id}>
    <div class="relative aspect-square w-full rounded-[26%] flex items-center justify-center sf-e2 transition-transform duration-150 group-active:scale-90" style=${`background:${it.tile}`}>
      ${AppArt(a, it.glyph, "1.9rem")}
      ${b ? html`<span class="absolute top-1 right-1">${tag(b)}</span>`
          : inst ? html`<span data-installed class="absolute bottom-1 right-1 grid place-items-center w-[18px] h-[18px] rounded-full bg-base-100 sf-e2" title=${T(t, "installed")}>${Icon("lucide:check", "text-[0.66rem] text-success")}</span>` : null}
    </div>
    <div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${nameOf(a)}</div>
  </button>`; };
  const grid = (items) => html`<div class="grid grid-cols-4 gap-x-3 gap-y-4 @max-[300px]:grid-cols-3">${items.map(card)}</div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const searchBar = html`<div class="relative">
    <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${T(t, "search")} aria-label=${T(t, "search")} class="input input-bordered w-full rounded-2xl pl-10" />
    ${Icon("lucide:search", "absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 text-lg pointer-events-none")}
  </div>`;

  // search wins: a flat, un-sectioned result set across the whole farm
  const query = q.trim().toLowerCase();
  if (query) {
    const list = apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}${list.length ? grid(list) : noResults}${detail}</div>`;
  }

  // The category filter is a genuine one-of-N choice, so it is the kit's Segmented rail rather than a
  // hand-rolled chip row: eleven options never fit a fitted strip, and `scroll` is the rail that carries them.
  const shown = cat === "all" ? CATS : [cat];
  return html`<div class="flex flex-col gap-4">${searchBar}
    <${Segmented} attr="data-cat" scroll label=${T(t, "categories")}
      items=${["all", ...CATS].map((c) => ({ id: c, label: T(t, catKey(c)) }))}
      value=${cat} onChange=${setCat} />
    <div class="flex flex-col gap-5">
      ${shown.map((c) => {
        const items = apps.filter((a) => a.category === c).sort(byName);
        if (!items.length) return null;
        return html`<div class="flex flex-col gap-2" key=${c}>
          ${/* The count sits at the far edge, not beside the name. Same size and same muted colour touching
                the label read as one string — the shot said "НАУКА І НЕБО 10", as though the section were
                named that. Separating by POSITION rather than by another opacity step keeps it legible
                (a third muted tone is where axe contrast starts failing). */""}
          <div class="text-[0.62rem] font-mono uppercase tracking-wide text-muted px-1 flex items-center justify-between gap-3">
            <span>${T(t, catKey(c))}${items.every((a) => (a.needs || []).includes("usb"))
              ? html`<span class="normal-case text-warning/80"> · ${T(t, "needsDevice")}</span>` : null}</span>
            <span class="normal-case tabular-nums">${items.length}</span></div>
          ${grid(items)}
        </div>`;
      })}
    </div>
    ${detail}
  </div>`;
}
