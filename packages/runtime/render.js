// microspec runtime — Preact render catalog. Reads a spec, renders via an allow-listed set of
// components (families). This slice ships: shell (AppBar, Dock, SearchBar, Toast), the LIST family
// (feed + row cards, badges, sections, search/searchFetch), PROFILE, top-level DETAIL drill-down,
// and FILTER sheet/chips + InstallModal. converter/dashboard/tool views land in the next slice.
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T, ago, whenLabel, sinceLabel } from "./i18n.js";
import { PERMISSIONS, permLabels } from "./permissions.js";
import { tr, warm, trTick } from "./translate.js";
import { enrich, warmMeta, metaTick } from "./enrich.js";

let A;            // app context: { spec, S, load, toast, toggleFav, favKey, swap }
let VIEWS = {};   // tool-app custom views: { viewKey: PreactComponent }
export function setApp(app, views) { A = app; VIEWS = views || {}; }

// ---- helpers ----------------------------------------------------------------
const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// field(it, name, loc) — resolve an item field to its display value, composing two enhancement layers:
//   1. ENRICH: if `name` is the spec's enrich.body virtual field, its value is the article description
//      fetched for it[enrich.url] (or "" until it arrives) — not a real item key.
//   2. TRANSLATE: fields listed in spec.translate are shown in the active locale (cached, fail-open).
// Non-enriched, non-translated fields (and en) pass through untouched.
const trFields = () => A.spec.translate || [];
function field(it, name, loc) {
  const e = A.spec.enrich;
  let v = (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
  return trFields().includes(name) ? tr(v, loc) : v;
}
const searchText = (it) => Object.values(it).map((v) => Array.isArray(v) ? v.join(" ") : v).join(" ").toLowerCase();

// tiny predicate language for sections / clientFilters / when-badges: "fav", "!fav", "field", "!field"
function test(it, fav, expr) {
  if (!expr) return true;
  const neg = expr.startsWith("!");
  const key = neg ? expr.slice(1) : expr;
  const truthy = key === "fav" ? !!fav[A.favKey(it)] : !!it[key];
  return neg ? !truthy : truthy;
}

// block javascript:/data: URLs coming from untrusted feed data
function safeHref(href) {
  if (typeof href !== "string") return null;
  try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) ? href : null; }
  catch { return null; }
}

const metaText = (meta, it, dict, loc) => {
  if (!meta) return "";
  if (typeof meta === "string") return it[meta] ?? "";
  const v = it[meta.field];
  return v == null ? "" : (meta.format === "ago" ? ago(dict, v, loc) : meta.format === "when" ? whenLabel(dict, v, loc) : meta.format === "since" ? sinceLabel(dict, v, loc) : String(v));
};
// meta formats that carry a clock affordance
const isTimeFmt = (fmt) => fmt === "ago" || fmt === "when" || fmt === "since";
const fmtNum = (n, loc) => new Intl.NumberFormat(loc === "uk" ? "uk-UA" : "en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0);

// locale date formats reusable by card meta, detail rows AND table columns (format: ago|when|since)
const DATE_FMT = { ago, when: whenLabel, since: sinceLabel };
const fmtCell = (c, it, t, loc) => (c.format && DATE_FMT[c.format]) ? DATE_FMT[c.format](t, it[c.field], loc) : it[c.field];

// Sequential magnitude → intensity 0..1, log-scaled (suits money / long-tailed data) and normalized across
// the currently-visible items. Reusable by table `heat` columns and `chart` bars — the color-by-strength.
function heatMap(items, field) {
  const v = items.map((it) => Math.max(0, Number(it[field]) || 0));
  const pos = v.filter((x) => x > 0);
  if (!pos.length) return new Map(items.map((it) => [it, 0]));
  const lo = Math.log(Math.min(...pos)), span = Math.log(Math.max(...pos)) - lo || 1;
  return new Map(items.map((it, i) => [it, v[i] > 0 ? Math.min(1, Math.max(0, (Math.log(v[i]) - lo) / span)) : 0]));
}
// single warm hue, dim→strong (sequential ramp for magnitude). `bg` for bars/accents, `ink` tints a value.
const heatBg = (x) => `rgba(240,169,59,${(0.16 + 0.84 * x).toFixed(3)})`;
const heatInk = (x) => (x >= 0.5 ? `rgba(240,169,59,${(0.55 + 0.45 * x).toFixed(3)})` : "");

// searchFetch family: the search box debounce-drives a real refetch (query → data.js as filters.q).
let _searchT;
const debouncedLoad = () => { clearTimeout(_searchT); _searchT = setTimeout(() => A.load(), 350); };

const Empty = (icon, text, hint) => html`<div class="flex flex-col items-center text-base-content/60 py-16 gap-2 text-center px-6">${Icon(icon, "text-4xl")}<span class="font-medium">${text}</span>${hint && html`<span class="text-sm text-base-content/60">${hint}</span>`}</div>`;

const Skeleton = (row) => html`<${Fragment}>${Array.from({ length: 6 }, (_, i) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl" key=${i}><div class=${row ? "card-body p-3 px-4 flex-row items-center gap-3" : "card-body p-4 gap-3"}>${row ? html`<div class="skeleton h-5 w-10"></div><div class="skeleton h-4 flex-1"></div><div class="skeleton h-5 w-16"></div>` : html`<div class="skeleton h-5 w-2/3"></div><div class="skeleton h-4 w-1/3"></div><div class="skeleton h-4 w-full"></div>`}</div></div>`)}</${Fragment}>`;

const Frag = (children) => html`<${Fragment}>${children}</${Fragment}>`;

// ---- badges -----------------------------------------------------------------
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

// ---- card -------------------------------------------------------------------
function Card({ item: it, card, hide }) {
  const t = useStore(A.S.t), fav = useStore(A.S.fav), loc = useStore(A.S.locale);
  useStore(trTick); useStore(metaTick); // re-render as translations / article previews stream in
  const on = !!fav[A.favKey(it)];
  const star = A.spec.fav ? html`<button data-fav=${A.favKey(it)} aria-label=${on ? T(t, "unfavAria") : T(t, "favAria")}
    onClick=${(e) => { e.preventDefault(); e.stopPropagation(); A.toggleFav(it); }}
    class=${`btn btn-ghost btn-xs btn-circle relative z-[2] ${on ? "text-primary" : "opacity-50"}`}>${Icon(card.layout === "row" ? "lucide:star" : `lucide:bookmark${on ? "-check" : ""}`, "text-lg")}</button>` : null;

  if (card.layout === "row") {
    return html`<div class="card @container bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 px-4 flex-row items-center gap-3 @max-[260px]:px-2.5 @max-[260px]:gap-2">
      <div class="font-bold text-primary w-11 shrink-0 @max-[260px]:w-8 @max-[260px]:text-sm">${it[card.lead] ?? "—"}</div>
      <div class="flex-1 min-w-0 @max-[260px]:hidden"><div class="font-medium truncate text-sm">${field(it, card.title, loc)}</div></div>
      <div class="text-right @max-[260px]:text-sm"><div class="font-semibold tabular-nums">${it[card.trailing] == null ? "—" : card.unit ? it[card.trailing] + " " + card.unit : it[card.trailing]}</div>${card.trend && it[card.trend] != null ? html`<div class=${`text-xs font-medium tabular-nums ${Number(it[card.trend]) >= 0 ? "text-success" : "text-error"}`}>${Number(it[card.trend]) >= 0 ? "+" : ""}${it[card.trend]}%</div>` : null}</div>
      ${star}
    </div></div>`;
  }

  // grid: Android-home-screen launcher tile — a rounded icon tile (brand bg + glyph, or a real image)
  // with a 2-line label under it. The whole tile is a same-tab link (opening an app, not a new tab).
  if (card.layout === "grid") {
    const href = card.href ? safeHref(it[card.href]) : null;
    const bg = card.bg ? it[card.bg] : null, fg = card.fg ? it[card.fg] : null;
    const tile = html`<div class="aspect-square w-full rounded-[24%] flex items-center justify-center overflow-hidden border border-base-content/10 shadow-sm" style=${bg ? `background-color:${bg}` : ""}>
      ${card.image && it[card.image]
        ? html`<img src=${it[card.image]} alt="" loading="lazy" class="w-full h-full object-cover"/>`
        : html`<iconify-icon icon=${(card.icon && it[card.icon]) || "lucide:box"} class="text-3xl" style=${fg ? `color:${fg}` : ""}></iconify-icon>`}
    </div>`;
    const inner = html`<div class="flex flex-col items-center gap-1.5 active:scale-90 transition-transform min-w-0 w-full">${tile}<div class="text-[0.72rem] leading-tight text-center line-clamp-2 break-words w-full text-base-content/90">${field(it, card.title, loc)}</div></div>`;
    return href ? html`<a href=${href} aria-label=${it[card.title] ?? ""} class="block min-w-0">${inner}</a>` : inner;
  }

  const sub = card.subtitle ? field(it, card.subtitle, loc) : null;      // resolved (enrich/translate) — the
  const bodyTxt = card.body ? field(it, card.body, loc) : null;          // value may be virtual, so gate on it
  const body = html`<div class="card-body p-4 gap-2 @max-[240px]:p-3 @max-[240px]:gap-1">
    <div class="flex items-start justify-between gap-2"><h2 class="font-semibold leading-snug break-words min-w-0 @max-[240px]:text-sm">${field(it, card.title, loc) ?? "—"}</h2>${star}</div>
    ${sub ? html`<div class="text-sm text-base-content/70 @max-[240px]:hidden">${sub}</div>` : null}
    <${Badges} item=${it} badges=${card.badges} hide=${hide} />
    ${bodyTxt ? html`<p class="text-sm text-base-content/70 line-clamp-2 @max-[240px]:hidden">${bodyTxt}</p>` : null}
    <div class="flex items-center justify-between gap-2 mt-0.5 @max-[240px]:hidden">
      ${(() => { const mt = metaText(card.meta, it, t, loc); return mt ? html`<span class="text-xs text-base-content/80 flex items-center gap-1">${isTimeFmt(card.meta?.format) ? Icon("lucide:clock", "text-[0.9em] opacity-70") : null}${mt}</span>` : html`<span></span>`; })()}
      ${card.more ? html`<span class="text-xs text-primary font-medium flex items-center gap-0.5 ml-auto">${T(t, card.more)} ${Icon("lucide:arrow-up-right")}</span>` : null}
    </div></div>`;

  const img = card.image && it[card.image] ? html`<figure class="aspect-video bg-base-300 overflow-hidden @max-[240px]:hidden"><img src=${it[card.image]} alt="" loading="lazy" class=${`w-full h-full ${card.imageFit === "contain" ? "object-contain" : "object-cover"}`}/></figure>` : null;
  const cls = `card @container bg-base-100 border border-base-300 rounded-2xl${card.image ? " overflow-hidden" : ""}`;

  // top-level detail turns every card into a drill-down (stretched-link: full-card button UNDER the star)
  if (A.spec.detail) {
    return html`<div class=${cls + " relative hover:border-primary/40 active:scale-[.99] transition"}>${img}${body}
      <button class="aw-tap absolute inset-0 z-[1] rounded-2xl" aria-label=${`${field(it, card.title, loc) ?? ""} — ${T(t, card.more || "title")}`} onClick=${() => A.S.detail.set(it)}></button></div>`;
  }
  const href = card.href ? safeHref(it[card.href]) : null;
  return href
    ? html`<a href=${href} target="_blank" rel="noopener" class=${cls + " block hover:border-primary/40 active:scale-[.99] transition"}>${img}${body}</a>`
    : html`<div class=${cls}>${img}${body}</div>`;
}

function Section({ sec, items, card }) {
  const t = useStore(A.S.t), filters = useStore(A.S.filters);
  return html`<${Fragment}>
    <div class="flex items-center gap-2 mt-3 mb-1 px-1"><span class=${`text-sm font-semibold flex items-center gap-1.5 ${sec.accent ? "text-primary" : ""}`}>${sec.icon ? Icon(sec.icon) : null}${T(t, sec.label, sec.labelParams ? { cat: filters[sec.labelParams] } : null)}</span><span class=${`badge badge-sm ${sec.accent ? "badge-primary" : "badge-ghost"}`}>${items.length}</span><span class="flex-1 h-px bg-base-300"></span></div>
    ${items.map((it) => html`<${Card} item=${it} card=${card} hide=${sec.hideBadge} key=${A.favKey(it) || it[card.title]} />`)}
  </${Fragment}>`;
}

// dismissible info banner atop a list (e.g. dou explains "бронювання")
function Banner({ banner }) {
  const t = useStore(A.S.t);
  return html`<div class="alert bg-primary/10 border border-primary/25 rounded-2xl text-sm py-2.5 px-3 flex items-start gap-2" role="note">
    ${Icon(banner.icon, "text-primary text-lg mt-0.5 shrink-0")}
    <div class="text-base-content"><span class="font-semibold">${T(t, banner.titleKey)}</span><span class="text-base-content/80">${T(t, banner.bodyKey)}</span></div>
  </div>`;
}

// ---- list family ------------------------------------------------------------
// Infinite scroll sentinel. Accessible-first: a real "load more" button (keyboard/SR reachable) that
// ALSO auto-triggers via IntersectionObserver with a 500px prefetch margin. A.loadMore() no-ops when
// there's no cursor or a page is already loading, so the observer can fire freely. Always mounted so the
// observed node keeps a stable identity.
function LoadMore() {
  const t = useStore(A.S.t), data = useStore(A.S.data);
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) A.loadMore(); }, { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const btn = (cls, icon) => html`<button class=${`btn btn-ghost btn-sm gap-2 ${cls}`} onClick=${() => A.loadMore()}>${Icon(icon)} ${T(t, "loadMore")}</button>`;
  return html`<div ref=${ref} class="flex justify-center py-4 min-h-8" aria-live="polite">
    ${data.loadingMore ? html`<span class="loading loading-spinner loading-md text-primary" role="status" aria-label=${T(t, "statusLoading")}></span>`
      : data.moreError ? btn("text-error", "lucide:rotate-cw")
      : data.next != null ? btn("text-base-content/70", "lucide:chevron-down")
      : null}
  </div>`;
}

// Live bar chart of recent items' numeric `field` (tab.chart: { type:"bars", field, max, label }). Single-
// hue heat ramp (magnitude), thin rounded bars, uniform-scaled viewBox so the rounding stays crisp.
// Systemic: any list with a numeric field gets a chart by declaring it — no bespoke code.
function Chart({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data);
  const cfg = tab.chart, all = data.items || [];
  if (all.length < 2) return null;
  const plot = all.slice(0, cfg.max || 40);
  const heat = heatMap(all, cfg.field);                                        // colour by GLOBAL magnitude
  const sorted = all.map((it) => Math.max(0, Number(it[cfg.field]) || 0)).sort((a, b) => a - b);
  const max = sorted[Math.floor(sorted.length * 0.92)] || sorted[sorted.length - 1] || 1; // stable y-scale (92nd pct over the whole buffer → no rescaling jump)
  const W = 320, H = 56, bw = W / plot.length, seq = plot.slice().reverse();    // oldest → newest, L → R
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 gap-1.5">
    ${cfg.label ? html`<div class="text-xs text-base-content/60 px-1 font-medium">${T(t, cfg.label)}</div>` : null}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-full" style="height:52px" role="img" aria-label=${T(t, cfg.label || "title")}>
      ${seq.map((it, i) => { const h = Math.max(1.5, Math.min(1, (Math.max(0, Number(it[cfg.field]) || 0)) / max) * (H - 3)); return html`<rect x=${(i * bw + bw * 0.14).toFixed(2)} y=${(H - h).toFixed(2)} width=${(bw * 0.72).toFixed(2)} height=${h.toFixed(2)} fill=${heatBg(heat.get(it))} key=${i}></rect>`; })}
    </svg>
  </div></div></div>`;
}

// Dense table layout (card.layout:"table", card.columns:[{field,label,heat,grow,align,mono,muted,format}]).
// Scannable micro-rows with a heat accent bar + heat-tinted value. Rows drill into detail (or href).
const TABLE_CAP = 120; // rows painted into the DOM (the buffer behind them can be far larger, e.g. a stream)
function Table({ items, tab }) {
  const t = useStore(A.S.t), loc = useStore(A.S.locale);
  const cols = tab.card.columns, hc = cols.find((c) => c.heat);
  const heat = hc ? heatMap(items, hc.heat) : null;   // magnitude over the full (filtered/sorted) set
  const rows = items.slice(0, TABLE_CAP);
  const cls = (c) => `${c.grow ? "flex-1 min-w-0 truncate" : "shrink-0"}${c.align === "right" ? " text-right" : ""}${c.mono ? " tabular-nums" : ""}${c.muted ? " text-base-content/55" : ""}`;
  const open = (it) => { if (A.spec.detail) A.S.detail.set(it); else if (tab.card.href) { const h = safeHref(it[tab.card.href]); if (h) window.open(h, "_blank"); } };
  return html`<div class="px-4 max-w-xl mx-auto w-full">
    <div class="flex items-center gap-3 px-3 py-1.5 text-[0.62rem] uppercase tracking-wide text-base-content/45">${cols.map((c) => html`<div class=${cls(c)} key=${c.field}>${c.label ? T(t, c.label) : ""}</div>`)}</div>
    <div class="flex flex-col rounded-2xl overflow-hidden border border-base-300 bg-base-100">
      ${rows.map((it, i) => html`<button type="button" data-row=${i} class="flex items-center gap-3 pl-4 pr-3 py-2 text-sm border-b border-base-300/50 last:border-0 active:bg-base-200 text-left w-full relative" key=${A.favKey(it) || it[cols[0].field] || i} onClick=${() => open(it)}>
        ${heat ? html`<span class="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full" style=${`background:${heatBg(heat.get(it))}`}></span>` : null}
        ${cols.map((c) => html`<div class=${cls(c) + " font-medium leading-tight"} style=${c.heat && heat ? `color:${heatInk(heat.get(it))}` : ""} key=${c.field}>${fmtCell(c, it, t, loc)}${c.sub && it[c.sub] != null && it[c.sub] !== "" ? html`<div class="text-[0.7rem] font-normal text-base-content/45 tabular-nums leading-tight">${it[c.sub]}</div>` : null}</div>`)}
      </button>`)}
    </div>
  </div>`;
}

function ListView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), q = useStore(A.S.query).trim().toLowerCase(), fav = useStore(A.S.fav), filters = useStore(A.S.filters), loc = useStore(A.S.locale), sortKey = useStore(A.S.sort);
  const mt = useStore(metaTick);
  // Warm the enrichment + translation caches for every visible item (live feed or saved). Both are no-ops
  // when already cached; cards re-render via metaTick/trTick as data lands. Order matters: previews are
  // fetched first, then the translation pass runs over the RESOLVED values (field(…, "en") returns the
  // enriched English description) so a translated locale localizes the preview too — hence metaTick in the
  // deps, which re-runs this once previews arrive. Above the early returns so hooks stay unconditional.
  useEffect(() => {
    const src = tab.source === "fav" ? Object.values(fav) : (data.items || []);
    if (A.spec.enrich) warmMeta(src.map((it) => it[A.spec.enrich.url]));
    const fields = A.spec.translate;
    if (fields?.length && loc !== "en") warm(src.flatMap((it) => fields.map((f) => field(it, f, "en"))), loc);
  }, [data.items, fav, loc, tab.source, mt]);
  if (!tab.card) return Empty("lucide:alert-triangle", T(t, tab.empty?.text || "noResults"), null);
  if (data.loading) return Skeleton(tab.card.layout === "row");
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  if (tab.searchFetch && !q) return Empty(tab.prompt?.icon || "lucide:search", T(t, tab.prompt?.text || "searchPrompt"), T(t, tab.prompt?.hint || "searchPromptHint"));

  let items = tab.source === "fav" ? Object.values(fav) : data.items;
  if (q && !tab.searchFetch) items = items.filter((it) => searchText(it).includes(q));  // server already searched when searchFetch
  for (const cf of (tab.clientFilters || [])) if (filters[cf.key]) items = items.filter((it) => test(it, fav, cf.when));
  // range filters (from–to on a numeric field) — declared in spec.filters.controls, persisted like the rest
  for (const c of (A.spec.filters?.controls || [])) if (c.type === "range" && filters[c.key]) {
    const r = filters[c.key];
    items = items.filter((it) => { const v = Number(it[c.field]); return !isNaN(v) && (r.from == null || r.from === "" || v >= +r.from) && (r.to == null || r.to === "" || v <= +r.to); });
  }
  if (tab.sort) {  // declarative persisted sort (S.sort holds the chosen key)
    const o = tab.sort.find((x) => x.key === sortKey) || tab.sort[0];
    const dir = o.dir === "asc" ? 1 : -1;
    items = [...items].sort((a, b) => {
      const x = a[o.by], y = b[o.by];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true })) * dir;
    });
  }
  if (!items.length) return Empty(tab.empty?.icon || "lucide:search-x", T(t, tab.empty?.text || "noResults"), T(t, tab.empty?.hint || "noResultsHint"));

  const banner = tab.banner ? html`<${Banner} banner=${tab.banner} key="banner" />` : null;
  const cards = items.map((it) => html`<${Card} item=${it} card=${tab.card} key=${A.favKey(it) || it[tab.card.title]} />`);
  // grid layout lays its tiles out in an Android-style grid; other layouts stack in the flex-col main.
  // @container wrapper so the grid drops to 3 columns on a watch-narrow width (4 on a phone).
  if (tab.card.layout === "grid") return Frag([banner, html`<div class="@container pt-2" key="grid"><div class="grid grid-cols-3 @min-[300px]:grid-cols-4 gap-x-3 gap-y-5">${cards}</div></div>`]);
  // infinite scroll appends server pages under the live list (not the saved/fav tab, not sectioned lists)
  const more = tab.paginate && tab.source !== "fav" ? html`<${LoadMore} key="more" />` : null;
  if (tab.card.layout === "table") return Frag([banner, html`<${Table} items=${items} tab=${tab} key="tbl" />`, more]);
  if (!tab.sections) return Frag([banner, ...cards, more]);
  return Frag([banner, ...tab.sections.map((sec) => { const l = items.filter((it) => test(it, fav, sec.filter)); return l.length ? html`<${Section} sec=${sec} items=${l} card=${tab.card} key=${sec.label} />` : null; })]);
}

// ---- profile ----------------------------------------------------------------
function Profile({ tab }) {
  const t = useStore(A.S.t), theme = useStore(A.S.theme), loc = useStore(A.S.locale), fav = useStore(A.S.fav);
  const p = A.spec.profile || {};
  const savedTab = A.spec.tabs.find((x) => x.source === "fav");
  return html`<div class="flex flex-col gap-3 pt-1">
    ${p.install && !isStandalone() ? html`<button id="p-install" class="card bg-primary/10 border border-primary/25 rounded-2xl active:scale-[.99] transition" onClick=${() => A.S.installOpen.set(true)}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:download", "text-xl text-primary")}<span class="flex-1 font-medium text-left text-primary">${T(t, "install")}</span>${Icon("lucide:chevron-right", "text-primary opacity-60")}</div></button>` : null}
    <div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-5 items-center text-center gap-1">${Icon(p.icon || "lucide:box", "text-4xl text-primary")}<div class="font-bold text-lg mt-1">${T(t, "title")}</div><div class="text-sm text-base-content/60">${T(t, "profTagline")}</div></div></div>
    ${savedTab ? html`<button class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition" onClick=${() => A.S.tab.set(savedTab.id)}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:bookmark", "text-xl")}<span class="flex-1 font-medium text-left">${T(t, savedTab.titleKey || savedTab.label)}</span><span class="badge badge-primary">${Object.keys(fav).length}</span></div></button>` : null}
    ${p.theme ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:moon", "text-xl")}<span class="flex-1 font-medium">${T(t, "profTheme")}</span><input id="p-theme" type="checkbox" class="toggle toggle-primary" checked=${theme === "signal"} onChange=${(e) => A.S.theme.set(e.target.checked ? "signal" : "signal-light")} /></div></div>` : null}
    ${p.lang ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:languages", "text-xl")}<span class="flex-1 font-medium">${T(t, "profLang")}</span><div class="join" id="p-lang">${[["uk", "UA"], ["en", "EN"]].map(([c, l]) => html`<button class=${`btn btn-sm join-item ${loc === c ? "btn-active btn-primary" : ""}`} data-loc=${c} key=${c} onClick=${() => A.S.locale.set(c)}>${l}</button>`)}</div></div></div>` : null}
    ${p.permissions?.length ? html`<button id="p-perms" class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition" onClick=${() => A.S.screen.set("perms")}><div class="card-body p-4 flex-row items-center gap-3">${Icon("lucide:shield-check", "text-xl")}<span class="flex-1 font-medium text-left">${permLabels(loc).row}</span>${Icon("lucide:chevron-right", "opacity-60")}</div></button>` : null}
    ${p.source ? html`<a href=${p.source.url} target="_blank" rel="noopener" class="card bg-base-100 border border-base-300 rounded-2xl active:scale-[.99] transition"><div class="card-body p-4 flex-row items-center gap-3">${Icon(p.source.icon || "lucide:database", "text-xl")}<span class="flex-1 font-medium">${T(t, p.source.label)}</span>${Icon("lucide:arrow-up-right", "opacity-60")}</div></a>` : null}
  </div>`;
}

// ---- permissions screen (history-backed, opened from the profile) -----------
function PermissionsScreen() {
  const loc = useStore(A.S.locale), L = permLabels(loc);
  const keys = (A.spec.profile?.permissions || []).filter((k) => PERMISSIONS[k]);
  const [states, setStates] = useState({});
  const refresh = async () => { const s = {}; for (const k of keys) s[k] = await PERMISSIONS[k].query(); setStates(s); };
  useEffect(() => {
    refresh();
    const subs = [];
    for (const k of keys) { try { navigator.permissions.query({ name: k }).then((ps) => { ps.onchange = refresh; subs.push(ps); }).catch(() => {}); } catch { /* unqueryable */ } }
    return () => subs.forEach((ps) => { ps.onchange = null; });
  }, []);
  const toggle = async (k, st) => {
    if (st === "granted") { A.toast(L.revokeHint); return; }               // can't revoke from script
    const r = await PERMISSIONS[k].request();                              // native prompt (only fires from "prompt")
    setStates((s) => ({ ...s, [k]: r }));
  };
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1" style="padding-top:env(safe-area-inset-top)">
      <button id="perms-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${L.back} onClick=${() => A.S.screen.set(null)}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight px-1">${L.title}</div>
    </header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-2 max-w-xl mx-auto">
      <p class="text-sm text-base-content/60 px-1 mb-1">${L.intro}</p>
      ${keys.map((k) => { const st = states[k] || "unknown", on = st === "granted", off = st === "unsupported"; return html`<${Fragment} key=${k}>
        <div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 flex-row items-center gap-3">
          ${Icon(PERMISSIONS[k].icon, "text-xl")}
          <span class="flex-1 font-medium">${L[k]}</span>
          ${off ? html`<span class="text-xs text-base-content/50">${L.unsupported}</span>`
            : st === "denied" ? html`<span class="badge badge-error badge-sm">${L.denied}</span>`
            : html`<input id=${"perm-" + k} type="checkbox" class="toggle toggle-primary" checked=${on} aria-label=${L[k]} onChange=${() => toggle(k, st)} />`}
        </div></div>
        ${st === "denied" ? html`<div class="text-xs text-base-content/60 px-2 -mt-1 flex items-start gap-1.5">${Icon("lucide:info", "mt-0.5 shrink-0")}${L.deniedHint}</div>` : null}
      </${Fragment}>`; })}
    </div>
  </div>`;
}

// ---- detail overlay ---------------------------------------------------------
function DetailView() {
  const t = useStore(A.S.t), it = useStore(A.S.detail), fav = useStore(A.S.fav), loc = useStore(A.S.locale);
  useStore(trTick); useStore(metaTick); // re-render as translations / previews arrive
  if (!it) return null;
  const d = A.spec.detail, on = !!fav[A.favKey(it)], close = () => A.S.detail.set(null);
  const img = d.image && it[d.image] ? html`<figure class="aspect-video bg-base-300 rounded-2xl overflow-hidden border border-base-300"><img src=${it[d.image]} alt="" class=${`w-full h-full ${d.imageFit === "cover" ? "object-cover" : "object-contain"}`}/></figure>` : null;
  const rows = (d.rows || []).map((r) => {
    // a row with a date `format` is locale-formatted from the raw timestamp; otherwise the resolved
    // (enrich/translate-aware) field value.
    const v = r.format === "when" ? whenLabel(t, it[r.field], loc) : r.format === "ago" ? ago(t, it[r.field], loc) : r.format === "since" ? sinceLabel(t, it[r.field], loc) : field(it, r.field, loc);
    return (v == null || v === "") ? null : html`<div class="flex items-start gap-3 py-3 border-b border-base-300/60 last:border-0" key=${r.field}>${r.icon ? Icon(r.icon, "text-lg text-primary/80 mt-0.5 shrink-0") : null}<div class="flex-1 min-w-0"><div class="text-xs text-base-content/60">${T(t, r.label)}</div><div class="font-medium break-words">${v}</div></div></div>`; });
  const actions = (d.actions || []).map((a) => { const href = safeHref(it[a.href]); return href ? html`<a href=${href} target="_blank" rel="noopener" class="btn btn-primary rounded-2xl w-full gap-2" key=${a.href}>${a.icon ? Icon(a.icon) : null}${T(t, a.label)} ${Icon("lucide:arrow-up-right")}</a>` : null; });
  const star = A.spec.fav ? html`<button id="detail-fav" aria-label=${on ? T(t, "unfavAria") : T(t, "favAria")} onClick=${() => A.toggleFav(it)} class=${`btn btn-ghost btn-sm btn-circle ${on ? "text-primary" : "opacity-60"}`}>${Icon(`lucide:bookmark${on ? "-check" : ""}`, "text-xl")}</button>` : null;
  return html`<div role="dialog" aria-modal="true" class="fixed inset-0 z-40 bg-base-200 overflow-y-auto" style="padding-bottom:env(safe-area-inset-bottom)">
    <header class="navbar bg-base-100 sticky top-0 z-10 border-b border-base-300 px-2 min-h-14 gap-1" style="padding-top:env(safe-area-inset-top)"><button id="detail-back" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button><div class="flex-1 font-bold tracking-tight truncate px-1">${field(it, d.title, loc) ?? ""}</div>${star}</header>
    <div class="px-4 pt-3 pb-8 flex flex-col gap-3 max-w-xl mx-auto">${img}<div><h1 class="text-2xl font-bold leading-tight break-words">${field(it, d.title, loc) ?? ""}</h1>${d.subtitle && it[d.subtitle] ? html`<div class="text-base-content/70 mt-0.5">${field(it, d.subtitle, loc)}</div>` : null}</div>${rows.some(Boolean) ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 py-1">${rows}</div></div>` : null}${actions.some(Boolean) ? html`<div class="flex flex-col gap-2">${actions}</div>` : null}</div>
  </div>`;
}

// ---- filters ----------------------------------------------------------------
function FilterChips() {
  const t = useStore(A.S.t), filters = useStore(A.S.filters);
  const f = A.spec.filters; if (!f) return null;
  const defaults = f.defaults || {}, refetch = f.refetch;
  const chips = [];
  for (const c of (f.controls || [])) {
    const v = filters[c.key], def = defaults[c.key] ?? (c.type === "toggle" ? false : "");
    if (c.type === "toggle") { if (v) chips.push({ key: c.key, label: T(t, c.label), reset: false }); continue; }
    if (c.type === "range") { const r = v || {}; if ((r.from ?? "") !== "" || (r.to ?? "") !== "") chips.push({ key: c.key, label: `${T(t, c.label)}: ${r.from ?? "…"}–${r.to ?? "…"}`, reset: {} }); continue; }
    if (v != null && v !== def) { const opt = (c.options || []).find((o) => o[0] === v); chips.push({ key: c.key, label: opt ? T(t, opt[1]) : String(v), reset: def }); }
  }
  if (!chips.length) return null;
  return html`<div class="flex flex-wrap gap-1.5 px-4 mt-2">${chips.map((ch) => html`<button class="badge badge-primary badge-outline gap-1 cursor-pointer" key=${ch.key} onClick=${() => { A.S.filters.setKey(ch.key, ch.reset); if (refetch) A.load(); }}>${ch.label} ${Icon("lucide:x", "text-xs")}</button>`)}</div>`;
}

function FilterSheet() {
  const t = useStore(A.S.t), open = useStore(A.S.sheet), filters = useStore(A.S.filters), data = useStore(A.S.data);
  const f = A.spec.filters; if (!f) return null;
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  return html`<dialog id="sheet" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.sheet.set(false)}><div class="modal-box rounded-t-3xl pb-8 flex flex-col gap-3">
    <div class="flex items-center justify-between"><h3 class="font-bold text-lg">${T(t, "filterTitle")}</h3><button class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.sheet.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    ${(f.controls || []).map((c) => {
      if (c.type === "select") return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><select id=${"f-" + c.key} class="select select-bordered rounded-2xl w-full" value=${filters[c.key] || ""} onChange=${(e) => A.S.filters.setKey(c.key, e.target.value)}>${(data.meta[c.optionsFrom] || []).map((o) => html`<option value=${o.v} key=${o.v}>${o.l}</option>`)}</select></label>`;
      if (c.type === "toggle") return html`<label class="flex items-center justify-between" key=${c.key}><span class="flex items-center gap-2">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><input id=${"f-" + c.key} type="checkbox" class="toggle toggle-primary" checked=${!!filters[c.key]} onChange=${(e) => A.S.filters.setKey(c.key, e.target.checked)} /></label>`;
      if (c.type === "range") { const r = filters[c.key] || {}; const set = (k, v) => A.S.filters.setKey(c.key, { ...(filters[c.key] || {}), [k]: v });
        return html`<label class="form-control" key=${c.key}><span class="text-sm flex items-center gap-2 mb-1">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}${c.unit ? html`<span class="text-base-content/50">(${c.unit})</span>` : null}</span><div class="flex items-center gap-2">
          <input id=${"f-" + c.key + "-from"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeFrom")} value=${r.from ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("from", e.target.value)} />
          <span class="text-base-content/40 shrink-0">–</span>
          <input id=${"f-" + c.key + "-to"} type="number" inputmode="decimal" step=${c.step || "any"} placeholder=${T(t, "rangeTo")} value=${r.to ?? ""} class="input input-bordered rounded-2xl w-full tabular-nums" onInput=${(e) => set("to", e.target.value)} />
        </div></label>`; }
      return html`<${Fragment} key=${c.key}><span class="flex items-center gap-2 text-sm">${c.icon ? Icon(c.icon) : null} ${T(t, c.label)}</span><div class="join w-full" id=${"f-" + c.key}>${c.options.map(([v, l]) => html`<button class=${`btn btn-sm join-item flex-1 ${(filters[c.key] || "") === v ? "btn-active" : ""}`} data-val=${v} key=${v} onClick=${() => A.S.filters.setKey(c.key, v)}>${T(t, l)}</button>`)}</div></${Fragment}>`;
    })}
    <button id="f-apply" class="btn btn-primary rounded-2xl mt-3" onClick=${() => { A.S.sheet.set(false); A.S.tab.set(A.spec.tabs[0].id); if (f.refetch) A.load(); }}>${T(t, "apply")}</button>
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

function InstallModal() {
  const t = useStore(A.S.t), open = useStore(A.S.installOpen), ev = useStore(A.S.installEvent);
  const ref = useRef(); useEffect(() => { const d = ref.current; if (!d) return; open ? d.showModal?.() : d.close?.(); }, [open]);
  const go = async () => { if (ev) { ev.prompt(); await ev.userChoice; A.S.installEvent.set(null); } A.S.installOpen.set(false); };
  return html`<dialog id="install" ref=${ref} class="modal modal-bottom" onClose=${() => A.S.installOpen.set(false)}><div class="modal-box rounded-t-3xl pb-8">
    <div class="flex items-center justify-between mb-3"><h3 class="font-bold text-lg flex items-center gap-2">${Icon("lucide:download", "text-primary")} ${T(t, "installTitle")}</h3><button class="btn btn-ghost btn-sm btn-circle" onClick=${() => A.S.installOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button></div>
    <div class="text-sm text-base-content/70 mb-4">${T(t, "installDesc")}</div>
    ${ev ? html`<button id="install-go" class="btn btn-primary rounded-2xl w-full gap-2" onClick=${go}>${Icon("lucide:download")} ${T(t, "installBtn")}</button>` : html`<div class="flex items-start gap-2 bg-base-200 rounded-2xl px-3 py-3 text-sm">${Icon(isIOS() ? "lucide:share" : "lucide:menu", "text-lg mt-0.5")}<span>${isIOS() ? T(t, "installIosHint") : T(t, "installGenericHint")}</span></div>`}
  </div><form method="dialog" class="modal-backdrop"><button>close</button></form></dialog>`;
}

// ---- shell ------------------------------------------------------------------
function SearchBar({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), q = useStore(A.S.query), fav = useStore(A.S.fav);
  const status = tab.source === "fav" ? T(t, "savedCount", { n: Object.keys(fav).length })
    : data.loading ? T(t, "statusLoading") : data.error ? T(t, "statusError")
    : T(t, tab.statusKey || "status", { ...(data.meta || {}) });
  return html`<div class="sticky top-14 z-20 bg-base-200 border-b border-base-300/50 px-4 pt-3 pb-2"><label class="input input-bordered flex items-center gap-2 h-11 rounded-2xl">${Icon("lucide:search", "text-lg opacity-50")}<input id="filter" type="search" class="grow" placeholder=${T(t, tab.searchKey || "search")} autocomplete="off" value=${q} onInput=${(e) => { A.S.query.set(e.target.value); if (tab.searchFetch) debouncedLoad(); }} /></label><div id="status" class="text-xs text-base-content/70 mt-1 min-h-4 px-1">${status}</div></div>`;
}

// Declarative, persisted sort control (segmented). The chosen key lives in S.sort (persistentAtom), so
// it survives reloads; ListView reads it to order items. Declared entirely at the schema level (tab.sort).
function SortBar({ tab }) {
  const t = useStore(A.S.t), cur = useStore(A.S.sort);
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="join w-full" id="sort" role="group" aria-label=${T(t, "sortAria")}>
    ${tab.sort.map((o) => html`<button class=${`btn btn-sm join-item flex-1 ${cur === o.key ? "btn-active btn-primary" : ""}`} data-sort=${o.key} key=${o.key} aria-pressed=${cur === o.key} onClick=${() => A.S.sort.set(o.key)}>${T(t, o.label)}</button>`)}
  </div></div>`;
}

function AppBar() {
  const t = useStore(A.S.t);
  return html`<header class="navbar bg-base-100 sticky top-0 z-30 border-b border-base-300 px-4 min-h-14 gap-1" style="padding-top:env(safe-area-inset-top)"><div class="flex-1"><span class="text-base font-bold tracking-tight">${T(t, "title")}</span></div>${A.spec.filters ? html`<button id="filter-btn" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "ariaFilter")} onClick=${() => A.S.sheet.set(true)}>${Icon("lucide:sliders-horizontal", "text-xl")}</button>` : null}<button id="refresh" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "refresh")} onClick=${() => A.load()}>${Icon("lucide:rotate-cw", "text-xl")}</button></header>`;
}

function Dock() {
  // Explicit flex bottom-nav (version-independent — DaisyUI 5 dropped `btm-nav`). Labels truncate so
  // 3+ tabs stay inside a watch-narrow width.
  const t = useStore(A.S.t), cur = useStore(A.S.tab);
  return html`<nav class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 z-30 flex" style="padding-bottom:env(safe-area-inset-bottom)">${A.spec.tabs.map((tab) => html`<button data-tab=${tab.id} key=${tab.id} aria-current=${cur === tab.id ? "page" : null} class=${`flex-1 flex flex-col items-center gap-0.5 py-2 min-w-0 ${cur === tab.id ? "text-primary" : "text-base-content/80"}`} onClick=${() => A.S.tab.set(tab.id)}>${Icon(tab.icon, "text-xl")}<span class="text-[0.7rem] leading-none truncate max-w-full px-1">${T(t, tab.label)}</span></button>`)}</nav>`;
}

function Toast() {
  const key = useStore(A.S.toast), t = useStore(A.S.t);
  const text = key === "saved" ? T(t, "toastSaved") : key === "removed" ? T(t, "toastRemoved") : key;
  return html`<div data-toast class="pointer-events-none" style="position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:center;padding-bottom:5.5rem"><div class=${`alert bg-neutral text-neutral-content border-0 rounded-2xl shadow-xl py-3 px-5 font-medium flex items-center gap-2 w-max transition-opacity duration-200 ${key ? "opacity-100" : "opacity-0"}`}>${Icon("lucide:check-circle", "text-success text-lg")}${text || ""}</div></div>`;
}

// ---- converter family -------------------------------------------------------
// Rate convention: rateField = value of 1 unit of this code expressed in `base` (base itself = 1).
// So from→to: result = amount * rate(from) / rate(to). data.js must normalise to this convention.
function ConverterView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), loc = useStore(A.S.locale);
  const amount = useStore(A.S.amount), from = useStore(A.S.from), to = useStore(A.S.to);
  if (data.loading) return Skeleton(false);
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  const codes = [tab.base, ...data.items.map((i) => i[tab.codeField])].filter((v, i, a) => v && a.indexOf(v) === i);
  const rate = (code) => code === tab.base ? 1 : (Number(data.items.find((i) => i[tab.codeField] === code)?.[tab.rateField]) || 0);
  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const rFrom = rate(from), rTo = rate(to);
  const result = rTo ? amt * rFrom / rTo : 0;
  const one = rTo ? rFrom / rTo : 0;
  const quick = tab.quick || ["100", "500", "1000", "5000"];
  const Sel = (id, val, onCh) => html`<select id=${id} class="select select-bordered rounded-2xl font-semibold w-24 shrink-0" value=${val} onChange=${(e) => onCh(e.target.value)}>${codes.map((c) => html`<option value=${c} key=${c}>${c}</option>`)}</select>`;
  return html`<div class="flex flex-col gap-3">
    <div class="card @container bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-4 gap-3">
      <div class="flex gap-2 items-center"><input id="conv-amount" type="text" inputmode="decimal" class="input input-bordered rounded-2xl text-lg font-semibold tabular-nums flex-1 min-w-0" value=${amount} onInput=${(e) => A.S.amount.set(e.target.value)} />${Sel("conv-from", from, (v) => A.S.from.set(v))}</div>
      <div class="flex justify-center"><button id="conv-swap" class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "swap")} onClick=${A.swap}>${Icon("lucide:arrow-up-down", "text-xl")}</button></div>
      <div class="flex gap-2 items-center"><div id="conv-result" class="input input-bordered rounded-2xl text-lg font-bold tabular-nums flex-1 min-w-0 flex items-center bg-base-200">${fmtNum(result, loc)}</div>${Sel("conv-to", to, (v) => A.S.to.set(v))}</div>
      <div class="text-xs text-base-content/80 text-center">${T(t, "perUnit2", { a: "1 " + from, rate: fmtNum(one, loc), b: to })}</div>
    </div></div>
    <div class="flex flex-wrap gap-2 justify-center">${quick.map((q) => html`<button class="btn btn-sm btn-outline rounded-full" key=${q} onClick=${() => A.S.amount.set(q)}>${q}</button>`)}</div>
  </div>`;
}

// ---- dashboard family -------------------------------------------------------
// hero reads data.meta (flattened current); strip is a horizontal scroller over a meta array;
// days is a vertical list over data.items.
function DashboardView({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), loc = useStore(A.S.locale);
  if (data.loading) return html`<div class="flex flex-col gap-3"><div class="skeleton h-44 rounded-2xl"></div><div class="skeleton h-24 rounded-2xl"></div></div>`;
  if (data.error) return Empty("lucide:cloud-off", T(t, "statusError"), T(t, "errorHint"));
  const m = data.meta || {}, h = tab.hero;
  const place = h.place && m[h.place] ? (A.spec.filters
    ? html`<button class="inline-flex items-center gap-1 text-sm text-base-content/80" onClick=${() => A.S.sheet.set(true)}>${Icon("lucide:map-pin", "text-xs")}${m[h.place]} ${Icon("lucide:chevron-down", "text-xs")}</button>`
    : html`<span class="text-sm text-base-content/80 inline-flex items-center gap-1">${Icon("lucide:map-pin", "text-xs")}${m[h.place]}</span>`) : null;
  return html`<div class="flex flex-col gap-3">
    <div class="card @container bg-gradient-to-b from-primary/15 to-base-100 border border-base-300 rounded-2xl"><div class="card-body p-5 items-center text-center gap-1">
      ${place}
      ${h.icon && m[h.icon] ? Icon(m[h.icon], "text-4xl text-primary my-1") : null}
      <div class="text-5xl font-bold tabular-nums @max-[240px]:text-4xl">${m[h.value] ?? "—"}${h.unit || ""}</div>
      ${h.caption && m[h.caption] ? html`<div class="text-sm text-base-content/80">${m[h.caption]}</div>` : null}
      ${h.metrics ? html`<div class="flex flex-wrap gap-1.5 justify-center mt-2 @max-[240px]:hidden">${h.metrics.map((mt) => html`<span class="badge badge-ghost gap-1" key=${mt.field}>${mt.icon ? Icon(mt.icon) : null}${T(t, mt.label)}: ${m[mt.field] ?? "—"}${mt.unit || ""}</span>`)}</div>` : null}
    </div></div>
    ${tab.strip && Array.isArray(m[tab.strip.from]) ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 gap-2"><div class="text-sm font-semibold px-1">${T(t, tab.strip.label)}</div><div class="flex gap-3 overflow-x-auto pb-1" tabindex="0" role="group" aria-label=${T(t, tab.strip.label)}>${m[tab.strip.from].map((s, i) => html`<div class="flex flex-col items-center gap-0.5 shrink-0 min-w-12" key=${i}><span class="text-xs text-base-content/80">${s[tab.strip.time]}</span>${tab.strip.icon && s[tab.strip.icon] ? Icon(s[tab.strip.icon], "text-lg text-primary") : null}<span class="font-semibold tabular-nums">${s[tab.strip.value]}${tab.strip.unit || ""}</span></div>`)}</div></div></div>` : null}
    ${tab.days ? html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 gap-1">${tab.days.label ? html`<div class="text-sm font-semibold px-1 mb-1">${T(t, tab.days.label)}</div>` : null}${data.items.map((d, i) => html`<div class="flex items-center gap-3 py-1.5 border-b border-base-300/50 last:border-0" key=${i}><span class="flex-1 font-medium">${d[tab.days.day]}</span>${tab.days.icon && d[tab.days.icon] ? Icon(d[tab.days.icon], "text-lg text-primary") : null}<span class="tabular-nums font-semibold">${d[tab.days.hi]}${tab.days.unit || ""}</span>${tab.days.lo ? html`<span class="tabular-nums text-base-content/80 w-9 text-right @max-[240px]:hidden">${d[tab.days.lo]}${tab.days.unit || ""}</span>` : null}</div>`)}</div></div>` : null}
  </div>`;
}

function TabView({ tab }) {
  if (tab.type === "list") return html`<${ListView} tab=${tab} />`;
  if (tab.type === "converter") return html`<${ConverterView} tab=${tab} />`;
  if (tab.type === "dashboard") return html`<${DashboardView} tab=${tab} />`;
  if (tab.type === "profile") return html`<${Profile} tab=${tab} />`;
  if (tab.type === "tool") { const V = VIEWS[tab.view]; return V ? html`<${V} t=${A.S.t.get()} tab=${tab} S=${A.S} toast=${A.toast} screen=${A.S.screen.get()} openScreen=${(s) => A.S.screen.set(s)} closeScreen=${() => A.S.screen.set(null)} />` : Empty("lucide:wrench", `view "${tab.view}" not provided`, null); }
  return Empty("lucide:construction", `${tab.type} view — coming soon`, null);
}

export function App() {
  const cur = useStore(A.S.tab), screen = useStore(A.S.screen);
  const tab = A.spec.tabs.find((x) => x.id === cur) || A.spec.tabs[0];
  return html`<${Fragment}>
    <${AppBar} />
    ${tab.type === "list" && tab.search ? html`<${SearchBar} tab=${tab} />` : null}
    ${A.spec.filters ? html`<${FilterChips} />` : null}
    ${tab.type === "list" && tab.chart ? html`<${Chart} tab=${tab} />` : null}
    ${tab.type === "list" && tab.sort ? html`<${SortBar} tab=${tab} />` : null}
    <main id="view" class="px-4 pb-24 pt-3 max-w-xl mx-auto flex flex-col gap-2.5">
      <${TabView} tab=${tab} />
    </main>
    ${A.spec.detail ? html`<${DetailView} />` : null}
    ${A.spec.filters ? html`<${FilterSheet} />` : null}
    ${screen === "perms" ? html`<${PermissionsScreen} />` : null}
    <${InstallModal} />
    <${Dock} />
    <${Toast} />
  </${Fragment}>`;
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
