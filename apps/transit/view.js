// Transits — the live zodiac wheel. Every planet's ecliptic longitude placed around the 12 signs (right
// now, or on any date via the scrubber), plus a per-planet table of sign · degree · retrograde. Pure
// astronomy, no location needed. Built on the SYSTEMIC celestial toolkit: /_rt/astro (eclipticPositions +
// Planet spheres) + /_rt/skydial (the wheel, here in fixed-ring / zodiac mode).
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { BODIES, BODY_KEYS, Planet, eclipticPositions } from "/_rt/astro.js";
import { SkyDial } from "/_rt/skydial.js";
import { Sign, RULERS } from "/_rt/zodiac.js";

const DAY = 86400000;
const norm = (d) => (((d % 360) + 360) % 360);
// standard chart orientation: 0° Aries at the left (9 o'clock), signs run COUNTER-clockwise. The dial angle
// is 0=up / clockwise, so screen angle = 270 − ecliptic longitude.
const wheelAngle = (lon) => norm(270 - lon);
const signOf = (lon) => Math.floor(norm(lon) / 30);
const degIn = (lon) => norm(lon) % 30;
const bodyLabel = (t, k) => T(t, "b" + k[0].toUpperCase() + k.slice(1));
// point on a unit dial (0=up, clockwise) as [x%, y%] — for the zodiac-ring SVG overlay
const pt = (deg, r) => { const a = deg * Math.PI / 180; return [(50 + r * Math.sin(a)).toFixed(2), (50 - r * Math.cos(a)).toFixed(2)]; };
// faint zodiac ring + 12 sign divisions (decorative SVG, theme-aware via currentColor)
const wheelOverlay = html`<svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full pointer-events-none text-base-content/25" fill="none" aria-hidden="true">
  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="0.4"></circle>
  ${Array.from({ length: 12 }, (_, i) => { const [x1, y1] = pt(norm(270 - i * 30), 40), [x2, y2] = pt(norm(270 - i * 30), 46.5); return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor" stroke-width="0.4" key=${i}></line>`; })}
</svg>`;
const CHIPS = [[-30, "mMonth"], [-7, "mWeek"], [0, "today"], [7, "pWeek"], [30, "pMonth"]];

export function transit({ S }) {
  const t = useStore(S.t), filters = useStore(S.filters), locale = useStore(S.locale);
  const [offset, setOffset] = useState(0); // days from today
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []); // keep "now" fresh

  const now = new Date();
  const date = new Date(now.getTime() + offset * DAY);
  const shown = Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS;
  const pos = eclipticPositions(date, shown);
  const prev = eclipticPositions(new Date(date.getTime() - DAY), shown);
  const prevMap = Object.fromEntries(prev.map((p) => [p.key, p.lon]));
  const isRetro = (k, lon) => { if (k === "sun" || k === "moon") return false; const pl = prevMap[k]; if (pl == null) return false; let d = lon - pl; if (d > 180) d -= 360; if (d < -180) d += 360; return d < 0; };

  // wheel marks: ecliptic longitude placed the standard way (Aries left, counter-clockwise); fixed ring
  const marks = pos.map((p) => ({ key: p.key, body: p.key, angle: wheelAngle(p.lon), value: norm(p.lon), label: bodyLabel(t, p.key) }));
  const rim = Array.from({ length: 12 }, (_, i) => ({ label: html`<${Sign} i=${i} cls="w-[18px] h-[18px]" />`, angle: wheelAngle(i * 30 + 15), cls: "text-base-content/70", rimR: 43 }));

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

  return html`<div class="flex flex-col gap-4 items-center">
    <${SkyDial} size=${360} marks=${marks} rim=${rim} center=${center} overlay=${wheelOverlay}
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
  </div>`;
}

// a uniform little planet dot (shaded + hairline) for the rulership matrix — sizes are equalised here so
// the grid stays tidy (the real spheres, size-scaled, live on the wheel).
const dot = (p) => html`<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style=${`background:${BODIES[p].color};box-shadow:inset -0.5px -0.5px 1px rgba(0,0,0,.35),0 0 0 0.5px rgba(130,130,130,.4)`}></span>`;

// Rulership matrix — toggle the planets shown on the wheel BY SIGN. Tapping a sign toggles its ruling
// planet(s) in the shared `filters.bodies`; a planet ruling two signs (e.g. Mercury → Gemini & Virgo)
// links them, which the matrix makes visible. Same filter the multi-chip control writes to.
export function rulers({ S }) {
  const t = useStore(S.t), filters = useStore(S.filters);
  const shown = new Set(Array.isArray(filters.bodies) ? filters.bodies : BODY_KEYS);
  const toggle = (i) => {
    const rs = RULERS[i], allOn = rs.every((p) => shown.has(p)), next = new Set(shown);
    rs.forEach((p) => allOn ? next.delete(p) : next.add(p));
    S.filters.setKey("bodies", BODY_KEYS.filter((k) => next.has(k)));
  };
  return html`<div class="px-4 pt-3 pb-24 max-w-xl mx-auto grid grid-cols-2 gap-2">
    ${RULERS.map((rs, i) => {
      const on = rs.every((p) => shown.has(p));
      // state via border+bg (theme-aware, always-legible text) — no opacity dimming that would sink contrast
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
