/* @ts-self-types="./render.d.ts" */
/**
 * # runtime/render.js — the catalogue: an app declares what it is and never draws chrome
 *
 * The Preact render catalogue. It reads an app's spec and renders it through an allow-listed set of
 * component families: the shell (app bar, dock, dock fade, toast, confirm sheet), the LIST family (feed,
 * row, grid, gallery and table cards, badges, sections, segments, sort and toggle strips, search and
 * `searchFetch`, one sentinel for client windowing and server paging, a live bar chart), the CONVERTER and
 * DASHBOARD families (hero, hourly strip with a spline, days, an optional WebGPU stage), PROFILE (account,
 * install, APK, share, theme, language, permissions), the top-level DETAIL drill-down with an in-app player,
 * the FILTER sheet and chips, and the systemic screens (permissions, sign-in, APK, the desktop QR, the clean
 * screen). What it buys the farm is that sixty apps share one shell, one empty state, one skeleton, one
 * favourite star, one chrome contract — and a fix lands in all of them at once. The lesson behind most of
 * the comments in this file is the same one: `--hdr-h` and `--dock-h` are MEASURED by the element, never
 * declared, because a hand-written constant drifts past the real footprint with every gate green.
 *
 * ![The render module map: spec in, families out, the chrome around them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-render.svg)
 *
 * ## Import
 * ```js
 * import { setApp, App, isIOS, isStandalone } from "/_rt/render.js";                    // an app's page: the import map resolves /_rt/
 * import { setApp, App, isIOS, isStandalone } from "@microspec/core/runtime/render.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link setApp} — `setApp(app, views)`: binds the app context (`{ spec, S, load, toast, toggleFav, favKey, swap, … }`) and the tool-app views keyed by `tab.view`; called once by the boot before the first render.
 * - {@link App} — the app root: chrome, the current tab's view and every systemic overlay, driven by the routing atoms in `S`.
 * - {@link isIOS} — whether the page runs on an iOS device (the install flow differs: no `beforeinstallprompt`).
 * - {@link isStandalone} — whether the page runs as an installed PWA (standalone display mode, or iOS's `navigator.standalone`).
 *
 * ## In practice
 * ```js
 * // Apps never import this file: index.js's start() does, once. This is that boot, reduced to its render half.
 * import { render } from "preact";
 * import { html } from "htm/preact";
 * import { createApp } from "./store.js";
 * import { setApp, App } from "./render.js";
 *
 * const app = createApp(spec, load);                     // spec.json + the app's data.js loader
 * app.canRefresh = typeof load === "function";            // a tool app hides the dead refresh affordance
 * setApp(app, views || {});                               // tool-app views: { [tab.view]: PreactComponent }
 * render(html`<${App} />`, document.getElementById("app"));
 * ```
 * A tool view receives `{ t, tab, S, toast, undo, confirm, screen, openScreen, closeScreen }`; a `detail.view`
 * body receives `{ item, t, loc, S, toast, undo, confirm }` — the same helper set, so an interactive drill-down
 * never has to reach for a `tool` tab and hand-roll the list around it.
 *
 * ## How it fits
 * The widest import list in the runtime: `authwall`, `i18n`, `apk`, `gate`, `ui` (`SHEET_BOX`), `version`,
 * `permissions`, `translate`, `skeleton`, `enrich`, `db`, `gesture`, `weather` (`curvePath`), plus Preact,
 * htm and nanostores. Heavy leaves are lazy-imported so the bootstrap closure stays small: `account.js` and
 * `signin.js`/`auth.js` (only apps that sign a reader in), `video.js` (only apps whose detail declares
 * `play`), `hero.js` (only a tab with a `stage`), `qrcode.js` (only when the desktop QR modal opens).
 * Imported by `index.js` alone — `start()` calls `setApp` and mounts `App` — so every one of the 74 farm apps
 * runs through it and none imports it by name; the generated `sw.js` of each app precaches it.
 *
 * ## Invariants and pitfalls
 * - Chrome is measured, not declared: the app bar and the dock publish `--hdr-h`, `--dock-h` and `--dock-w`
 *   from their own `offsetHeight` through a ResizeObserver. Nothing else may write those numbers, and the
 *   dock fade is exactly `--dock-h` tall — one rem taller and it veils rave's sequencer and kalimba's keys.
 * - `S.clean` removes the app bar, the dock and the fade and sets both numbers to 0px, one-directionally:
 *   there is no cleanup restoring old values, because the remounted chrome republishes what it measures.
 * - A skeleton must take the shape the content will take (gallery grid stays 3-up, row stays a row), or the
 *   page jumps the moment data lands. Never a spinner.
 * - `sections` compose with every layout — grid, gallery, table, feed — through `GRID_FOR`; returning the flat
 *   grid regardless is what silently ate arc's shelf headings.
 * - Item `href` values from feed data go through `safeHref`: only `http(s)` survives; `javascript:` and
 *   `data:` URLs render nothing.
 * - The list windows the DOM (24 items per scroll step, 120 rows for a table) and one sentinel drives both the
 *   client window and `A.loadMore()`; `loadMore` no-ops with no cursor or a page in flight, so it may fire freely.
 * - `?tab=`, `?screen=` and `?detail=` open a tab, a sub-screen or one item's drill-down on load — for the
 *   screenshot service that cannot tap. Validated against the spec and the loaded items, never persisted.
 * - Section counts are a mono `text-muted` micro-label, not `badge-ghost`: DaisyUI's two-class rule wins on
 *   specificity and the count stayed at axe-serious contrast in dark.
 * - The active dock tab is a filled pill, not a brighter text colour: in this theme `--color-primary` and
 *   `--color-base-content` are the same ink, so the old idiom measured 1.56:1 between states.
 * @module
 */
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { authWall } from "./authwall.js";
import { shell } from "./shell.js";
import { T, ago, whenLabel, sinceLabel, sys } from "./i18n.js";
import { buildApk, apkPower, fetchAppIcons, adaptiveFromTile, letterTilePng, downloadBlob, apkFilename } from "./apk.js";
import { gate } from "./gate.js";
import { Sheet } from "./ui.js";
import { SHEET_BOX } from "./ui.js";
import { CORE, BUILD, appVersion } from "./version.js";
import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, permAndroid } from "./permissions.js";
import { tr, warm, trTick, CONTENT_LANG } from "./translate.js";
import { Scramble, Pixels, useReveal } from "./skeleton.js";
import { enrich, warmMeta, metaTick } from "./enrich.js";
import { collection } from "./db.js";
import { useSheetDrag } from "./gesture.js";
import { curvePath } from "./weather.js";
import { inTelegram, payStars, celebrate } from "./tma.js";

let A;
let VIEWS = {};
/**
 * Binds the app context the catalogue renders from. Called once by the boot before the first render.
 * @param app the app context — { spec, S (atoms), load, toast, toggleFav, favKey, swap, … }
 * @param views tool-app custom views keyed by `tab.view`, or nothing for declarative apps
 */
export function setApp(app, views) { A = app; VIEWS = views || {}; }

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const trFields = () => A.spec.translate || [];
function field(it, name, loc) {
  const e = A.spec.enrich;
  let v = (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
  return trFields().includes(name) ? tr(v, loc) : v;
}
function fieldNode(it, name, loc) {
  const e = A.spec.enrich, raw = (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
  if (!trFields().includes(name) || loc === CONTENT_LANG || typeof raw !== "string" || !raw.trim()) return field(it, name, loc);
  return html`<${Scramble} text=${tr(raw, loc)} len=${raw.length} />`;
}
const searchText = (it) => Object.values(it).map((v) => Array.isArray(v) ? v.join(" ") : v).join(" ").toLowerCase();

function test(it, fav, expr) {
  if (!expr) return true;
  const neg = expr.startsWith("!");
  const key = neg ? expr.slice(1) : expr;
  const truthy = key === "fav" ? !!fav[A.favKey(it)] : !!it[key];
  return neg ? !truthy : truthy;
}

function safeHref(href) {
  if (typeof href !== "string") return null;
  try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) ? href : null; }
  catch { return null; }
}

const metaText = (meta, it, dict, loc) => {
  if (!meta) return "";
  if (typeof meta === "string") return it[meta] ?? "";
  const v = it[meta.field];
  return v == null ? "" : (meta.format === "ago" ? ago(dict, v, loc) : meta.format === "when" ? whenLabel(dict, v, loc, true, meta.precision ? it[meta.precision] : undefined) : meta.format === "since" ? sinceLabel(dict, v, loc) : String(v));
};
const isTimeFmt = (fmt) => fmt === "ago" || fmt === "when" || fmt === "since";
const fmtNum = (n, loc) => new Intl.NumberFormat(loc === "uk" ? "uk-UA" : "en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0);

const DATE_FMT = { ago, when: whenLabel, since: sinceLabel };
const fmtCell = (c, it, t, loc) => (c.format && DATE_FMT[c.format]) ? DATE_FMT[c.format](t, it[c.field], loc, true, c.precision ? it[c.precision] : undefined) : it[c.field];

function heatMap(items, field) {
  const v = items.map((it) => Math.max(0, Number(it[field]) || 0));
  const pos = v.filter((x) => x > 0);
  if (!pos.length) return new Map(items.map((it) => [it, 0]));
  const lo = Math.log(Math.min(...pos)), span = Math.log(Math.max(...pos)) - lo || 1;
  return new Map(items.map((it, i) => [it, v[i] > 0 ? Math.min(1, Math.max(0, (Math.log(v[i]) - lo) / span)) : 0]));
}
const heatBg = (x) => `rgba(240,169,59,${(0.16 + 0.84 * x).toFixed(3)})`;
const heatInk = (x) => (x >= 0.5 ? `light-dark(#7a4a00,rgba(240,169,59,${(0.55 + 0.45 * x).toFixed(3)}))` : "");

let _searchT;
const debouncedLoad = () => { clearTimeout(_searchT); _searchT = setTimeout(() => A.load(), 350); };

const Empty = (icon, text, hint) => html`<div data-empty class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6"><span data-mascot aria-hidden="true"></span>${Icon(icon, "text-4xl")}<span class="font-medium">${text}</span>${hint && html`<span class="text-sm text-muted">${hint}</span>`}</div>`;

const Skeleton = (card = {}) => {
  if (card.layout === "gallery") return html`<div class="@container pt-2"><div class=${`grid grid-cols-3 @max-[220px]:grid-cols-2 @min-[600px]:grid-cols-4 gap-x-3 gap-y-5`}>${Array.from({ length: 9 }, (_, i) => html`<div data-skel class="flex flex-col gap-2 min-w-0" key=${i}>
    <div class=${`${card.aspect === "portrait" ? "aspect-[2/3]" : "aspect-square"} w-full rounded-[var(--ms-r)] overflow-hidden sf-inset`}><${Pixels} /></div>
    <div class="min-w-0 text-base-content/70"><div class="text-sm font-semibold truncate"><${Scramble} len=${9} /></div><div class="text-xs truncate mt-0.5"><${Scramble} len=${7} /></div><div class="mt-1.5"><${Scramble} len=${5} cls="text-xs" /></div></div>
  </div>`)}</div></div>`;
  const row = card.layout === "row", img = !!card.image; return html`<${Fragment}>${Array.from({ length: 5 }, (_, i) => row
  ? html`<div data-skel class="card sf-raised sf-e2 rounded-[var(--ms-r)] overflow-hidden" key=${i}><div class="card-body p-3 px-4 flex-row items-center gap-3 text-base-content/70"><${Scramble} len=${2} cls="w-9 shrink-0 text-primary/60 font-bold" /><div class="flex-1 min-w-0 truncate"><${Scramble} len=${18} /></div><div class="shrink-0"><${Scramble} len=${5} /></div></div></div>`
  : html`<div data-skel class="card sf-raised sf-e2 rounded-[var(--ms-r)] overflow-hidden" key=${i}>${img ? html`<figure class="aspect-video overflow-hidden"><${Pixels} /></figure>` : null}<div class="card-body p-4 gap-2 text-base-content/70"><div class="font-semibold truncate"><${Scramble} len=${16} /></div><div class="text-sm text-base-content/70 truncate"><${Scramble} len=${26} /></div></div></div>`)}</${Fragment}>`; };

const Frag = (children) => html`<${Fragment}>${children}</${Fragment}>`;

function Badges({ item: it, badges, hide }) {
  const t = useStore(A.S.t), fav = useStore(A.S.fav);
  if (!badges) return null;
  return html`<div class="flex flex-wrap gap-1.5 mt-0.5">${badges.map((b) => {
    if (hide && b.key === hide) return null;
    const cls = `badge badge-sm ${b.variant === "primary" ? "badge-primary" : b.variant === "success" ? "badge-success badge-outline" : "badge-ghost"} @max-[240px]:hidden`;
    if (b.field) {
      const v = it[b.field];
      if (Array.isArray(v)) return v.map((x) => html`<span class=${cls} key=${x}>${x}</span>`);
      return v != null && v !== "" ? html`<span class=${`${cls} ${b.icon ? "gap-1" : ""}`}>${b.icon ? Icon(b.icon) : null}${v}</span>` : null;
    }
    if (b.when && test(it, fav, b.when)) return html`<span class=${`${b.variant === "primary" ? "badge badge-sm badge-primary" : "badge badge-sm badge-ghost"} gap-1`}>${b.icon ? Icon(b.icon) : null} ${T(t, b.label)}</span>`;
    return null;
  })}</div>`;
}

function Card({ item: it, card, hide }) {
  const t = useStore(A.S.t), fav = useStore(A.S.fav), loc = useStore(A.S.locale);
  useStore(trTick); useStore(metaTick);
  const on = !!fav[A.favKey(it)];
  const star = A.spec.fav ? html`<button data-fav=${A.favKey(it)} aria-label=${on ? T(t, "unfavAria") : T(t, "favAria")}
    onClick=${(e) => { e.preventDefault(); e.stopPropagation(); A.toggleFav(it); }}
    class=${`btn btn-ghost btn-xs btn-circle relative z-[2] ${on ? "text-primary" : "opacity-50"}`}>${Icon(card.layout === "row" ? "lucide:star" : `lucide:bookmark${on ? "-check" : ""}`, "text-lg")}</button>` : null;

  if (card.layout === "row") {
    return html`<div class="card @container sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-3 px-4 flex-row items-center gap-3 @max-[260px]:px-2.5 @max-[260px]:gap-2">
      <div class="font-bold text-primary w-11 shrink-0 @max-[260px]:w-8 @max-[260px]:text-sm">${it[card.lead] ?? "—"}</div>
      <div class="flex-1 min-w-0 @max-[260px]:hidden"><div class="font-medium truncate text-sm">${fieldNode(it, card.title, loc)}</div></div>
      <div class="text-right @max-[260px]:text-sm"><div class="font-semibold tabular-nums">${it[card.trailing] == null ? "—" : card.unit ? it[card.trailing] + " " + card.unit : it[card.trailing]}</div>${card.trend && it[card.trend] != null ? html`<div class=${`text-xs font-medium tabular-nums ${Number(it[card.trend]) >= 0 ? "text-success" : "text-error"}`}>${Number(it[card.trend]) >= 0 ? "+" : ""}${it[card.trend]}%</div>` : null}</div>
      ${star}
    </div></div>`;
  }

  if (card.layout === "grid") {
    const href = card.href ? safeHref(it[card.href]) : null;
    const bg = card.bg ? it[card.bg] : null, fg = card.fg ? it[card.fg] : null;
    const tile = html`<div class="aspect-square w-full rounded-[24%] flex items-center justify-center overflow-hidden sf-e2" style=${bg ? `background-color:${bg}` : ""}>
      ${card.image && it[card.image]
        ? html`<img src=${it[card.image]} alt="" loading="lazy" class="w-full h-full object-cover"/>`
        : html`<iconify-icon icon=${(card.icon && it[card.icon]) || "lucide:box"} class="text-3xl" style=${fg ? `color:${fg}` : ""}></iconify-icon>`}
    </div>`;
    const inner = html`<div class="flex flex-col items-center gap-1.5 active:scale-90 transition-transform min-w-0 w-full">${tile}<div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${field(it, card.title, loc)}</div></div>`;
    return href ? html`<a href=${href} aria-label=${it[card.title] ?? ""} class="block min-w-0">${inner}</a>` : inner;
  }

  if (card.layout === "gallery") {
    const ratio = card.aspect === "portrait" ? "aspect-[2/3]" : "aspect-square";
    const art = html`<div class=${`${ratio} w-full rounded-[var(--ms-r)] flex items-center justify-center overflow-hidden sf-raised sf-e2 shrink-0`}>
      ${card.image && it[card.image]
        ? html`<img src=${it[card.image]} alt="" loading="lazy" class=${`w-full h-full ${card.imageFit === "cover" ? "object-cover" : "object-contain p-3"}`}/>`
        : html`<iconify-icon icon=${(card.icon && it[card.icon]) || "lucide:package"} class="text-3xl opacity-60"></iconify-icon>`}
    </div>`;
    const gsub = card.subtitle ? field(it, card.subtitle, loc) : null;
    return html`<div class="relative flex flex-col gap-2 min-w-0 active:scale-[.97] transition-transform">
      ${art}
      ${
        star ? html`<div class="absolute top-1 right-1 z-[2]">${star}</div>` : null}
      <div class="min-w-0">
        <div class="text-sm font-semibold leading-tight line-clamp-2 break-words">${field(it, card.title, loc)}</div>
        ${gsub ? html`<div class="text-xs text-muted truncate mt-0.5">${gsub}</div>` : null}
        ${card.badges?.length ? html`<div class="flex flex-wrap gap-1 mt-1.5"><${Badges} item=${it} badges=${card.badges} /></div>` : null}
      </div>
      <button class="aw-tap absolute inset-0 z-[1] rounded-2xl" aria-label=${`${field(it, card.title, loc) ?? ""} — ${T(t, card.more || "title")}`} onClick=${() => A.S.detail.set(it)}></button>
    </div>`;
  }

  const sub = card.subtitle ? field(it, card.subtitle, loc) : null;
  const bodyTxt = card.body ? field(it, card.body, loc) : null;
  const body = html`<div class="card-body p-4 gap-2 @max-[240px]:p-3 @max-[240px]:gap-1">
    <div class="flex items-start justify-between gap-2"><h2 class="font-semibold leading-snug break-words min-w-0 @max-[240px]:text-sm">${fieldNode(it, card.title, loc) ?? "—"}</h2>${star}</div>
    ${sub ? html`<div class="text-sm text-base-content/70 @max-[240px]:hidden">${fieldNode(it, card.subtitle, loc)}</div>` : null}
    <${Badges} item=${it} badges=${card.badges} hide=${hide} />
    ${bodyTxt ? html`<p class="text-sm text-base-content/70 line-clamp-2 @max-[240px]:hidden">${fieldNode(it, card.body, loc)}</p>` : null}
    <div class="flex items-center justify-between gap-2 mt-0.5 @max-[240px]:hidden">
      ${(() => { const mt = metaText(card.meta, it, t, loc); return mt ? html`<span class="text-xs text-base-content/80 flex items-center gap-1">${isTimeFmt(card.meta?.format) ? Icon("lucide:clock", "text-[0.9em] opacity-70") : null}${mt}</span>` : html`<span></span>`; })()}
      ${card.more ? html`<span class="text-xs text-primary font-medium flex items-center gap-0.5 ml-auto">${T(t, card.more)} ${Icon(A.spec.detail ? "lucide:chevron-right" : "lucide:arrow-up-right")}</span>` : null}
    </div></div>`;

  const img = card.image && it[card.image] ? html`<figure class="aspect-video bg-base-300 overflow-hidden @max-[240px]:hidden"><img src=${it[card.image]} alt="" loading="lazy" class=${`w-full h-full ${card.imageFit === "contain" ? "object-contain" : "object-cover"}`}/></figure>` : null;
  const cls = `card @container sf-raised sf-e2 rounded-[var(--ms-r)]${card.image ? " overflow-hidden" : ""}`;

  if (A.spec.detail) {
    return html`<div class=${cls + " relative active:scale-[.99] transition"}>${img}${body}
      <button class="aw-tap absolute inset-0 z-[1] rounded-2xl" aria-label=${`${field(it, card.title, loc) ?? ""} — ${T(t, card.more || "title")}`} onClick=${() => A.S.detail.set(it)}></button></div>`;
  }
  const href = card.href ? safeHref(it[card.href]) : null;
  return href
    ? html`<a href=${href} target="_blank" rel="noopener" class=${cls + " block active:scale-[.99] transition"}>${img}${body}</a>`
    : html`<div class=${cls}>${img}${body}</div>`;
}

const GRID_FOR = {
  gallery: "grid grid-cols-3 @max-[220px]:grid-cols-2 @min-[600px]:grid-cols-4 gap-x-3 gap-y-5",
  grid: "grid grid-cols-3 @min-[300px]:grid-cols-4 gap-x-3 gap-y-5",
};

function SectionHead({ sec, t, filters, n, collapsible = false, open = true, onToggle }) {
  const label = html`<span class=${`text-sm font-semibold flex items-center gap-1.5 ${sec.accent ? "text-primary" : ""}`}>${sec.icon ? Icon(sec.icon) : null}${T(t, sec.label, sec.labelParams ? { cat: filters[sec.labelParams] } : null)}</span>`;
  const count = sec.accent
    ? html`<span class="badge badge-sm badge-primary">${n}</span>`
    : html`<span class="font-mono text-[length:var(--ms-label)] text-muted tabular-nums">${n}</span>`;
  const rule = html`<span class="flex-1 h-px bg-base-300"></span>`;
  if (collapsible) {
    return html`<button type="button" data-section=${sec.filter} aria-expanded=${open} onClick=${onToggle}
      class="flex items-center gap-2 mt-3 mb-1 px-1 w-full text-left active:opacity-80">
      ${Icon(open ? "lucide:chevron-down" : "lucide:chevron-right", "text-base-content/45 shrink-0")}${label}${count}${rule}</button>`;
  }
  return html`<div class="flex items-center gap-2 mt-3 mb-1 px-1">${label}${count}${rule}</div>`;
}

function Section({ sec, items, card, tab }) {
  const t = useStore(A.S.t), filters = useStore(A.S.filters);
  const [open, setOpen] = useState(sec.open !== false);
  const collapsible = !!sec.collapsible;
  const head = SectionHead({ sec, t, filters, n: items.length, collapsible, open, onToggle: () => setOpen((o) => !o) });
  if (collapsible && !open) return head;
  const grid = GRID_FOR[card.layout];
  const body = grid
    ? html`<div class="@container"><div class=${grid}>${items.map((it) => html`<${Card} item=${it} card=${card} hide=${sec.hideBadge} key=${A.favKey(it) || it[card.title]} />`)}</div></div>`
    : card.layout === "table"
      ? html`<${Table} items=${items} tab=${tab} />`
      : items.map((it) => html`<${Card} item=${it} card=${card} hide=${sec.hideBadge} key=${A.favKey(it) || it[card.title]} />`);
  return html`<${Fragment}>${head}${body}</${Fragment}>`;
}

function Banner({ banner }) {
  const t = useStore(A.S.t);
  return html`<div class="alert bg-primary/10 border border-primary/25 rounded-2xl text-sm py-2.5 px-3 flex items-start gap-2" role="note">
    ${Icon(banner.icon, "text-primary text-lg mt-0.5 shrink-0")}
    <div class="text-base-content"><span class="font-semibold">${T(t, banner.titleKey)}</span><span class="text-base-content/80">${T(t, banner.bodyKey)}</span></div>
  </div>`;
}

const WINDOW_PAGE = 24;
function InfiniteTail({ count, total, grow, paginate }) {
  const t = useStore(A.S.t), data = useStore(A.S.data);
  const ref = useRef();
  const hasLocal = count < total;
  const hasMore = hasLocal || (paginate && data.next != null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) grow(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [count, total, data.next, data.loadingMore]);
  const btn = (cls, icon) => html`<button id="loadmore" class=${`btn btn-ghost btn-sm gap-2 ${cls}`} onClick=${grow}>${Icon(icon)} ${T(t, "loadMore")}</button>`;
  return html`<div ref=${ref} class="flex justify-center py-4 min-h-8" aria-live="polite">
    ${data.loadingMore ? html`<div class="text-muted text-sm" role="status" aria-label=${T(t, "statusLoading")}><${Scramble} len=${10} /></div>`
      : data.moreError && !hasLocal ? btn("text-error", "lucide:rotate-cw")
      : hasMore ? btn("text-base-content/70", "lucide:chevron-down")
      : null}
  </div>`;
}

function Chart({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data);
  const cfg = tab.chart, all = data.items || [];
  if (all.length < 2) return null;
  const plot = all.slice(0, cfg.max || 40);
  const heat = heatMap(all, cfg.field);
  const sorted = all.map((it) => Math.max(0, Number(it[cfg.field]) || 0)).sort((a, b) => a - b);
  const max = sorted[Math.floor(sorted.length * 0.92)] || sorted[sorted.length - 1] || 1;
  const W = 320, H = 56, bw = W / plot.length, seq = plot.slice().reverse();
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-3 gap-1.5">
    ${cfg.label ? html`<div class="text-xs text-muted px-1 font-medium">${T(t, cfg.label)}</div>` : null}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-full" style="height:52px" role="img" aria-label=${T(t, cfg.label || "title")}>
      ${seq.map((it, i) => { const h = Math.max(1.5, Math.min(1, (Math.max(0, Number(it[cfg.field]) || 0)) / max) * (H - 3)); return html`<rect x=${(i * bw + bw * 0.14).toFixed(2)} y=${(H - h).toFixed(2)} width=${(bw * 0.72).toFixed(2)} height=${h.toFixed(2)} fill=${heatBg(heat.get(it))} key=${i}></rect>`; })}
    </svg>
  </div></div></div>`;
}

const TABLE_CAP = 120;
function Table({ items, tab }) {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const cols = tab.card.columns, hc = cols.find((c) => c.heat);
  const heat = hc ? heatMap(items, hc.heat) : null;
  const rows = items.slice(0, TABLE_CAP);
  const cls = (c) => `${c.grow ? "flex-1 min-w-0 truncate" : "shrink-0"}${c.align === "right" ? " text-right" : ""}${c.mono ? " tabular-nums" : ""}${c.muted ? " text-base-content/55" : ""}${c.lg ? " text-[0.95rem] font-semibold" : " font-medium"}`;
  const open = (it) => { if (A.spec.detail) A.S.detail.set(it); else if (tab.card.href) { const h = safeHref(it[tab.card.href]); if (h) window.open(h, "_blank"); } };
  return html`<div class="px-4 max-w-xl mx-auto w-full">
    <div class="flex items-center gap-3 px-3 py-1.5 text-[0.62rem] uppercase tracking-wide text-base-content/45">${cols.map((c) => html`<div class=${(c.grow ? "flex-1 min-w-0 truncate" : "shrink-0") + (c.align === "right" ? " text-right" : "")} key=${c.field}>${c.label ? T(t, c.label) : ""}</div>`)}</div>
    <div class="flex flex-col rounded-[var(--ms-r)] overflow-hidden sf-raised sf-e2">
      ${rows.map((it, i) => html`<button type="button" data-row=${i} class="flex items-center gap-3 pl-4 pr-3.5 py-3 text-sm border-b border-base-300/50 last:border-0 active:bg-base-200 text-left w-full relative" key=${A.favKey(it) || it[cols[0].field] || i} onClick=${() => open(it)}>
        ${heat ? html`<span class="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full" style=${`background:${heatBg(heat.get(it))}`}></span>` : null}
        ${cols.map((c) => html`<div class=${cls(c) + " leading-tight"} style=${c.heat && heat ? `color:${heatInk(heat.get(it))}` : ""} key=${c.field}>${fmtCell(c, it, t, loc)}${c.sub && it[c.sub] != null && it[c.sub] !== "" ? html`<div class="text-[0.7rem] font-normal text-base-content/45 tabular-nums leading-tight mt-0.5">${it[c.sub]}</div>` : null}</div>`)}
      </button>`)}
    </div>
  </div>`;
}

function ListView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), q = useStore(A.S.query).trim().toLowerCase(), fav = useStore(A.S.fav), filters = useStore(A.S.filters), loc = useStore(A.S.locale), sortKey = useStore(A.S.sort), segKey = useStore(A.S.seg);
  const mt = useStore(metaTick);
  const [vis, setVis] = useState(WINDOW_PAGE);
  useEffect(() => {
    const src = tab.source === "fav" ? Object.values(fav) : (data.items || []);
    if (A.spec.enrich) warmMeta(src.map((it) => it[A.spec.enrich.url]));
    const fields = A.spec.translate;
    if (fields?.length && loc !== "en") warm(src.flatMap((it) => fields.map((f) => field(it, f, "en"))), loc);
  }, [data.items, fav, loc, tab.source, mt]);
  useEffect(() => { setVis(WINDOW_PAGE); }, [tab, q, sortKey, segKey, filters]);
  if (!tab.card) return Empty("lucide:alert-triangle", T(t, tab.empty?.text || "noResults"), null);
  if (!useReveal(!data.loading)) return Skeleton(tab.card);
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  if (tab.searchFetch && !q && !tab.browse) return Empty(tab.prompt?.icon || "lucide:search", T(t, tab.prompt?.text || "searchPrompt"), T(t, tab.prompt?.hint || "searchPromptHint"));

  let items = tab.source === "fav" ? Object.values(fav) : data.items;
  if (tab.filter) items = items.filter((it) => test(it, fav, tab.filter));
  if (tab.segments) { const s = tab.segments.find((x) => x.key === segKey) || tab.segments[0]; if (s && s.filter) items = items.filter((it) => test(it, fav, s.filter)); }
  if (q && !tab.searchFetch) items = items.filter((it) => searchText(it).includes(q));
  for (const cf of (tab.clientFilters || [])) if (filters[cf.key]) items = items.filter((it) => test(it, fav, cf.when));
  for (const c of (A.spec.filters?.controls || [])) if (c.type === "range" && filters[c.key]) {
    const r = filters[c.key];
    items = items.filter((it) => { const v = Number(it[c.field]); return !isNaN(v) && (r.from == null || r.from === "" || v >= +r.from) && (r.to == null || r.to === "" || v <= +r.to); });
  }
  for (const c of (A.spec.filters?.controls || [])) if (c.type === "multi" && c.field && Array.isArray(filters[c.key])) {
    const set = new Set(filters[c.key]);
    items = items.filter((it) => set.has(it[c.field]));
  }
  if (tab.sort) {
    const o = tab.sort.find((x) => x.key === sortKey) || tab.sort[0];
    const dir = o.dir === "asc" ? 1 : -1;
    items = [...items].sort((a, b) => {
      const x = a[o.by], y = b[o.by];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true })) * dir;
    });
  }
  if (!items.length) return Empty(tab.empty?.icon || "lucide:search-x", T(t, tab.empty?.text || "noResults"), T(t, tab.empty?.hint || "noResultsHint"));

  const banner = tab.banner ? html`<${Banner} banner=${tab.banner} key="banner" />` : null;
  const paginate = !!tab.paginate && tab.source !== "fav";
  const grow = () => { if (vis < items.length) setVis((c) => Math.min(items.length, c + WINDOW_PAGE)); else if (paginate) { setVis((c) => c + WINDOW_PAGE); A.loadMore(); } };
  const shown = items.slice(0, vis);
  const cards = shown.map((it) => html`<${Card} item=${it} card=${tab.card} key=${A.favKey(it) || it[tab.card.title]} />`);
  const tail = html`<${InfiniteTail} count=${vis} total=${items.length} grow=${grow} paginate=${paginate} key="tail" />`;
  if (tab.sections) return Frag([banner, ...tab.sections.map((sec) => { const l = items.filter((it) => test(it, fav, sec.filter)); return l.length ? html`<${Section} sec=${sec} items=${l} card=${tab.card} tab=${tab} key=${sec.label} />` : null; })]);
  if (tab.card.layout === "grid") return Frag([banner, html`<div class="@container pt-2" key="grid"><div class="grid grid-cols-3 @min-[300px]:grid-cols-4 gap-x-3 gap-y-5">${cards}</div></div>`, tail]);
  if (tab.card.layout === "gallery") return Frag([banner, html`<div class="@container pt-2" key="gallery"><div class="grid grid-cols-3 @max-[220px]:grid-cols-2 @min-[600px]:grid-cols-4 gap-x-3 gap-y-5">${cards}</div></div>`, tail]);
  if (tab.card.layout === "table") return Frag([banner, html`<${Table} items=${items} tab=${tab} key="tbl" />`, html`<${InfiniteTail} count=${items.length} total=${items.length} grow=${() => paginate && A.loadMore()} paginate=${paginate} key="tail" />`]);
  return Frag([banner, ...cards, tail]);
}

function AccountSlot({ github, loc }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let live = true;
    import("./account.js").then((m) => { if (live) setComp(() => m.Account); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return Comp ? html`<${Comp} github=${github} loc=${loc} onChange=${() => A.load?.()} />` : null;
}

function WatchSlot({ source, params, loc }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let live = true;
    import("./watch.js").then((m) => { if (live) setComp(() => m.Bell); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return Comp ? html`<${Comp} source=${source} params=${params} app=${A.spec.id} loc=${loc} />` : null;
}

const AndroidMark = () => html`<svg width="26" height="16" viewBox="0 0 256 150" aria-hidden="true"><path fill="#34A853" d="M255.285 143.47c-.084-.524-.164-1.042-.251-1.56a128.119 128.119 0 0 0-12.794-38.288 128.778 128.778 0 0 0-23.45-31.86 129.166 129.166 0 0 0-22.713-18.005c.049-.08.09-.168.14-.25 2.582-4.461 5.172-8.917 7.755-13.38l7.576-13.068c1.818-3.126 3.632-6.26 5.438-9.386a11.776 11.776 0 0 0 .662-10.484 11.668 11.668 0 0 0-4.823-5.536 11.85 11.85 0 0 0-5.004-1.61 11.963 11.963 0 0 0-2.218.018 11.738 11.738 0 0 0-8.968 5.798c-1.814 3.127-3.628 6.26-5.438 9.386l-7.576 13.069c-2.583 4.462-5.173 8.918-7.755 13.38-.282.487-.567.973-.848 1.467-.392-.157-.78-.313-1.172-.462-14.24-5.43-29.688-8.4-45.836-8.4-.442 0-.879 0-1.324.006-14.357.143-28.152 2.64-41.022 7.12a119.434 119.434 0 0 0-4.42 1.642c-.262-.455-.532-.911-.79-1.367-2.583-4.462-5.173-8.918-7.755-13.38L65.123 15.25c-1.818-3.126-3.632-6.259-5.439-9.386A11.736 11.736 0 0 0 48.5.048 11.71 11.71 0 0 0 43.49 1.66a11.716 11.716 0 0 0-4.077 4.063c-.281.474-.532.967-.742 1.473a11.808 11.808 0 0 0-.365 8.188c.259.786.594 1.554 1.023 2.296a3973.32 3973.32 0 0 1 5.439 9.386c2.53 4.357 5.054 8.713 7.58 13.069 2.582 4.462 5.168 8.918 7.75 13.38.02.038.046.075.065.112A129.184 129.184 0 0 0 45.32 64.38a129.693 129.693 0 0 0-22.2 24.015 127.737 127.737 0 0 0-9.34 15.24 128.238 128.238 0 0 0-10.843 28.764 130.743 130.743 0 0 0-1.951 9.524c-.087.518-.167 1.042-.247 1.56A124.978 124.978 0 0 0 0 149.118h256c-.205-1.891-.449-3.77-.734-5.636l.019-.012Z"/><path fill="#202124" d="M194.59 113.712c5.122-3.41 5.867-11.3 1.661-17.62-4.203-6.323-11.763-8.682-16.883-5.273-5.122 3.41-5.868 11.3-1.662 17.621 4.203 6.322 11.764 8.682 16.883 5.272ZM78.518 108.462c4.206-6.321 3.46-14.21-1.662-17.62-5.123-3.41-12.68-1.05-16.886 5.27-4.203 6.323-3.458 14.212 1.662 17.622 5.122 3.41 12.683 1.05 16.886-5.272Z"/></svg>`;

const artOf = (k) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(`--ds-art-${k}`).trim(); return !!v && v !== "none"; }
  catch { return false; }
};
function ThemeWidget({ t, loc, theme, modeToggle, materials, current }) {
  const applied = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  const mode = (applied || theme) === "signal-light" ? "light" : "dark";
  const name = (m) => m?.name?.[loc] || m?.name?.en || m?.id || "";
  const chosen = materials.find((m) => m.id === current);
  return html`<div id="p-material" data-materials class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 gap-3">
    <div class="flex items-center gap-3">
      ${Icon("lucide:palette", "text-xl")}
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${sys("material", loc)}</div>
        <div class="text-xs text-muted truncate">${[chosen ? name(chosen) : null, modeToggle ? sys(mode === "dark" ? "modeNight" : "modeDay", loc) : null].filter(Boolean).join(" · ")}</div>
      </div>
      ${modeToggle ? html`<div id="p-theme" role="radiogroup" aria-label=${T(t, "profTheme")} class="flex gap-1 p-1 rounded-full sf-inset shrink-0">
        ${[["light", "day", "lucide:sun"], ["dark", "night", "lucide:moon"]].map(([m, k, glyph]) => {
          const on = mode === m;
          return html`<button key=${k} type="button" role="radio" aria-checked=${on} aria-label=${sys(k === "day" ? "modeDay" : "modeNight", loc)} data-mode=${k}
            class=${`size-9 rounded-full grid place-items-center transition ${on ? "sf-lift2 bg-base-100" : "opacity-45"}`}
            onClick=${() => A.S.theme.set(m === "dark" ? "signal" : "signal-light")}>
            ${artOf(k) ? html`<span data-theme-art=${k} aria-hidden="true"></span>` : Icon(glyph, "text-lg")}
          </button>`;
        })}
      </div>` : null}
    </div>
    ${materials.length > 1 ? html`<div class="flex gap-1 overflow-x-auto -mx-2 px-2 py-1 snap-x">
      ${materials.map((m) => {
        const on = m.id === current, sw = m.swatch?.[mode] || m.swatch?.dark;
        return html`<button key=${m.id} type="button" data-material-id=${m.id} aria-pressed=${on} aria-label=${name(m)}
          class="flex flex-col items-center gap-1 shrink-0 w-14 snap-start" onClick=${() => A.S.material.set(m.id)}>
          ${m.thumb
            ? html`<img data-thumb src=${`/_rt/${m.thumb}`} alt="" loading="lazy" decoding="async" class="size-12 rounded-full object-cover bg-black" />`
            : html`<span data-thumb class="size-12 rounded-full block" style=${sw ? `background:radial-gradient(circle at 34% 32%, ${sw[1]} 0 24%, ${sw[0]} 27%)` : ""}></span>`}
          <span class=${`text-[0.62rem] leading-tight truncate max-w-full ${on ? "" : "text-muted"}`}>${name(m)}</span>
        </button>`;
      })}
    </div>` : null}
  </div></div>`;
}

function Profile({ tab }) {
  const t = useStore(A.S.t), theme = useStore(A.S.theme), loc = useStore(A.S.locale), fav = useStore(A.S.fav);
  const materials = useStore(A.S.materials), materialId = useStore(A.S.material);
  const material = materials.find((m) => m.id === materialId) || materials[0];
  const p = A.spec.profile || {};
  const account = p.account || (A.spec.tabs.some((x) => (x.needs || []).includes("auth")) ? "any" : null);
  const [adminHref, setAdminHref] = useState(null);
  useEffect(() => {
    if (!account) return;
    let live = true;
    import("./auth.js").then((m) => m.adminPanel()).then((u) => { if (live) setAdminHref(u || null); }).catch(() => {});
    return () => { live = false; };
  }, [account]);
  const savedTab = A.spec.tabs.find((x) => x.source === "fav");
  const install = !!p.install && !isStandalone();
  const shareApp = async () => {
    const url = location.href.split("#")[0];
    const title = T(t, "title");
    if (shell.has("share.send")) {
      try { await shell.call("share.send", { title, url }); return; }
      catch { }
    }
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); A.toast(sys("shareCopied", loc)); } catch { }
  };
  return html`<div class="flex flex-col gap-3 pt-1">
    ${account ? html`<${AccountSlot} github=${account === "github" ? "primary" : "quiet"} loc=${loc} />` : null}
    <div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-5 items-center text-center gap-1">${Icon(p.icon || "lucide:box", "text-4xl text-primary")}<div class="font-bold text-lg mt-1">${T(t, "title")}</div><div class="text-sm text-muted">${T(t, "profTagline")}</div></div></div>
    <div class="grid grid-cols-2 gap-3">
      ${install ? html`<button id="p-install" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.installOpen.set(true)}><div class="card-body p-4 gap-3 items-start"><div class="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">${Icon(p.icon || "lucide:box", "text-2xl")}</div><span class="font-medium text-sm leading-tight text-left">${T(t, "install")}</span></div></button>` : null}
      <button id="p-apk" class=${`card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition ${install ? "" : "col-span-2"}`} onClick=${() => A.S.screen.set("apk")}><div class="card-body p-4 gap-3 items-start"><div class="size-11 rounded-xl grid place-items-center" style="background:rgba(52,168,83,.14)"><${AndroidMark} /></div><span class="font-medium text-sm leading-tight text-left">${sys("apkRow", loc)}</span></div></button>
    </div>
    <button id="p-share" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${shareApp}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:share-2", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("share", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></button>
    ${!inTelegram() ? html`<a id="p-tg" href=${`https://t.me/dreamstudio_x_bot?startapp=${A.spec.id}`} target="_blank" rel="noopener" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:send", "text-xl text-primary")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("openTelegram", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    ${inTelegram() ? html`<div id="p-support" class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 gap-3">
      <div class="flex items-center gap-3">
        <div class="size-11 rounded-xl grid place-items-center bg-primary/10 text-primary shrink-0">${Icon("lucide:heart", "text-2xl")}</div>
        <div class="flex-1 min-w-0"><div class="font-semibold leading-tight truncate">${sys("support", loc)}</div><div class="text-xs text-muted truncate">${sys("supportSub", loc)}</div></div>
      </div>
      <div class="grid grid-cols-4 gap-2">${[1, 25, 100, 500].map((n) => html`<button key=${n} type="button" data-stars=${n} aria-label=${`${n} ★`}
        class="btn btn-sm rounded-full font-semibold tabular-nums px-0 gap-0.5 active:scale-95 transition"
        onClick=${async () => { const s = await payStars(n); if (s === "paid") { celebrate(); A.toast(sys("supportThanks", loc)); } else if (s === "error" || s === "failed") A.toast(sys("supportFailed", loc)); }}>
        ${Icon("lucide:star", "text-[0.9em] opacity-80")}${n}</button>`)}</div>
    </div></div>` : null}
    ${savedTab ? html`<button class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.tab.set(savedTab.id)}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:bookmark", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${T(t, savedTab.titleKey || savedTab.label)}</span><span class="badge badge-primary">${Object.keys(fav).length}</span></div></button>` : null}
    ${p.theme || materials.length > 1 ? html`<${ThemeWidget} t=${t} loc=${loc} theme=${theme} modeToggle=${!!p.theme} materials=${materials} current=${material?.id} />` : null}
    ${p.lang ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:languages", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium">${T(t, "profLang")}</span><div class="join" id="p-lang">${[["uk", "UA"], ["en", "EN"]].map(([c, l]) => html`<button class=${`btn btn-sm join-item ${loc === c ? "btn-active btn-primary" : ""}`} data-loc=${c} key=${c} onClick=${() => A.S.locale.set(c)}>${l}</button>`)}</div></div></div>` : null}
    ${adminHref ? html`<a id="p-admin" href=${adminHref} class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:shield", "text-xl text-primary")}<span class="flex-1 min-w-0 truncate font-medium text-left">${sys("adminRow", loc)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    ${p.permissions?.length ? html`<button id="p-perms" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${() => A.S.screen.set("perms")}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:shield-check", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium text-left">${permLabels(loc).row}</span>${Icon("lucide:chevron-right", "opacity-60")}</div></button>` : null}
    ${p.source ? html`<a href=${p.source.url} target="_blank" rel="noopener" class="card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon(p.source.icon || "lucide:database", "text-xl")}<span class="flex-1 min-w-0 truncate font-medium">${T(t, p.source.label)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
    <div data-version class="text-center text-[11px] text-base-content/70 pt-1 tabular-nums">v${appVersion(A.spec)} · core ${CORE}${BUILD && BUILD !== "dev" ? ` · ${BUILD}` : ""}</div>
  </div>`;
}

const watchOf = (tabId) => A.spec.tabs.find((x) => x.id === tabId)?.watch || null;

function WatchScreen() {
  const loc = useStore(A.S.locale), t = useStore(A.S.t), cur = useStore(A.S.tab);
  const w = watchOf(cur) || {};
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="watch-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("watchRow", loc)}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <p class="text-sm text-muted px-1">${T(t, "profTagline")}</p>
      ${w.source ? html`<${WatchSlot} source=${w.source} params=${w.params || null} loc=${loc} />` : null}
    </div>
  </div>`;
}

function PermissionsScreen() {
  const loc = useStore(A.S.locale), L = permLabels(loc);
  const keys = (A.spec.profile?.permissions || []).filter((k) => PERMISSIONS[k]);
  const [states, setStates] = useState({});
  const refresh = async () => { const s = {}; for (const k of keys) s[k] = await permState(k); setStates(s); };
  useEffect(() => {
    refresh();
    const subs = [];
    for (const k of keys) { try { navigator.permissions.query({ name: k }).then((ps) => { ps.onchange = refresh; subs.push(ps); }).catch(() => {}); } catch { } }
    return () => subs.forEach((ps) => { ps.onchange = null; });
  }, []);
  const toggle = async (k, st) => {
    if (st === "granted") { A.toast(L.revokeHint); return; }
    if (st === "needsApp") { A.toast(L.needsAppHint); return; }
    if (st === "staleApp") { A.toast(L.staleAppHint); return; }
    const r = await permRequest(k);
    setStates((s) => ({ ...s, [k]: { state: r, via: "browser" } }));
  };
  const grouped = GROUPS.map((g) => [g, keys.filter((k) => PERMISSIONS[k].group === g)]).filter(([, ks]) => ks.length);
  const GROUP_LABEL = { sense: L.gSense, media: L.gMedia, background: L.gBackground, radios: L.gRadios, system: L.gSystem };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="perms-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${L.back} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${L.title}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-2 max-w-xl mx-auto">
      <p class="text-sm text-muted px-1 mb-1">${L.intro}</p>
      ${grouped.map(([g, ks]) => html`<${Fragment} key=${g}>
        <div class="px-2 pt-2 pb-0.5 text-xs font-semibold tracking-wide text-base-content/55">${GROUP_LABEL[g]}</div>
        ${ks.map((k) => {
          const st = states[k]?.state || "unknown", via = states[k]?.via || "";
          const on = st === "granted", off = st === "unsupported";
          const android = via === "shell" ? permAndroid(k) : [];
          return html`<${Fragment} key=${k}>
            <div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 flex-row items-center gap-3">
              ${Icon(PERMISSIONS[k].icon, "text-xl")}
              <div class="flex-1 min-w-0">
                <div class="truncate font-medium">${L[k]}</div>
                ${android.length ? html`<div class="font-mono text-[11px] text-base-content/45 truncate">${android.join(" · ")}</div>` : null}
              </div>
              <!-- shrink-0 on every one of them: the name block is flex-1, and without it the control is
                   squeezed to a sliver against the card edge (which is exactly how it shipped for one shot). -->
              ${off ? html`<span class="text-xs text-base-content/50 shrink-0">${L.unsupported}</span>`
                : st === "denied" ? html`<span class="badge badge-error badge-sm shrink-0">${L.denied}</span>`
                : st === "needsApp" ? html`<span data-needs-app class="badge badge-ghost badge-sm shrink-0">${L.needsApp}</span>`
                : st === "staleApp" ? html`<span class="badge badge-warning badge-sm shrink-0">${L.staleApp}</span>`
                : html`<input id=${"perm-" + k} type="checkbox" class="toggle toggle-primary shrink-0" checked=${on} aria-label=${L[k]} onChange=${() => toggle(k, st)} />`}
            </div></div>
            ${st === "denied" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:info", "mt-0.5 shrink-0")}${L.deniedHint}</div>` : null}
            ${st === "needsApp" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:smartphone", "mt-0.5 shrink-0")}${L.needsAppHint}</div>` : null}
            ${st === "staleApp" ? html`<div class="text-xs text-muted px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:download", "mt-0.5 shrink-0")}${L.staleAppHint}</div>` : null}
          </${Fragment}>`;
        })}
      </${Fragment}>`)}
    </div>
  </div>`;
}

function SignInScreen() {
  const loc = useStore(A.S.locale);
  const [mods, setMods] = useState(null);
  const pair = (() => { try { return new URLSearchParams(location.search).get("pair") || ""; } catch { return ""; } })();
  const [paired, setPaired] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([import("./signin.js"), import("./auth.js")]).then(([si, au]) => {
      if (!live) return;
      setMods({ SignIn: si.SignIn, session: au.session, pairComplete: au.pairComplete });
      if (!au.session.get()) au.restore().catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!mods) return;
    const onSession = async (s) => {
      if (!s) return;
      if (pair) { const ok = await mods.pairComplete(pair, s.sid).catch(() => false); setPaired(ok ? "ok" : "fail"); return; }
      A.S.screen.set(null);
    };
    if (mods.session.get()) onSession(mods.session.get());
    return mods.session.listen(onSession);
  }, [mods]);
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="signin-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("signInTitle", loc)}</div>
    </header>
    <div data-signin class="px-4 pt-6 pb-8 flex flex-col items-center text-center gap-4 max-w-xl mx-auto">
      ${paired === "ok"
        ? html`${Icon("lucide:check-circle-2", "text-4xl text-success")}<p data-paired class="text-base font-semibold max-w-xs">${sys("pairDone", loc)}</p>`
        : html`${Icon("lucide:lock-keyhole", "text-4xl text-primary")}
          <p class="text-sm text-base-content/75 max-w-xs">${sys(pair ? "pairBody" : "signInBody", loc)}</p>
          ${paired === "fail" ? html`<p role="alert" class="text-error text-sm">${sys("pairFail", loc)}</p>` : null}
          ${mods ? html`<${mods.SignIn} locale=${loc} className="pt-1" />` : null}`}
    </div>
  </div>`;
}

function ApkScreen() {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const name = T(t, "title");
  const url = location.href.split("#")[0];
  const accent = () => (getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || "#F2B84B");
  const [icons, setIcons] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const resolveIcons = async () => {
    const real = await fetchAppIcons();
    if (real) return real;
    const tile = await letterTilePng(name, accent());
    return { icon: tile, ...(await adaptiveFromTile(tile, accent())) };
  };
  useEffect(() => {
    let live = true;
    (async () => { try { const i = await resolveIcons(); if (live) setIcons(i); } catch { } })();
    return () => { live = false; };
  }, []);

  const generate = async () => {
    if (busy) return;
    setBusy(true); setErr(false); setDone(false);
    try {
      let i = icons;
      if (!i) { try { i = await resolveIcons(); } catch { i = {}; } }
      const power = apkPower(A.spec);
      if (!gate) { const blob = await buildApk({ url, name, iconB64: i.icon, fgB64: i.fg, bg: i.bg, power }); downloadBlob(blob, apkFilename(name)); }
      setDone(true); A.toast(sys("apkDone", loc));
    } catch (e) {
      setErr(String(e?.message || e) || true);
    } finally { setBusy(false); }
  };

  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar sticky top-0 z-10 px-2 gap-1" style="padding-top:var(--ms-safe-top)">
      <button id="apk-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${sys("back", loc)} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${sys("apkTitle", loc)}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">
      <div data-apk class="flex items-center gap-3 rounded-2xl sf-raised sf-e2 p-3">
        <div class="size-14 rounded-full overflow-hidden bg-base-200 shrink-0 relative grid place-items-center ring-1 ring-base-content/10" style=${icons?.bg ? `background:${icons.bg}` : ""}>
          ${icons?.fg
            ? html`<img src=${`data:image/png;base64,${icons.fg}`} style="position:absolute;left:-25%;top:-25%;width:150%;height:150%;max-width:none" alt="" />`
            : icons?.icon ? html`<img src=${`data:image/png;base64,${icons.icon}`} class="size-full object-cover" alt="" />`
            : Icon(A.spec.profile?.icon || "lucide:box", "text-2xl text-base-content/40")}
        </div>
        <div class="min-w-0 flex-1"><div class="font-semibold truncate">${name}</div><div class="font-mono text-xs text-base-content/55 truncate">${url}</div></div>
      </div>
      ${done ? html`<div data-apk-note class="flex items-start gap-2 rounded-xl bg-base-200 px-3 py-2.5 text-xs leading-snug text-base-content/70">${Icon("lucide:shield-alert", "text-sm mt-px shrink-0 text-primary")}<span>${sys("apkNote", loc)}</span></div>` : null}
      <button id="apk-go" disabled=${busy} onClick=${generate} class="btn btn-primary rounded-2xl w-full gap-2">
        ${busy ? html`<span class="animate-pulse">${sys("apkGenerating", loc)}</span>` : html`${Icon("lucide:download")}<span>${done ? sys("apkDone", loc) : sys("apkGenerate", loc)}</span>`}
      </button>
      ${err ? html`<div class="text-center text-xs text-error">${/apk 429/.test(String(err)) ? sys("apkRate", loc) : sys("apkErr", loc)}${typeof err === "string" && !/apk 429/.test(err) ? html` · ${err}` : null}</div>` : null}
    </div>
  </div>`;
}

function DetailView() {
  const t = useStore(A.S.t), it = useStore(A.S.detail), fav = useStore(A.S.fav), loc = useStore(A.S.locale);
  useStore(trTick); useStore(metaTick);
  if (!it) return null;
  const d = A.spec.detail, on = !!fav[A.favKey(it)], close = () => A.S.detail.set(null);
  const img = d.image && it[d.image] ? html`<figure class="aspect-video rounded-[var(--ms-r)] overflow-hidden sf-inset"><img src=${it[d.image]} alt="" class=${`w-full h-full ${d.imageFit === "cover" ? "object-cover" : "object-contain"}`}/></figure>` : null;
  const bodyTxt = d.body ? field(it, d.body, loc) : null;
  const bodyNode = bodyTxt ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4"><p class="text-[0.95rem] leading-relaxed whitespace-pre-line break-words">${fieldNode(it, d.body, loc)}</p></div></div>` : null;
  const CustomBody = d.view && VIEWS[d.view];
  const customNode = CustomBody
    ? html`<${CustomBody} item=${it} t=${t} loc=${loc} S=${A.S} toast=${A.toast} undo=${A.undo} confirm=${A.confirm} />` : null;
  const rows = (d.rows || []).map((r) => {
    const v = r.format === "when" ? whenLabel(t, it[r.field], loc, true, r.precision ? it[r.precision] : undefined) : r.format === "ago" ? ago(t, it[r.field], loc) : r.format === "since" ? sinceLabel(t, it[r.field], loc) : field(it, r.field, loc);
    return (v == null || v === "") ? null : html`<div class="flex items-start gap-3 py-3 border-b border-base-300/60 last:border-0" key=${r.field}>${r.icon ? Icon(r.icon, "text-lg text-primary/80 mt-0.5 shrink-0") : null}<div class="flex-1 min-w-0"><div class="text-xs text-muted">${T(t, r.label)}</div><div class="font-medium break-words">${v}</div></div></div>`; });
  const actions = (d.actions || []).map((a) => {
    if (a.play) {
      const url = safeHref(it[a.play]);
      if (!url) return null;
      const open = () => A.S.player.set({
        url, title: field(it, d.title, loc) ?? "",
        poster: d.image ? it[d.image] : "",
        key: String(it.id ?? url),
      });
      return html`<button id=${`detail-play-${a.play}`} data-play class="btn btn-primary rounded-2xl w-full gap-2" key=${a.play} onClick=${open}>${a.icon ? Icon(a.icon) : Icon("lucide:play")}${T(t, a.label)}</button>`;
    }
    const href = safeHref(it[a.href]);
    return href ? html`<a href=${href} target="_blank" rel="noopener" class="btn btn-primary rounded-2xl w-full gap-2" key=${a.href}>${a.icon ? Icon(a.icon) : null}${T(t, a.label)} ${Icon("lucide:arrow-up-right")}</a>` : null;
  });
  const star = A.spec.fav ? html`<button id="detail-fav" aria-label=${on ? T(t, "unfavAria") : T(t, "favAria")} onClick=${() => A.toggleFav(it)} class=${`btn btn-ghost btn-sm btn-circle ${on ? "text-primary" : "opacity-60"}`}>${Icon(`lucide:bookmark${on ? "-check" : ""}`, "text-xl")}</button>` : null;
  const staged = !!(d.stage && CustomBody);
  return html`<div role="dialog" aria-modal="true" data-detail class=${`fixed inset-0 z-40 bg-base-200 overflow-y-auto ms-detail-in ${staged ? "isolate" : ""}`} style="padding-bottom:env(safe-area-inset-bottom)">
    <header class=${`navbar sticky top-0 z-10 px-2 gap-1 ${staged ? "bg-base-100/70 backdrop-blur-xl" : "bg-base-100 sf-e2"}`} style="padding-top:var(--ms-safe-top)"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${field(it, d.title, loc) ?? ""}</div>${star}</header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">${img}${staged ? null : html`<div><h1 class="text-2xl font-bold leading-tight break-words">${field(it, d.title, loc) ?? ""}</h1>${d.subtitle && it[d.subtitle] ? html`<div class="text-base-content/70 mt-0.5">${field(it, d.subtitle, loc)}</div>` : null}</div>`}${bodyNode}${customNode}${rows.some(Boolean) ? html`<div class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 py-1">${rows}</div></div>` : null}${actions.some(Boolean) ? html`<div class="flex flex-col gap-2">${actions}</div>` : null}</div>
  </div>`;
}

function FilterChips() {
  const t = useStore(A.S.t), filters = useStore(A.S.filters);
  const f = A.spec.filters; if (!f) return null;
  const defaults = f.defaults || {}, refetch = f.refetch;
  const chips = [];
  for (const c of (f.controls || [])) {
    const v = filters[c.key], def = defaults[c.key] ?? (c.type === "toggle" ? false : "");
    if (c.type === "toggle") { if (v) chips.push({ key: c.key, label: T(t, c.label), reset: false }); continue; }
    if (c.type === "range") { const r = v || {}; if ((r.from ?? "") !== "" || (r.to ?? "") !== "") chips.push({ key: c.key, label: `${T(t, c.label)}: ${r.from ?? "…"}–${r.to ?? "…"}`, reset: {} }); continue; }
    if (c.type === "multi") { const sel = Array.isArray(v) ? v : []; const all = (c.options || []).length; if (sel.length < all) chips.push({ key: c.key, label: `${T(t, c.label)}: ${sel.length}/${all}`, reset: (c.options || []).map((o) => o[0]) }); continue; }
    if (v != null && v !== def) { const opt = (c.options || []).find((o) => o[0] === v); chips.push({ key: c.key, label: opt ? T(t, opt[1]) : String(v), reset: def }); }
  }
  if (!chips.length) return null;
  return html`<div class="flex flex-wrap gap-1.5 px-4 mt-2">${chips.map((ch) => html`<button class="badge badge-primary badge-outline gap-1 cursor-pointer" key=${ch.key} onClick=${() => { A.S.filters.setKey(ch.key, ch.reset); if (refetch) A.load(); }}>${ch.label} ${Icon("lucide:x", "text-xs")}</button>`)}</div>`;
}

function FilterSheet() {
  const t = useStore(A.S.t), open = useStore(A.S.sheet), filters = useStore(A.S.filters), data = useStore(A.S.data);
  const f = A.spec.filters; if (!f) return null;
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const { boxRef, grip } = useSheetDrag(() => A.S.sheet.set(false));
  return html`<dialog id="sheet" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.sheet.set(false)}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8 flex flex-col gap-3`}>${grip}
    <div class="flex items-center justify-between"><h3 class="font-bold text-lg">${T(t, "filterTitle")}</h3><button aria-label=${T(t, "close")} class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.sheet.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    ${(f.controls || []).map((c) => {
      if (c.type === "select") {
        const opts = c.options ? c.options.map(([v, l]) => ({ v, l: T(t, l) })) : (data.meta[c.optionsFrom] || []);
        return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><select id=${"f-" + c.key} class="select select-bordered rounded-2xl w-full" value=${filters[c.key] || ""} onChange=${(e) => A.S.filters.setKey(c.key, e.target.value)}>${opts.map((o) => html`<option value=${o.v} key=${o.v}>${o.l}</option>`)}</select></label>`;
      }
      if (c.type === "toggle") return html`<label class="flex items-center justify-between" key=${c.key}><span class="flex items-center gap-2">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><input id=${"f-" + c.key} type="checkbox" class="toggle toggle-primary" checked=${!!filters[c.key]} onChange=${(e) => A.S.filters.setKey(c.key, e.target.checked)} /></label>`;
      if (c.type === "range") { const r = filters[c.key] || {}; const set = (k, v) => A.S.filters.setKey(c.key, { ...(filters[c.key] || {}), [k]: v });
        return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}${c.unit ? html`<span class="text-base-content/50">(${c.unit})</span>` : null}</span><div class="flex items-center gap-2">
          <input id=${"f-" + c.key + "-from"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeFrom")} value=${r.from ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("from", e.target.value)} />
          <span class="text-base-content/40 shrink-0">–</span>
          <input id=${"f-" + c.key + "-to"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeTo")} value=${r.to ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("to", e.target.value)} />
        </div></label>`; }
      if (c.type === "multi") { const sel = Array.isArray(filters[c.key]) ? filters[c.key] : []; const toggle = (v) => { const s = new Set(sel); s.has(v) ? s.delete(v) : s.add(v); A.S.filters.setKey(c.key, [...s]); };
        return html`<${Fragment} key=${c.key}><span class="flex items-center gap-2 text-sm">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><div class="flex flex-wrap gap-1.5" id=${"f-" + c.key}>${c.options.map(([v, l]) => html`<button class=${`btn btn-sm rounded-full gap-1 ${sel.includes(v) ? "btn-primary" : "btn-ghost border border-base-300"}`} data-val=${v} aria-pressed=${sel.includes(v)} key=${v} onClick=${() => toggle(v)}>${T(t, l)}</button>`)}</div></${Fragment}>`; }
      return html`<${Fragment} key=${c.key}><span class="flex items-center gap-2 text-sm">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><div class="join w-full" id=${"f-" + c.key}>${c.options.map(([v, l]) => html`<button class=${`btn btn-sm join-item flex-1 ${(filters[c.key] || "") === v ? "btn-active" : ""}`} data-val=${v} key=${v} onClick=${() => A.S.filters.setKey(c.key, v)}>${T(t, l)}</button>`)}</div></${Fragment}>`;
    })}
    <button id="f-apply" class="btn btn-primary rounded-2xl mt-3" onClick=${() => { A.S.sheet.set(false); A.S.tab.set(A.spec.tabs[0].id); if (f.refetch) A.load(); }}>${T(t, "apply")}</button>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

const PLAYPOS = collection("playPos");
function PlayerHost() {
  const p = useStore(A.S.player), loc = useStore(A.S.locale);
  const [startAt, setStartAt] = useState(null);
  const [Video, setVideo] = useState(null);
  useEffect(() => {
    if (!p) { setStartAt(null); return; }
    let ok = true;
    PLAYPOS.get(p.key).then((v) => { if (ok) setStartAt(Number(v?.t) || 0); }).catch(() => { if (ok) setStartAt(0); });
    return () => { ok = false; };
  }, [p?.key]);
  const canPlay = (A.spec.detail?.actions || []).some((a) => a.play);
  useEffect(() => {
    if (!canPlay && !p) return;
    if (Video) return;
    let ok = true;
    import("./video.js").then((m) => { if (ok) setVideo(() => m.Player); }).catch(() => { });
    return () => { ok = false; };
  }, [canPlay, !!p]);
  if (!p || startAt == null || !Video) return null;
  return html`<${Video} url=${p.url} title=${p.title} poster=${p.poster} locale=${loc} startAt=${startAt}
    onTime=${(t, d) => PLAYPOS.put(p.key, { t, d }).catch(() => { })}
    onClose=${() => A.S.player.set(null)} />`;
}

function InstallModal() {
  const t = useStore(A.S.t), open = useStore(A.S.installOpen), ev = useStore(A.S.installEvent);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const go = async () => { if (ev) { ev.prompt(); await ev.userChoice; A.S.installEvent.set(null); } A.S.installOpen.set(false); };
  const { boxRef, grip } = useSheetDrag(() => A.S.installOpen.set(false));
  return html`<dialog id="install" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.installOpen.set(false)}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8`}>${grip}
    <div class="flex items-center justify-between mb-3"><h3 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:download", "text-primary")} ${T(t, "installTitle")}</h3><button aria-label=${T(t, "close")} class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.installOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    <div class="text-sm text-base-content/70 mb-4">${T(t, "installDesc")}</div>
    ${ev ? html`<button id="install-go" class="btn btn-primary rounded-2xl w-full gap-2" onClick=${go}>${Icon("lucide:download")} ${T(t, "installBtn")}</button>` : html`<div class="flex items-start gap-2 bg-base-200 rounded-2xl px-3 py-3 text-sm">${Icon(isIOS() ? "lucide:share" : "lucide:menu", "text-lg mt-0.5")}<span>${isIOS() ? T(t, "installIosHint") : T(t, "installGenericHint")}</span></div>`}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

const statusOf = (t, tab, data, q, fav) => tab.source === "fav" ? T(t, "savedCount", { n: Object.keys(fav).length })
  : data.loading ? T(t, "statusLoading") : data.error ? T(t, "statusError")
  : (tab.browse && !q) ? ""
  : T(t, tab.statusKey || "status", { ...(data.meta || {}) });
function SearchField({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), q = useStore(A.S.query), fav = useStore(A.S.fav);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const onInput = (e) => { A.S.query.set(e.target.value); if (tab.searchFetch) debouncedLoad(); };
  return html`<label data-search class="flex-1 min-w-0 flex items-center gap-2 h-9">${Icon("lucide:search", "text-lg opacity-50 shrink-0")}<input id="filter" ref=${ref} type="search" class="grow min-w-0 bg-transparent text-base border-0 outline-none appearance-none focus:outline-none focus:ring-0 shadow-none placeholder:text-base-content/45 [&::-webkit-search-cancel-button]:hidden" placeholder=${T(t, tab.searchKey || "search")} autocomplete="off" value=${q} onInput=${onInput} /><span id="status" class="font-mono text-xs text-muted shrink-0 max-w-[38%] truncate">${statusOf(t, tab, data, q, fav)}</span></label>`;
}

function SegmentBar({ tab }) {
  const t = useStore(A.S.t), cur = useStore(A.S.seg);
  const active = tab.segments.some((s) => s.key === cur) ? cur : tab.segments[0].key;
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="join w-full" id="segments" role="tablist" aria-label=${T(t, "segAria")}>
    ${tab.segments.map((s) => html`<button class=${`btn btn-sm join-item flex-1 gap-1.5 ${active === s.key ? "btn-active btn-primary" : ""}`} data-seg=${s.key} role="tab" aria-selected=${active === s.key} key=${s.key} onClick=${() => A.S.seg.set(s.key)}>${s.icon ? Icon(s.icon) : null}${T(t, s.label)}</button>`)}
  </div></div>`;
}

function SortBar({ tab }) {
  const t = useStore(A.S.t), cur = useStore(A.S.sort);
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="join w-full" id="sort" role="group" aria-label=${T(t, "sortAria")}>
    ${tab.sort.map((o) => html`<button class=${`btn btn-sm join-item flex-1 ${cur === o.key ? "btn-active btn-primary" : ""}`} data-sort=${o.key} key=${o.key} aria-pressed=${cur === o.key} onClick=${() => A.S.sort.set(o.key)}>${T(t, o.label)}</button>`)}
  </div></div>`;
}

function TogglesBar({ tab }) {
  const t = useStore(A.S.t), tog = useStore(A.S.toggles);
  const on = (k) => tog[k] !== false;
  return html`<div class="px-4 pt-2 max-w-xl mx-auto w-full"><div class="flex gap-1.5 overflow-x-auto" id="toggles" role="group" aria-label=${T(t, "scanAria")}>
    ${tab.toggles.map((o) => html`<button class=${`btn btn-xs gap-1 shrink-0 rounded-full ${on(o.key) ? "btn-primary" : "btn-ghost sf-inset text-base-content/70"}`} data-toggle=${o.key} aria-pressed=${on(o.key)} key=${o.key} onClick=${() => A.S.toggles.set({ ...A.S.toggles.get(), [o.key]: !on(o.key) })}>${o.icon ? Icon(o.icon, "text-sm") : null}${T(t, o.label)}</button>`)}
  </div></div>`;
}

const QR_LBL = {
  en: { open: "Open on phone", title: "Open on your phone", stay: "Stay on desktop" },
  uk: { open: "Відкрити на телефоні", title: "Відкрити на телефоні", stay: "Залишитись на десктопі" },
};

function usePublishedChrome(kind) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const s = document.documentElement.style;
      const h = el.offsetHeight;
      if (kind === "header") { if (h) s.setProperty("--hdr-h", `${h}px`); return; }
      const rail = (getComputedStyle(el).gridAutoFlow || "").includes("row");
      s.setProperty("--dock-h", rail ? "0px" : `${h + 24}px`);
      s.setProperty("--dock-w", rail ? `${el.offsetWidth}px` : "0px");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function useBattery() {
  const [b, setB] = useState(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search), f = q.get("battery");
      if (f != null) { setB({ level: Math.max(0, Math.min(1, Number(f) / 100 || 0)), charging: q.get("charging") === "1", forced: true }); return; }
    } catch { }
    if ((!matchMedia("(display-mode: fullscreen)").matches && !shell.present) || typeof navigator === "undefined" || !navigator.getBattery) return;
    let bat, dead = false;
    const read = () => { if (!dead && bat) setB({ level: bat.level, charging: bat.charging }); };
    navigator.getBattery().then((m) => { bat = m; read(); m.addEventListener("levelchange", read); m.addEventListener("chargingchange", read); }).catch(() => {});
    return () => { dead = true; bat?.removeEventListener("levelchange", read); bat?.removeEventListener("chargingchange", read); };
  }, []);
  return b;
}

/**
 * The runtime's own battery indicator — a small glyph + percentage, shown only when the page runs in
 * fullscreen display-mode (the farm's WebAPKs hide the system status bar, so the runtime carries the one
 * reading that bar provided). `force` renders it regardless of display mode — for a surface that hides the
 * chrome itself, like a screensaver's show. Renders nothing when the Battery API is silent.
 * @param props `force` show even outside fullscreen display-mode
 * @returns the `[data-battery]` element, or null
 */
export function Battery({ force = false } = {}) {
  const b = useBattery(), loc = useStore(A.S.locale);
  if (!b || (!force && !b.forced && !matchMedia("(display-mode: fullscreen)").matches && !shell.present)) return null;
  const pct = Math.round(b.level * 100), low = !b.charging && pct <= 15;
  return html`<span data-battery data-charging=${b.charging ? "1" : null} role="status" aria-label=${`${sys("battery", loc)} ${pct}%`}
    class=${`flex items-center gap-1.5 shrink-0 font-mono text-[0.7rem] tabular-nums ${low ? "text-error" : "text-base-content/80"}`}>
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" class="shrink-0">
      <rect x="1" y="1.5" width="19" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5" />
      <rect x="21.3" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5" />
      <rect x="3" y="3.5" width=${Math.max(0.8, 15 * b.level)} height="5" rx="1.2" fill=${b.charging ? "var(--app-accent)" : "currentColor"} />
    </svg>
    <span>${pct}</span>
  </span>`;
}

function AppBar() {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const qL = QR_LBL[loc] || QR_LBL.en;
  const hdrRef = usePublishedChrome("header");
  const cur = useStore(A.S.tab), searchOpen = useStore(A.S.searchOpen);
  const tab = A.spec.tabs.find((x) => x.id === cur) || A.spec.tabs[0];
  const searchable = tab?.type === "list" && !!tab.search;
  useEffect(() => { if (A.S.searchOpen.get()) A.S.searchOpen.set(false); }, [cur]);
  const fold = () => { A.S.query.set(""); if (tab?.searchFetch) debouncedLoad(); A.S.searchOpen.set(false); };
  if (searchable && searchOpen) {
    return html`<header ref=${hdrRef} class="navbar sticky top-0 z-30 px-4 gap-1" style="padding-top:var(--ms-safe-top)"><${SearchField} tab=${tab} /><button id="search-close" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${fold}>${Icon("lucide:x", "text-xl")}</button></header>`;
  }
  return html`<header ref=${hdrRef} class="navbar sticky top-0 z-30 px-4 gap-1" style="padding-top:var(--ms-safe-top)"><div class="flex-1 min-w-0"><span data-title class="block truncate">${T(t, "title")}</span></div><${Battery} />${watchOf(cur)?.source ? html`<button id="watch-btn" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${sys("watchRow", loc)} onClick=${() => A.S.screen.set("watch")}>${Icon("lucide:bell", "text-xl")}</button>` : null}${searchable ? html`<input id="filter" type="search" class="hidden" tabindex="-1" aria-hidden="true" onInput=${(e) => { A.S.query.set(e.target.value); if (tab.searchFetch) debouncedLoad(); }} /><button id="search-btn" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, tab.searchKey || "search")} onClick=${() => A.S.searchOpen.set(true)}>${Icon("lucide:search", "text-xl")}</button>` : null}<button id="qr-open" class="btn btn-ghost btn-sm btn-circle shrink-0 hidden lg:inline-flex" aria-label=${qL.open} onClick=${() => A.S.qrOpen.set(true)}>${Icon("lucide:smartphone", "text-xl")}</button>${A.spec.filters ? html`<button id="filter-btn" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "ariaFilter")} onClick=${() => A.S.sheet.set(true)}>${Icon("lucide:sliders-horizontal", "text-xl")}</button>` : null}${A.canRefresh ? html`<button id="refresh" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "refresh")} onClick=${() => A.load()}>${Icon("lucide:rotate-cw", "text-xl")}</button>` : null}</header>`;
}

function QrModal() {
  const open = useStore(A.S.qrOpen), loc = useStore(A.S.locale);
  const L = QR_LBL[loc] || QR_LBL.en;
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const [uri, setUri] = useState("");
  const url = typeof location !== "undefined" ? location.href : "";
  useEffect(() => { if (!open) return; let live = true; import("./qrcode.js").then((m) => { if (live) setUri(m.qrDataUri(url, { margin: 3 })); }).catch(() => { }); return () => { live = false; }; }, [open, url]);
  const close = () => A.S.qrOpen.set(false);
  const { boxRef, grip } = useSheetDrag(close);
  return html`<dialog id="qr-invite" ref=${ref} class="modal modal-bottom" onClose=${close}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8 flex flex-col items-center gap-4`}>${grip}
    <div class="flex items-center justify-between w-full"><h3 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:smartphone", "text-primary")} ${L.title}</h3><button aria-label=${L.stay} class="btn btn-ghost btn-sm btn-circle" onClick=${close}>${Icon("lucide:x", "text-xl")}</button></div>
    ${""}
    <div class="rounded-2xl bg-white p-3 max-w-full">${uri ? html`<img data-qr src=${uri} alt="" width="216" height="216" class="block w-52 h-auto max-w-full" />` : html`<div class="w-52 max-w-full aspect-square"></div>`}</div>
    <div class="font-mono text-xs text-base-content/55 break-all text-center max-w-full">${url}</div>
    <button data-qr-stay class="btn btn-primary rounded-2xl w-full" onClick=${close}>${L.stay}</button>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

const DockFade = () => html`<div aria-hidden="true" data-dock-fade class="fixed inset-x-0 bottom-0 z-20 pointer-events-none"
  style="height:calc(var(--dock-h) + env(safe-area-inset-bottom));background:linear-gradient(to top, var(--color-base-200) 18%, transparent 78%)">
  <div data-garland class="ms-decor"></div>
</div>`;

function CleanExit() {
  const loc = useStore(A.S.locale);
  return html`<button data-clean-exit class="fixed right-3 z-30 btn btn-ghost btn-sm btn-circle sf-frost border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm"
    style="top:calc(var(--ms-safe-top) + 0.5rem)" aria-label=${sys("cleanExit", loc)}
    onClick=${() => A.S.clean.set(false)}>${Icon("lucide:minimize-2", "text-base")}</button>`;
}

function Dock() {
  const t = useStore(A.S.t), cur = useStore(A.S.tab);
  const navRef = usePublishedChrome("dock");
  return html`<nav data-dock ref=${navRef} class="sf-raised sf-e3 fixed left-3 right-3 mx-auto w-fit z-30 grid grid-flow-col gap-1 p-1 rounded-[1.35rem]">${A.spec.tabs.map((tab) => html`<button data-tab=${tab.id} key=${tab.id} aria-label=${T(t, tab.label)} aria-current=${cur === tab.id ? "page" : null} class=${`flex flex-col items-center gap-0.5 px-3.5 py-1.5 min-w-14 rounded-[1rem] transition-colors ${cur === tab.id ? "bg-primary text-primary-content" : "text-base-content/80"}`} onClick=${() => A.S.tab.set(tab.id)}>${Icon(tab.icon, "text-xl")}<span class="text-[0.7rem] leading-[1.4] truncate max-w-full">${T(t, tab.label)}</span></button>`)}</nav>`;
}

function Toast() {
  const key = useStore(A.S.toast), undo = useStore(A.S.undo), t = useStore(A.S.t), loc = useStore(A.S.locale), update = useStore(A.S.update);
  const band = "position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:center;padding-bottom:calc(var(--dock-h) + 0.75rem)";
  if (undo) {
    const label = undo.label ? `«${undo.label}» ` : "";
    return html`<div data-toast class="pointer-events-none" style=${band}>
      <div class="pointer-events-auto alert bg-neutral text-neutral-content border-0 rounded-2xl sf-e5 py-2 pl-4 pr-2 font-medium flex items-center gap-2 w-max max-w-[calc(100vw-1.5rem)] ms-reveal">
        ${Icon("lucide:trash-2", "text-base-content/55 text-lg shrink-0")}<span class="truncate">${label}${sys("deleted", loc)}</span>
        <button data-undo class="btn btn-sm btn-ghost text-primary font-semibold rounded-xl gap-1.5 shrink-0" onClick=${() => { const fn = A.S.undo.get()?.fn; A.S.undo.set(null); fn?.(); }}>${Icon("lucide:undo-2", "text-base")}${sys("undo", loc)}</button>
      </div>
    </div>`;
  }
  if (update && !key) {
    return html`<div data-toast class="pointer-events-none" style=${band}>
      <div data-update role="status" class="pointer-events-auto sf-raised sf-e5 bg-base-100 rounded-[var(--ms-r)] p-4 flex flex-col gap-3 w-[calc(100vw-1.5rem)] max-w-sm ms-reveal">
        <div class="flex items-center gap-3">
          <div class="size-12 rounded-full grid place-items-center bg-primary/10 text-primary sf-lift2 shrink-0">${Icon(A.spec.profile?.icon || A.spec.icon || "lucide:sparkles", "text-2xl")}</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold leading-tight">${sys("updateReady", loc)}</div>
            <div class="text-xs text-muted mt-0.5">${sys("updateHint", loc)}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <button data-update-dismiss class="btn btn-sm btn-ghost rounded-full px-4" onClick=${() => A.S.update.set(false)}>${sys("later", loc)}</button>
          <button data-update-apply class="btn btn-sm btn-primary rounded-full flex-1 gap-1.5" onClick=${() => { A.S.update.set(false); A.applyUpdate?.(); }}>${Icon("lucide:rotate-cw", "text-base")}${sys("updateNow", loc)}</button>
        </div>
      </div>
    </div>`;
  }
  const isExit = key === "__exit__";
  const text = isExit ? sys("exit", loc) : key === "saved" ? T(t, "toastSaved") : key === "removed" ? T(t, "toastRemoved") : key;
  const icon = isExit ? Icon("lucide:log-out", "text-base-content/70 text-lg") : Icon("lucide:check-circle", "text-success text-lg");
  return html`<div data-toast class="pointer-events-none" style=${band}><div class=${`alert bg-neutral text-neutral-content border-0 rounded-2xl sf-e5 py-3 px-5 font-medium flex items-center gap-2 w-max transition-opacity duration-200 ${key ? "opacity-100" : "opacity-0"}`}>${icon}${text || ""}</div></div>`;
}

function ConfirmSheet() {
  const c = useStore(A.S.confirm), loc = useStore(A.S.locale);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; c ? d.showModal?.() : d.close?.(); }, [c]);
  const close = () => A.S.confirm.set(null);
  const go = () => { const fn = c?.onConfirm; close(); fn?.(); };
  const { boxRef, grip } = useSheetDrag(close);
  return html`<dialog id="confirm" ref=${ref} class="modal modal-bottom" onClose=${close}><div ref=${boxRef} class=${`${SHEET_BOX} pb-8`}>${grip}
    <h3 class="font-bold text-lg flex items-start gap-2">${Icon("lucide:triangle-alert", "text-error text-xl shrink-0 mt-0.5")}<span>${c?.title || ""}</span></h3>
    ${c?.body ? html`<p class="text-sm text-base-content/70 mt-2 pl-8">${c.body}</p>` : null}
    <div class="flex gap-2 mt-5">
      <button id="confirm-cancel" class="btn btn-ghost flex-1 rounded-2xl" onClick=${close}>${sys("cancel", loc)}</button>
      <button id="confirm-go" data-haptic="bump" class="btn btn-error flex-1 rounded-2xl" onClick=${go}>${c?.verb || ""}</button>
    </div>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

function ConverterView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), loc = useStore(A.S.locale);
  const amount = useStore(A.S.amount), from = useStore(A.S.from), to = useStore(A.S.to);
  if (!useReveal(!data.loading)) return Skeleton({ layout: "row" });
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  const codes = [tab.base, ...data.items.map((i) => i[tab.codeField])].filter((v, i, a) => v && a.indexOf(v) === i);
  const rate = (code) => code === tab.base ? 1 : (Number(data.items.find((i) => i[tab.codeField] === code)?.[tab.rateField]) || 0);
  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const rFrom = rate(from), rTo = rate(to);
  const result = rTo ? amt * rFrom / rTo : 0;
  const one = rTo ? rFrom / rTo : 0;
  const quick = tab.quick || ["100", "500", "1000", "5000"];
  const Sel = (id, val, onCh, aria) => html`<select id=${id} aria-label=${aria} class="select select-bordered rounded-2xl font-semibold w-24 shrink-0" value=${val} onChange=${(e) => onCh(e.target.value)}>${codes.map((c) => html`<option value=${c} key=${c}>${c}</option>`)}</select>`;
  return html`<div class="flex flex-col gap-3">
    <div class="card @container sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-4 gap-3">
      <div class="flex gap-2 items-center"><input id="conv-amount" type="text" inputmode="decimal" aria-label=${T(t, "convAmount")} class="input input-bordered rounded-2xl text-lg font-semibold tabular-nums flex-1 min-w-0" value=${amount} onInput=${(e) => A.S.amount.set(e.target.value)} />${Sel("conv-from", from, (v) => A.S.from.set(v), T(t, "convFrom"))}</div>
      <div class="flex justify-center"><button id="conv-swap" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "swap")} onClick=${A.swap}>${Icon("lucide:arrow-up-down", "text-xl")}</button></div>
      <div class="flex gap-2 items-center"><div id="conv-result" class="input input-bordered rounded-2xl text-lg font-bold tabular-nums flex-1 min-w-0 flex items-center bg-base-200">${fmtNum(result, loc)}</div>${Sel("conv-to", to, (v) => A.S.to.set(v), T(t, "convTo"))}</div>
      <div class="text-xs text-base-content/80 text-center">${T(t, "perUnit2", { a: "1 " + from, rate: fmtNum(one, loc), b: to })}</div>
    </div></div>
    <div class="flex flex-wrap gap-2 justify-center">${quick.map((q) => html`<button class="btn btn-sm btn-outline rounded-full" key=${q} onClick=${() => A.S.amount.set(q)}>${q}</button>`)}</div>
  </div>`;
}

function Stage({ tab, meta }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let live = true;
    import("./hero.js").then((m) => { if (live) setComp(() => m.HeroStage); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!Comp) return null;
  const s = tab.stage;
  const pick = (keys, fallback) => Array.isArray(keys) && keys.length === 4
    ? keys.map((k) => Number(meta[k]) || 0)
    : fallback;
  return html`<${Comp} shader=${new URL(s.shader, document.baseURI)}
    seed=${Number(meta[s.seed]) || 0}
    ink=${pick(s.ink, undefined)} vary=${pick(s.vary, undefined)} />`;
}

const COL_W = 48, CURVE_H = 72, CURVE_PAD = 24;
function StripCurve({ items, valueKey, unit }) {
  const vals = items.map((s) => Number(s[valueKey]));
  const w = items.length * COL_W;
  const { line, area, points } = curvePath(vals, w - COL_W, CURVE_H, CURVE_PAD);
  if (!line) return null;
  return html`<div data-curve class="relative shrink-0" style=${`width:${w}px;height:${CURVE_H}px`}>
    <svg viewBox=${`0 0 ${w - COL_W} ${CURVE_H}`} width=${w - COL_W} height=${CURVE_H} aria-hidden="true"
      class="absolute top-0 text-[var(--app-accent)]" style=${`left:${COL_W / 2}px`}>
      ${ ""}
      <defs><linearGradient id="ms-curve-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.20" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0.01" />
      </linearGradient></defs>
      <path d=${area} fill="url(#ms-curve-fade)" />
      <path d=${line} fill="none" stroke="currentColor" stroke-width="1.75" opacity="0.9"
        stroke-linecap="round" stroke-linejoin="round" />
      <circle cx=${points[0].x} cy=${points[0].y} r="3.2" fill="currentColor" />
    </svg>
    ${points.map((pt, i) => html`<span key=${i}
      class="absolute font-mono text-[length:var(--ms-label)] font-semibold tabular-nums -translate-x-1/2 -translate-y-full"
      style=${`left:${pt.x + COL_W / 2}px;top:${pt.y - 4}px`}>${items[i][valueKey]}${unit || ""}</span>`)}
  </div>`;
}

function DashboardView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), loc = useStore(A.S.locale);
  if (!useReveal(!data.loading)) return html`<div data-skel class="flex flex-col gap-4"><figure class="aspect-video rounded-[var(--ms-r)] overflow-hidden sf-inset"><${Pixels} /></figure><div class="text-2xl font-bold text-base-content/70 truncate"><${Scramble} len=${18} /></div><div class="flex flex-col gap-2 text-base-content/70"><div class="truncate"><${Scramble} len=${30} /></div><div class="truncate"><${Scramble} len=${22} /></div></div></div>`;
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  const m = data.meta || {}, h = tab.hero;
  const placeText = h.place && m[h.place] ? T(t, m[h.place]) : null;
  const liveAttr = h.live ? { "data-live": "" } : {};
  const place = placeText ? (A.spec.filters
    ? html`<button ...${liveAttr} class="inline-flex items-center gap-1 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70" onClick=${() => A.S.sheet.set(true)}>${Icon("lucide:map-pin", "text-[0.8em]")}${placeText} ${Icon("lucide:chevron-down", "text-[0.8em]")}</button>`
    : html`<span ...${liveAttr} class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70 inline-flex items-center gap-1">${Icon("lucide:map-pin", "text-[0.8em]")}${placeText}</span>`) : null;
  const strip = tab.strip && Array.isArray(m[tab.strip.from]) ? m[tab.strip.from] : null;
  const dayVals = tab.days && tab.days.bar
    ? data.items.flatMap((d) => [Number(d[tab.days.hi]), Number(d[tab.days.lo])]).filter(Number.isFinite)
    : [];
  const wkLo = dayVals.length ? Math.min(...dayVals) : 0;
  const wkSpan = (dayVals.length ? Math.max(...dayVals) : 1) - wkLo || 1;
  const Sect = (label, body, extra = "") => html`<div class=${`sf-raised sf-e2 rounded-[var(--ms-r)] p-[var(--ms-pad)] flex flex-col gap-[var(--ms-gap)] ${extra}`}>
    ${label ? html`<div class="font-mono uppercase tracking-wide font-semibold text-[length:var(--ms-label)] text-base-content/70">${label}</div>` : null}
    ${body}
  </div>`;
  return html`<${Fragment}>
    ${tab.stage ? html`<${Stage} tab=${tab} meta=${m} />` : null}
    <div class="relative z-10 flex flex-col gap-[var(--ms-gap)]">
    ${ ""}
    <div class="@container flex flex-col items-center text-center gap-1 pt-1 pb-2">
      ${place}
      <div class="flex items-start justify-center gap-0.5 leading-[0.85] mt-1">
        ${ ""}
        <span class="font-semibold tabular-nums tracking-tighter leading-[0.85]" style="font-size:var(--ms-hero)">${m[h.value] ?? "—"}</span>
        ${h.unit ? html`<span class="font-medium text-base-content/70 mt-1" style="font-size:calc(var(--ms-hero) * 0.36)">${h.unit}</span>` : null}
      </div>
      ${h.caption && m[h.caption] ? html`<div class="flex items-center gap-1.5 text-base font-medium">
        ${h.icon && m[h.icon] ? Icon(m[h.icon], "text-xl text-[var(--app-accent)]") : null}${T(t, m[h.caption])}
      </div>` : null}
      ${h.metrics ? html`<div class="flex items-stretch justify-center mt-3 divide-x divide-base-content/15">
        ${h.metrics.map((mt) => html`<div class="flex flex-col items-center gap-0.5 px-4 @max-[300px]:px-3" key=${mt.field}>
          <span class="font-mono font-semibold tabular-nums text-[0.95rem] inline-flex items-center gap-1">
            ${mt.icon ? Icon(mt.icon, "text-[length:var(--ms-label)] text-base-content/70") : null}${m[mt.field] ?? "—"}${mt.unit || ""}</span>
          <span class="font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70 whitespace-nowrap">${T(t, mt.label)}</span>
        </div>`)}
      </div>` : null}
    </div>
    ${strip ? Sect(T(t, tab.strip.label), html`<div class="overflow-x-auto -mx-1 px-1" tabindex="0" role="group" aria-label=${T(t, tab.strip.label)}>
      <div class="flex flex-col w-max gap-1.5">
        <div class="flex">${strip.map((s, i) => html`<div class="flex flex-col items-center gap-1 shrink-0" style=${`width:${COL_W}px`} key=${i}>
          <span data-striptime class="font-mono text-[length:var(--ms-label)] text-base-content/70 tabular-nums">${s[tab.strip.time]}</span>
          ${tab.strip.icon && s[tab.strip.icon] ? Icon(s[tab.strip.icon], "text-lg text-base-content/80") : null}
        </div>`)}</div>
        ${tab.strip.curve
          ? html`<${StripCurve} items=${strip} valueKey=${tab.strip.value} unit=${tab.strip.unit} />`
          : html`<div class="flex">${strip.map((s, i) => html`<div class="shrink-0 text-center font-semibold tabular-nums" style=${`width:${COL_W}px`} key=${i}>${s[tab.strip.value]}${tab.strip.unit || ""}</div>`)}</div>`}
      </div>
    </div>`) : null}
    ${tab.days ? Sect(tab.days.label ? T(t, tab.days.label) : null, html`<div class="flex flex-col">
      ${data.items.map((d, i) => html`<div class="flex items-center gap-3 py-1.5 border-b border-base-300/50 last:border-0" key=${i}>
        <span class="w-10 shrink-0 font-medium">${tab.days.weekday ? new Date(d[tab.days.day]).toLocaleDateString(loc === "en" ? "en-GB" : loc || "uk", { weekday: "short" }) : d[tab.days.day]}</span>
        ${tab.days.icon && d[tab.days.icon] ? Icon(d[tab.days.icon], "text-lg text-base-content/80 shrink-0") : null}
        ${ ""}
        ${tab.days.prob && Number(d[tab.days.prob]) > 0
          ? html`<span class="font-mono text-[length:var(--ms-label)] tabular-nums text-base-content/70 w-8 shrink-0">${d[tab.days.prob]}%</span>`
          : html`<span class="w-8 shrink-0"></span>`}
        ${tab.days.lo ? html`<span class="tabular-nums text-base-content/70 w-8 text-right shrink-0">${d[tab.days.lo]}${tab.days.unit || ""}</span>` : null}
        ${tab.days.bar ? html`<span data-daybar class="flex-1 min-w-6 h-1.5 rounded-full sf-inset relative overflow-hidden" aria-hidden="true">
          <span class="absolute inset-y-0 rounded-full bg-[var(--app-accent)] opacity-70"
            style=${`left:${((Number(d[tab.days.lo]) - wkLo) / wkSpan * 100).toFixed(1)}%;right:${(100 - (Number(d[tab.days.hi]) - wkLo) / wkSpan * 100).toFixed(1)}%`}></span>
        </span>` : html`<span class="flex-1"></span>`}
        <span class="tabular-nums font-semibold w-8 text-right shrink-0">${d[tab.days.hi]}${tab.days.unit || ""}</span>
      </div>`)}
    </div>`) : null}
    </div>
  </${Fragment}>`;
}

function TabView({ tab }) {
  if (tab.type === "list") return html`<${ListView} tab=${tab} />`;
  if (tab.type === "converter") return html`<${ConverterView} tab=${tab} />`;
  if (tab.type === "dashboard") return html`<${DashboardView} tab=${tab} />`;
  if (tab.type === "profile") return html`<${Profile} tab=${tab} />`;
  if (tab.type === "tool") { const V = VIEWS[tab.view]; return V ? html`<${V} t=${A.S.t.get()} tab=${tab} S=${A.S} toast=${A.toast} undo=${A.undo} confirm=${A.confirm} screen=${A.S.screen.get()} openScreen=${(s) => A.S.screen.set(s)} closeScreen=${() => A.S.screen.set(null)} />` : Empty("lucide:wrench", `view "${tab.view}" not provided`, null); }
  return Empty("lucide:construction", `${tab.type} view — coming soon`, null);
}

/**
 * The app root: the chrome (app bar, dock, dock fade, toast), the current tab's view and every systemic
 * overlay (detail, permissions, sign-in, APK, QR, install) driven by the routing atoms in the app context.
 * @returns the Preact tree the boot mounts into `#app`
 */
export function App() {
  const cur = useStore(A.S.tab), screen = useStore(A.S.screen);
  useEffect(() => authWall.listen(() => { if (A.S.screen.get() !== "signin") A.S.screen.set("signin"); }), []);
  const tab = A.spec.tabs.find((x) => x.id === cur) || A.spec.tabs[0];
  const items = useStore(A.S.data).items;
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    let q; try { q = new URLSearchParams(location.search); } catch { return; }
    const wantTab = q.get("tab"), wantScreen = q.get("screen");
    if (wantTab && A.spec.tabs.some((x) => x.id === wantTab)) A.S.tab.set(wantTab);
    if (wantScreen) A.S.screen.set(wantScreen);
  }, []);
  const shot = useRef(false);
  useEffect(() => {
    if (shot.current || !A.spec.detail || !items?.length) return;
    let want; try { want = new URLSearchParams(location.search).get("detail"); } catch { return; }
    if (!want) return;
    shot.current = true;
    const hit = items.find((it) => String(it.id ?? "") === want || String(A.favKey(it) ?? "") === want);
    if (hit) A.S.detail.set(hit);
  }, [items]);
  const fit = !!tab.fit;
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("ms-fit", fit);
    return () => el.classList.remove("ms-fit");
  }, [fit]);
  const clean = useStore(A.S.clean);
  useEffect(() => {
    if (!clean) return;
    const s = document.documentElement.style;
    s.setProperty("--hdr-h", "0px");
    s.setProperty("--dock-h", "0px");
  }, [clean]);
  return html`<${Fragment}>
    ${clean ? null : html`<${AppBar} />`}
    ${A.spec.filters ? html`<${FilterChips} />` : null}
    ${tab.type === "list" && tab.chart ? html`<${Chart} tab=${tab} />` : null}
    ${tab.type === "list" && tab.segments ? html`<${SegmentBar} tab=${tab} />` : null}
    ${tab.type === "list" && tab.sort ? html`<${SortBar} tab=${tab} />` : null}
    ${tab.type === "list" && tab.toggles ? html`<${TogglesBar} tab=${tab} />` : null}
    <main id="view" class="px-4 pt-4 max-w-xl mx-auto flex flex-col gap-3" style=${fit ? null : "padding-bottom:calc(var(--dock-h) + 1.5rem)"}>
      <${TabView} tab=${tab} />
    </main>
    ${A.spec.detail ? html`<${DetailView} />` : null}
    <${PlayerHost} />
    ${A.spec.filters ? html`<${FilterSheet} />` : null}
    ${screen === "perms" ? html`<${PermissionsScreen} />` : null}
    ${screen === "watch" ? html`<${WatchScreen} />` : null}
    ${screen === "apk" ? html`<${ApkScreen} />` : null}
    ${screen === "signin" ? html`<${SignInScreen} />` : null}
    ${clean ? null : html`<${DockFade} />`}
    <${InstallModal} />
    <${QrModal} />
    <${ConfirmSheet} />
    ${clean ? html`<${CleanExit} />` : html`<${Dock} />`}
    <${Toast} />
  </${Fragment}>`;
}

/** Whether the page runs on an iOS device (the install flow differs: no `beforeinstallprompt`). */
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
/** Whether the page runs as an installed PWA (fullscreen or standalone display mode, or iOS's `navigator.standalone`). */
export const isStandalone = () => matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
