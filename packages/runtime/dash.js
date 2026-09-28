import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T } from "./i18n.js";
import { Scramble, Pixels, useReveal } from "./skeleton.js";
import { curvePath } from "./weather.js";
import { A, Icon, Empty, Skeleton } from "./render-ctx.js";

const fmtNum = (n, loc) => new Intl.NumberFormat(loc === "uk" ? "uk-UA" : "en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0);

export function ConverterView({ tab }) {
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

export function DashboardView({ tab }) {
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
