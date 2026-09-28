import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T, ago, whenLabel, sinceLabel } from "./i18n.js";
import { warm, trTick } from "./translate.js";
import { Scramble, useReveal } from "./skeleton.js";
import { warmMeta, metaTick } from "./enrich.js";
import { A, Icon, field, fieldNode, safeHref, debouncedLoad, Empty, Skeleton } from "./render-ctx.js";

const searchText = (it) => Object.values(it).map((v) => Array.isArray(v) ? v.join(" ") : v).join(" ").toLowerCase();

function test(it, fav, expr) {
  if (!expr) return true;
  const neg = expr.startsWith("!");
  const key = neg ? expr.slice(1) : expr;
  const truthy = key === "fav" ? !!fav[A.favKey(it)] : !!it[key];
  return neg ? !truthy : truthy;
}

const metaText = (meta, it, dict, loc) => {
  if (!meta) return "";
  if (typeof meta === "string") return it[meta] ?? "";
  const v = it[meta.field];
  return v == null ? "" : (meta.format === "ago" ? ago(dict, v, loc) : meta.format === "when" ? whenLabel(dict, v, loc, true, meta.precision ? it[meta.precision] : undefined) : meta.format === "since" ? sinceLabel(dict, v, loc) : String(v));
};
const isTimeFmt = (fmt) => fmt === "ago" || fmt === "when" || fmt === "since";

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

export function Chart({ tab }) {
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

export function ListView({ tab }) {
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

const statusOf = (t, tab, data, q, fav) => tab.source === "fav" ? T(t, "savedCount", { n: Object.keys(fav).length })
  : data.loading ? T(t, "statusLoading") : data.error ? T(t, "statusError")
  : (tab.browse && !q) ? ""
  : T(t, tab.statusKey || "status", { ...(data.meta || {}) });
export function SearchField({ tab }) {
  const t = useStore(A.S.t), data = useStore(A.S.data), q = useStore(A.S.query), fav = useStore(A.S.fav);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const onInput = (e) => { A.S.query.set(e.target.value); if (tab.searchFetch) debouncedLoad(); };
  return html`<label data-search class="flex-1 min-w-0 flex items-center gap-2 h-9">${Icon("lucide:search", "text-lg opacity-50 shrink-0")}<input id="filter" ref=${ref} type="search" class="grow min-w-0 bg-transparent text-base border-0 outline-none appearance-none focus:outline-none focus:ring-0 shadow-none placeholder:text-base-content/45 [&::-webkit-search-cancel-button]:hidden" placeholder=${T(t, tab.searchKey || "search")} autocomplete="off" value=${q} onInput=${onInput} /><span id="status" class="font-mono text-xs text-muted shrink-0 max-w-[38%] truncate">${statusOf(t, tab, data, q, fav)}</span></label>`;
}

export function SegmentBar({ tab }) {
  const t = useStore(A.S.t), cur = useStore(A.S.seg);
  const active = tab.segments.some((s) => s.key === cur) ? cur : tab.segments[0].key;
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="join w-full" id="segments" role="tablist" aria-label=${T(t, "segAria")}>
    ${tab.segments.map((s) => html`<button class=${`btn btn-sm join-item flex-1 gap-1.5 ${active === s.key ? "btn-active btn-primary" : ""}`} data-seg=${s.key} role="tab" aria-selected=${active === s.key} key=${s.key} onClick=${() => A.S.seg.set(s.key)}>${s.icon ? Icon(s.icon) : null}${T(t, s.label)}</button>`)}
  </div></div>`;
}

export function SortBar({ tab }) {
  const t = useStore(A.S.t), cur = useStore(A.S.sort);
  return html`<div class="px-4 pt-3 max-w-xl mx-auto w-full"><div class="join w-full" id="sort" role="group" aria-label=${T(t, "sortAria")}>
    ${tab.sort.map((o) => html`<button class=${`btn btn-sm join-item flex-1 ${cur === o.key ? "btn-active btn-primary" : ""}`} data-sort=${o.key} key=${o.key} aria-pressed=${cur === o.key} onClick=${() => A.S.sort.set(o.key)}>${T(t, o.label)}</button>`)}
  </div></div>`;
}

export function TogglesBar({ tab }) {
  const t = useStore(A.S.t), tog = useStore(A.S.toggles);
  const on = (k) => tog[k] !== false;
  return html`<div class="px-4 pt-2 max-w-xl mx-auto w-full"><div class="flex gap-1.5 overflow-x-auto" id="toggles" role="group" aria-label=${T(t, "scanAria")}>
    ${tab.toggles.map((o) => html`<button class=${`btn btn-xs gap-1 shrink-0 rounded-full ${on(o.key) ? "btn-primary" : "btn-ghost sf-inset text-base-content/70"}`} data-toggle=${o.key} aria-pressed=${on(o.key)} key=${o.key} onClick=${() => A.S.toggles.set({ ...A.S.toggles.get(), [o.key]: !on(o.key) })}>${o.icon ? Icon(o.icon, "text-sm") : null}${T(t, o.label)}</button>`)}
  </div></div>`;
}
