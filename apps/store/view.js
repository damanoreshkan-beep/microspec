// DreamStudio store — the farm's launcher as a real app store, not a grid (2026-08-31): a featured carousel
// of large cards (the premium set from spec.featured — a screenshot as the ground, the icon, the one line),
// category RAILS of tiles you scroll sideways, LIST ROWS when a category or a search narrows the field, and
// a history-backed app PAGE (the kit's Sheet) with the icon hero, Open + Install, the screenshot, the app's
// screens, its version and what it needs. NEW badges live in IndexedDB via /_rt/db.js. The account card on
// the Me tab comes from the runtime (profile.account) — the same sealed session tide and nova use.
// The store lives in its OWN scope (/store/), so opening an app is out-of-scope → the app is independently
// installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
// The app's REAL icon. A luminous app (`icon` in the manifest) IS its picture: the icon.svg wrapper — a
// 256² WebP of light on its own black ground — fills the tile in both themes, because the glow is the
// identity and re-tinting it would wash it out (docs/research/luminous-icons.md). Apps without one fall back
// to their brand.svg paths (stroke from `currentColor`, theme-adapted), then to the flat iconify glyph.
// `size` is a CSS length ("100%" fills a tile).
const AppArt = (a, color, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:${color}`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:${color}`);
// A tile: the icon on its own black ground with the farm's lit rim; `cls` sizes it.
const Tile = (a, cls) => html`<div class=${`relative shrink-0 rounded-[24%] overflow-hidden bg-black sf-raised sf-e2 flex items-center justify-center ${cls}`}>${AppArt(a, "var(--color-base-content)", a.icon ? "100%" : "45%")}</div>`;
const SEEN = collection("seen");      // { id → { v: lastSeenVersion } } — "you have opened this"
// The catalogue you had already been SHOWN, which is a different question from the one above and used to
// share its answer. `seen` is empty for a first-time visitor, so "not in seen" marked all 68 apps NEW: a
// wall of identical badges, larger than the icons they sat on and, in the light theme, black on pastel.
// A badge on everything is a badge that means nothing. NEW now means "appeared since your last visit" —
// so the first visit establishes the baseline and marks nothing, and a badge is rare enough to be worth
// looking at. Deliberately a separate collection: merging them is what caused this.
const CATALOG = collection("catalog");
const appUrl = (id, install = false) => `../${id}/${install ? "?install=1" : ""}`;   // store is /…/store/, apps are siblings /…/<id>/
const shotUrl = (a) => `./assets/shot-${a.id}.webp`;
// Section order: everyday utilities first. Each app declares its own `category` in spec.json (carried into
// apps.json by the manifest), so the rails group themselves — the store never hard-codes which app goes where.
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
const FEATURED = (spec.featured || []).map((id) => apps.find((a) => a.id === id)).filter(Boolean);
const isFeatured = (a) => FEATURED.some((f) => f.id === a.id);

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), locale = useStore(S.locale);
  // The tile text is the APP's string, not the store's, so it cannot live in this app's dict — the manifest
  // carries every locale and the view picks one. Without this the chrome switched to English and sixty tiles
  // stayed Ukrainian, which is the farm's only surface with no locale parity.
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const screensOf = (a) => a.screens?.[locale] || a.screens?.en || [];
  // The manifest bakes ONE order (uk-collated), which is the wrong alphabet the moment the names change
  // language — so the sort belongs to the render, beside the names it sorts.
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
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
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a, install = false) => { remember(a); try { window.open(appUrl(a.id, install), "_blank", "noopener"); } catch { location.assign(appUrl(a.id, install)); } };
  const tag = (b, sm) => b === "new" ? html`<span class=${`badge badge-secondary ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`badge badge-warning ${sm ? "badge-sm" : "badge-xs"} font-bold px-1 leading-none`}>${T(t, "updBadge")}</span>` : null;
  const needsUsb = (a) => (a.needs || []).includes("usb");
  const deviceNote = (a) => needsUsb(a) ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-2xl px-3 py-2">${Icon("lucide:usb", "shrink-0")}<span>${T(t, a.deviceNote || "needsDeviceHackrf")}</span></div>` : null;
  // Tap: the app page for anything you have not opened yet (discovery), a straight launch for one you have.
  const tap = (a) => (installed(a) ? launch(a) : openScreen(a.id));

  // ── the app PAGE (history-backed via S.screen: Back closes it) ──
  // The kit's Sheet at its large size, not a hand-rolled overlay: it owns the shell (drag-to-dismiss, title
  // row, close, backdrop, its own inner scroll) and the store stays behind it. Only the CONTENTS are mounted
  // conditionally, so `#open-app` genuinely leaves the DOM when the page is closed.
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const page = html`<${Sheet} id="appsheet" size="lg" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const b = badgeOf(sel), scr = screensOf(sel); return html`<div class="flex flex-col gap-5 py-1">
      ${/* The hero: the icon lit from behind by the amber bloom, the name, the category and the version. */""}
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
      ${/* Open and Install side by side. Apps are sibling scopes, so "Install" is the app opened with ?install=1
            and the app raising its own install sheet on arrival (runtime index.js) — the only honest install a
            launcher can offer across scopes. */""}
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

  // ── the three shapes: featured CARD, rail TILE, list ROW ──
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

  // search wins: a flat list of rows across the whole farm
  const query = q.trim().toLowerCase();
  if (query) {
    const found = apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}${found.length ? list(found) : noResults}${page}</div>`;
  }

  // The category filter is a genuine one-of-N choice, so it is the kit's Segmented rail rather than a
  // hand-rolled chip row: eleven options never fit a fitted strip, and `scroll` is the rail that carries them.
  const chips = html`<${Segmented} attr="data-cat" scroll label=${T(t, "categories")}
    items=${["all", ...CATS].map((c) => ({ id: c, label: T(t, catKey(c)) }))}
    value=${cat} onChange=${setCat} />`;

  // ONE category: its apps as list rows — the dense shape, with the one line each app says about itself.
  if (cat !== "all") {
    const items = apps.filter((a) => a.category === cat).sort(byName);
    return html`<div class="flex flex-col gap-4">${searchBar}${chips}
      ${heading(T(t, catKey(cat)), `${items.length} ${T(t, "inCategory")}`)}
      ${items.every(needsUsb) ? html`<div class="text-xs text-warning px-1">${T(t, "needsDevice")}</div>` : null}
      ${items.length ? list(items) : noResults}
      ${page}
    </div>`;
  }

  // EVERYTHING: the featured carousel, then a rail per category.
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
          ${/* The count sits at the far edge, not beside the name: same size and same muted colour touching the
                label read as one string ("НАУКА І НЕБО 10"). The device note is FULL-strength text-warning —
                an alpha step on an already-muted tone is where contrast dies (axe, light theme). */""}
          <button class="text-left" onClick=${() => setCat(c)} aria-label=${`${T(t, catKey(c))} — ${T(t, "seeAll")}`}>${heading(html`${T(t, catKey(c))}${items.every(needsUsb) ? html`<span class="normal-case text-warning"> · ${T(t, "needsDevice")}</span>` : null}`, html`${items.length} ${Icon("lucide:chevron-right", "align-[-2px]")}`)}</button>
          ${rail(items)}
        </div>`;
      })}
    </div>
    ${page}
  </div>`;
}
