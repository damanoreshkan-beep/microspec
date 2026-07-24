import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { BODIES, BODY_KEYS, Planet, eclipticPositions, aspects } from "/_rt/astro.js";
import { SkyDial } from "/_rt/skydial.js";
import { Sign, RULERS } from "/_rt/zodiac.js";
import { interpret, warmInterpret, isInterpreted, aiTick } from "/_rt/ai.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { useSheetDrag } from "/_rt/gesture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const DAY = 86400000;
const norm = (d) => (((d % 360) + 360) % 360);
const wheelAngle = (lon) => norm(270 - lon);
const signOf = (lon) => Math.floor(norm(lon) / 30);
const degIn = (lon) => norm(lon) % 30;
const bodyLabel = (t, k) => T(t, "b" + k[0].toUpperCase() + k.slice(1));
const pt = (deg, r) => { const a = deg * Math.PI / 180; return [(50 + r * Math.sin(a)).toFixed(2), (50 - r * Math.cos(a)).toFixed(2)]; };

const RING = html`<${Fragment}>
  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="0.4"></circle>
  ${Array.from({ length: 12 }, (_, i) => { const [x1, y1] = pt(norm(270 - i * 30), 40), [x2, y2] = pt(norm(270 - i * 30), 46.5); return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor" stroke-width="0.4" key=${i}></line>`; })}
</${Fragment}>`;

const ASPECT_HUE = { soft: "var(--color-success)", hard: "var(--color-error)", neutral: "var(--color-base-content)" };
const ASPECT_DASH = { soft: "", hard: "2 2.4", neutral: "0.6 2" };
const ASPECT_KEY = { conjunction: "aspConjunction", sextile: "aspSextile", square: "aspSquare", trine: "aspTrine", opposition: "aspOpposition" };
const SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const CHIPS = [[-30, "mMonth"], [-7, "mWeek"], [0, "today"], [7, "pWeek"], [30, "pMonth"]];

const GATE_INTERP = { uk: "Сонце у квадратурі до Сатурна робить день вимогливим: амбіції наштовхуються на межі й обов'язки, тож поспіх лише додасть тертя. Ретроградний Меркурій кличе переглянути слова та рішення, а не форсувати нові. Тригон Місяця до Марса дає тиху, зібрану енергію — рухайся послідовно, і структура обернеться на опору, а не на пастку.", en: "The Sun's square to Saturn makes the day exacting: ambition meets limits and duty, so pushing only adds friction. A retrograde Mercury asks you to revise words and decisions rather than force new ones. The Moon's trine to Mars lends a quiet, gathered energy — move step by step and the structure becomes support, not a snare." };

export function transit({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), filters = useStore(S.filters), locale = useStore(S.locale);
  useStore(aiTick);                                    
  const [offset, setOffset] = useState(0);             
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []); 

  const now = new Date();
  const date = new Date(now.getTime() + offset * DAY);
  const shown = Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS;
  const pos = eclipticPositions(date, shown);
  const prev = eclipticPositions(new Date(date.getTime() - DAY), shown);
  const prevMap = Object.fromEntries(prev.map((p) => [p.key, p.lon]));
  const isRetro = (k, lon) => { if (k === "sun" || k === "moon") return false; const pl = prevMap[k]; if (pl == null) return false; let d = lon - pl; if (d > 180) d -= 360; if (d < -180) d += 360; return d < 0; };

  const asps = aspects(pos, prevMap);
  const lonOf = Object.fromEntries(pos.map((p) => [p.key, p.lon]));

  const marks = pos.map((p) => ({ key: p.key, body: p.key, angle: wheelAngle(p.lon), value: norm(p.lon), label: bodyLabel(t, p.key) }));
  const rim = Array.from({ length: 12 }, (_, i) => ({ label: html`<${Sign} i=${i} cls="w-[18px] h-[18px]" />`, angle: wheelAngle(i * 30 + 15), cls: "text-base-content/70", rimR: 43 }));
  const chords = asps.map((a, i) => {
    const [x1, y1] = pt(wheelAngle(lonOf[a.a]), 31), [x2, y2] = pt(wheelAngle(lonOf[a.b]), 31);
    return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke=${ASPECT_HUE[a.nature]} stroke-width=${a.applying ? 0.6 : 0.4} stroke-opacity=${a.applying ? 0.8 : 0.5} stroke-dasharray=${ASPECT_DASH[a.nature]} stroke-linecap="round" key=${i}></line>`;
  });
  const overlay = html`<svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full pointer-events-none" fill="none" aria-hidden="true">
    <g class="text-base-content/25">${RING}</g>${chords}
  </svg>`;

  const sunLon = pos.find((p) => p.key === "sun")?.lon;
  const fmtDate = (d) => d.toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { day: "numeric", month: "short", year: "numeric" });
  const center = html`<div class="contents">
    ${sunLon != null ? html`<div class="flex justify-center text-base-content"><${Sign} i=${signOf(sunLon)} cls="w-9 h-9" /></div><div class="text-sm font-medium mt-1">${T(t, "s" + signOf(sunLon))}</div>` : null}
    <div data-date class="text-xs text-base-content/70 mt-1 tabular-nums">${fmtDate(date)}</div>
  </div>`;

  const rows = pos.slice().sort((a, b) => norm(a.lon) - norm(b.lon)).map((p) => {
    const s = signOf(p.lon), d = Math.floor(degIn(p.lon)), r = isRetro(p.key, p.lon);
    return html`<div data-row=${p.key} class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0" key=${p.key}>
      <div class="w-20 font-medium truncate">${bodyLabel(t, p.key)}</div>
      <div class="w-6 flex justify-center text-base-content/70"><${Sign} i=${s} cls="w-5 h-5" /></div>
      <div class="flex-1 min-w-0 truncate">${T(t, "s" + s)}</div>
      <div class="tabular-nums text-base-content/70 w-9 text-right">${d}°</div>
      <div class="w-4 text-center">${r ? html`<span class="text-warning font-mono" title=${T(t, "retro")}>℞</span>` : null}</div>
    </div>`;
  });

  const posSorted = pos.slice().sort((a, b) => norm(a.lon) - norm(b.lon));
  const factLine = (p) => `${BODIES[p.key]?.name || p.key} in ${SIGN_EN[signOf(p.lon)]} ${Math.floor(degIn(p.lon))}°${isRetro(p.key, p.lon) ? " retrograde" : ""}`;
  const aspLine = (a) => `${BODIES[a.a]?.name || a.a} ${a.type} ${BODIES[a.b]?.name || a.b} (orb ${a.orb}°${a.applying == null ? "" : a.applying ? ", applying" : ", separating"})`;
  const dateEN = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const interpText = `Transits for ${dateEN}.\nPositions: ${posSorted.map(factLine).join("; ")}.\nAspects: ${asps.length ? asps.map(aspLine).join("; ") + "." : "none within orb."}`;
  const sig = `${dateEN}|${posSorted.map((p) => `${p.key}:${signOf(p.lon)}:${Math.floor(degIn(p.lon))}:${isRetro(p.key, p.lon) ? 1 : 0}`).join(",")}|${asps.map((a) => `${a.a}-${a.b}-${a.type}`).join(",")}`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 items-center">
      <${SkyDial} size=${360} marks=${marks} rim=${rim} center=${center} overlay=${overlay}
        radial=${() => 34} opacityFor=${() => 1} fan=${{ within: 8, step: 6, rim: 34, min: 16 }} />

      <!-- date scrubber (transits over time) -->
      <div class="w-full max-w-[420px] flex flex-col gap-2">
        <div class="text-center">
          <span class="text-2xl font-bold tabular-nums">${fmtDate(date)}</span>
          ${offset === 0 ? html`<span class="text-xs text-primary ml-2 align-middle">● ${T(t, "today")}</span>` : null}
        </div>
        <input id="scrub" type="range" min="-365" max="365" step="1" value=${offset} class="range range-xs range-primary" aria-label=${T(t, "dateAria")} onInput=${(e) => setOffset(Number(e.target.value))} />
        <div class="grid grid-cols-5 gap-1.5 text-center">
          ${CHIPS.map(([o, lbl]) => html`<button data-chip=${lbl} class=${`rounded-xl border py-1.5 text-xs font-medium transition ${offset === o ? "border-primary bg-primary/10" : "border-base-300"}`} onClick=${() => setOffset(o)} key=${lbl}>${T(t, lbl)}</button>`)}
        </div>
      </div>

      <!-- planets in signs (sign · degree · retrograde) — scrolls inside itself on a watch, never the page -->
      <div class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 overflow-x-auto">
        <div class="min-w-[300px] px-4 py-1.5">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70 py-1.5">${T(t, "planetsIn")}</div>
          ${rows}
        </div>
      </div>

      <!-- aspects: the angular relationships, tightest first; the header opens the AI interpretation -->
      <div class="w-full max-w-[420px] rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
        <div class="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1.5">
          <div class="text-[0.62rem] font-mono uppercase text-base-content/70">${T(t, "aspectsTitle")}</div>
          <button data-interp class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen("interp")}>
            ${Icon("lucide:sparkles", "text-base")}<span class="text-xs font-semibold">${T(t, "interpBtn")}</span>
          </button>
        </div>
        <div class="px-4 pb-2">
          ${asps.length ? asps.map((a, i) => html`<div data-aspect class="flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0" key=${i}>
            ${dot(a.a)}
            <span class="font-medium truncate max-w-[5.5rem]">${bodyLabel(t, a.a)}</span>
            <span class="text-xs font-medium shrink-0" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
            <span class="font-medium truncate max-w-[5.5rem]">${bodyLabel(t, a.b)}</span>
            ${dot(a.b)}
            <div class="ml-auto flex items-center gap-1.5 shrink-0">
              ${a.applying != null ? html`<span class=${`text-[0.6rem] font-medium ${a.applying ? "text-primary" : "text-base-content/45"}`}>${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}
              <span class="tabular-nums text-base-content/60 text-xs w-9 text-right">${a.orb.toFixed(1)}°</span>
            </div>
          </div>`) : html`<div class="py-2 text-sm text-base-content/55">${T(t, "noAspects")}</div>`}
        </div>
      </div>
    </div>

    <${InterpSheet} open=${screen === "interp"} onClose=${closeScreen} sig=${sig} input=${interpText} t=${t} loc=${locale} dateLabel=${fmtDate(date)} />
  </${Fragment}>`;
}

function InterpSheet({ open, onClose, sig, input, t, loc, dateLabel }) {
  const ref = useRef();
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  const run = () => { setFailed(false); warmInterpret(sig, input, loc); return setTimeout(() => setFailed(!isInterpreted(sig, loc)), 12000); };
  useEffect(() => {
    if (!open || gate || isInterpreted(sig, loc)) return;
    const timer = run();
    return () => clearTimeout(timer);
  }, [open, sig, loc]);
  const { boxRef, grip } = useSheetDrag(onClose);
  const done = gate || isInterpreted(sig, loc);
  const text = gate ? (GATE_INTERP[loc] || GATE_INTERP.en) : interpret(sig, loc);
  return html`<dialog id="interpsheet" ref=${ref} class="modal modal-bottom" onClose=${onClose}>
    <div ref=${boxRef} class="modal-box rounded-t-3xl pb-8 max-w-xl mx-auto">${grip}
      <div class="flex items-center gap-2 mb-3">
        ${Icon("lucide:sparkles", "text-primary")}
        <div class="min-w-0">
          <div class="font-bold text-lg leading-tight truncate">${T(t, "interpTitle")}</div>
          <div class="text-[0.68rem] font-mono uppercase tracking-wide text-base-content/50 truncate">${dateLabel}</div>
        </div>
      </div>
      ${done
        ? html`<p data-interp-text class="text-[0.97rem] leading-relaxed text-base-content/90">${text}</p>`
        : failed
          ? html`<button data-interp-retry class="btn btn-sm btn-ghost gap-2 border border-base-300 rounded-xl" onClick=${run}>${Icon("lucide:rotate-cw", "text-base")}<span class="text-sm">${T(t, "interpRetry")}</span></button>`
          : html`<div class="flex flex-col gap-2 text-base-content/55">${[30, 34, 28, 20].map((n, i) => html`<div class="text-[0.95rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

const dot = (p) => html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style=${`background:${BODIES[p].color};box-shadow:inset -0.5px -0.5px 1px rgba(0,0,0,.35),0 0 0 0.5px rgba(130,130,130,.4)`}></span>`;

export function rulers({ S }) {
  const t = useStore(S.t), filters = useStore(S.filters);
  const shown = new Set(Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS);
  const toggle = (i) => {
    const rs = RULERS[i], allOn = rs.every((p) => shown.has(p)), next = new Set(shown);
    rs.forEach((p) => allOn ? next.delete(p) : next.add(p));
    S.filters.setKey("bodies", BODY_KEYS.filter((k) => next.has(k)));
  };
  return html`<div style="padding-bottom:calc(var(--dock-h) + 1.5rem)" class="px-4 pt-3 max-w-xl mx-auto grid grid-cols-2 gap-2">
    ${RULERS.map((rs, i) => {
      const on = rs.every((p) => shown.has(p));
      return html`<button data-sign=${i} aria-pressed=${on} class=${`rounded-2xl border p-3 flex flex-col gap-2 text-left transition ${on ? "border-primary bg-primary/10" : "border-base-300 bg-transparent"}`} onClick=${() => toggle(i)} key=${i}>
        <div class="flex items-center gap-2 min-w-0">
          <${Sign} i=${i} cls=${`w-5 h-5 shrink-0 ${on ? "text-primary" : "text-base-content/50"}`} />
          <span class="font-semibold truncate">${T(t, "s" + i)}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          ${rs.map((p) => html`<span class="flex items-center gap-1.5 text-xs text-base-content/70 min-w-0" key=${p}>${dot(p)}<span class="truncate">${bodyLabel(t, p)}</span></span>`)}
        </div>
      </button>`;
    })}
  </div>`;
}
