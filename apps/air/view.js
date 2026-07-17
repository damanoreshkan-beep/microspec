// Air Quality — the live European Air Quality Index (EAQI 0–100+) for Kyiv as a colour-coded gauge, a
// 24-hour forecast, the key pollutants each banded by its own EEA sub-index, and the pollen forecast.
// Data from Open-Meteo Air Quality (CAMS Europe; CORS *, keyless, direct). Band colour is theme-aware via
// light-dark(); the banding maths lives in /_rt/air.js (unit-tested), not here.
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, Pixels, useReveal } from "/_rt/skeleton.js";
import { eaqiBand, pollutantBand, pollenBand } from "/_rt/air.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LAT = 50.45, LNG = 30.52; // Kyiv
const URL_ = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LNG}` +
  "&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen" +
  "&hourly=european_aqi&timezone=auto&forecast_days=2";
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

// per band 0..5: [dark-theme bright (SVG fills — saturated, visible on both), light-theme dark (text)]
// good green → fair lime → moderate yellow → poor orange → very-poor red → extreme purple (EEA ramp)
const AQ = [["#41C06F", "#177F46"], ["#9BCB3C", "#5A7D14"], ["#E4C13A", "#8A6D00"], ["#E7742E", "#A24810"], ["#EC5A4A", "#B63125"], ["#C94BBA", "#8E2A86"]];
const clamp = (b, n) => Math.max(0, Math.min(n, b));
const fillFor = (b) => AQ[clamp(b, 5)][0];                                   // SVG shapes
const inkFor = (b) => `light-dark(${AQ[clamp(b, 5)][1]},${AQ[clamp(b, 5)][0]})`; // text
const AQI_KEYS = ["aqiGood", "aqiFair", "aqiModerate", "aqiPoor", "aqiVeryPoor", "aqiExtreme"];
// pollen band 0..4 → an AQ colour (none = muted, no colour); low green, moderate yellow, high orange, v.high red
const POLLEN_INK = [null, inkFor(0), inkFor(2), inkFor(3), inkFor(4)];
const POLLEN_DOT = [null, fillFor(0), fillFor(2), fillFor(3), fillFor(4)];
const POLLEN_KEYS = ["pnNone", "pnLow", "pnModerate", "pnHigh", "pnVeryHigh"];

const POLLUTANTS = [
  { sp: "pm2_5", f: "pm2_5", label: "PM2.5" },
  { sp: "pm10", f: "pm10", label: "PM10" },
  { sp: "o3", f: "ozone", label: "O₃" },
  { sp: "no2", f: "nitrogen_dioxide", label: "NO₂" },
  { sp: "so2", f: "sulphur_dioxide", label: "SO₂" },
];
const POLLENS = [
  { f: "grass_pollen", sp: "grass", key: "pGrass" },
  { f: "birch_pollen", sp: "birch", key: "pBirch" },
  { f: "mugwort_pollen", sp: "mugwort", key: "pMugwort" },
  { f: "ragweed_pollen", sp: "ragweed", key: "pRagweed" },
  { f: "alder_pollen", sp: "alder", key: "pAlder" },
  { f: "olive_pollen", sp: "olive", key: "pOlive" },
];

const hhmm = (iso) => String(iso).slice(11, 16);

// gate/mock sample — a "very poor" ozone day with active summer pollen, so the shot exercises the whole
// colour ramp and the widest band word, and e2e is deterministic.
function makeSample() {
  const base = "2026-07-17T";
  const wave = [72, 68, 61, 55, 58, 66, 79, 88, 92, 86, 78, 70]; // 12 × 2h ≈ 24h
  const hours = Array.from({ length: 24 }, (_, i) => ({
    time: `${base}${String(i).padStart(2, "0")}:00`,
    aqi: wave[Math.floor(i / 2)] ?? 70,
  }));
  return {
    current: {
      time: `${base}14:00`,
      european_aqi: 88, pm2_5: 42, pm10: 68, ozone: 260, nitrogen_dioxide: 55, sulphur_dioxide: 12,
      grass_pollen: 85, birch_pollen: 0, mugwort_pollen: 18, ragweed_pollen: 6, alder_pollen: 0, olive_pollen: 0,
    },
    hours,
  };
}

// a 270° gauge arc: track (base-300) + value arc (fill), proportional to AQI/100 (capped)
const gauge = (aqi, band) => {
  const R = 42, C = 2 * Math.PI * R, ARC = 0.75, frac = Math.min(1, aqi / 100);
  return html`<svg viewBox="0 0 100 100" class="w-36 h-36" aria-hidden="true">
    <circle cx="50" cy="50" r=${R} fill="none" class="text-base-300" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
    <circle cx="50" cy="50" r=${R} fill="none" stroke=${fillFor(band)} stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(frac * ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
  </svg>`;
};

export function air({ S }) {
  const t = useStore(S.t);
  const [data, setData] = useState(isGate || MOCK ? makeSample() : null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(URL_);
        if (!r.ok) throw 0;
        const d = await r.json();
        const start = Math.max(0, (d.hourly?.time || []).findIndex((x) => x >= d.current.time));
        const hours = (d.hourly?.time || []).slice(start, start + 24).map((time, i) => ({
          time, aqi: d.hourly.european_aqi[start + i],
        }));
        if (live) { setData({ current: d.current, hours }); setErr(false); }
      } catch { if (live) setErr(true); }
    };
    load();
    const id = setInterval(load, 300000); // air quality moves slowly; a 5-min poll is ample
    return () => { live = false; clearInterval(id); };
  }, []);

  const ready = useReveal(!!data);
  if (err && !data) return html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-2 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span>${T(t, "statusError")}</span></div>`;
  // structure-shaped skeleton: gauge ring + forecast band + two stat lists, with decoding value slots
  if (!ready) return html`<div class="flex flex-col gap-5 items-center">
    <div class="w-36 h-36 rounded-full border-[6px] border-base-300 flex items-center justify-center"><span class="text-5xl font-bold tabular-nums text-base-content/40"><${Scramble} len=${2} /></span></div>
    <div class="text-lg font-bold text-base-content/50"><${Scramble} len=${10} /></div>
    <div class="w-full max-w-[420px] h-28 rounded-2xl overflow-hidden border border-base-300"><${Pixels} /></div>
    <div class="w-full max-w-[420px] flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div class="flex items-center justify-between text-base-content/50 border-b border-base-300/50 pb-2" key=${i}><${Scramble} len=${7} /><${Scramble} len=${5} /></div>`)}</div>
  </div>`;

  const c = data.current;
  const aqi = Math.round(c.european_aqi ?? 0), band = eaqiBand(c.european_aqi);

  // 24h forecast bars, scaled so a spike above 100 still fits
  const hrs = data.hours || [];
  const H = 84, cap = Math.max(100, ...hrs.map((h) => h.aqi || 0)), yOf = (v) => H - (Math.min(cap, v) / cap) * (H - 4), bw = hrs.length ? 100 / hrs.length : 100;
  const ticks = hrs.map((h, i) => ({ i, label: hhmm(h.time) })).filter((_, i) => i % 6 === 0);

  const active = POLLENS.map((p) => ({ ...p, v: c[p.f] })).filter((p) => p.v != null && p.v > 0).sort((a, b2) => b2.v - a.v);

  return html`<div class="flex flex-col gap-5 items-center">
    <!-- current AQI gauge -->
    <div class="relative w-36 h-36 flex items-center justify-center">
      ${gauge(aqi, band)}
      <div class="absolute flex flex-col items-center">
        <div data-aqi class="text-5xl font-bold tabular-nums leading-none" style=${`color:${inkFor(band)}`}>${aqi}</div>
        <div class="text-[0.6rem] font-mono uppercase text-base-content/60 mt-1">AQI</div>
      </div>
    </div>
    <div class="flex flex-col items-center gap-0.5 -mt-2 text-center px-4">
      <div class="text-lg font-bold" style=${`color:${inkFor(band)}`}>${T(t, AQI_KEYS[clamp(band, 5)])}</div>
      <div class="text-xs text-base-content/60">${T(t, "place")} · ${T(t, "updated")} ${hhmm(c.time)}</div>
    </div>

    <!-- 24-hour forecast -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60 px-1">${T(t, "forecastLabel")}</div>
      <svg viewBox=${`0 0 100 ${H}`} class="w-full" style="height:96px" preserveAspectRatio="none">
        ${hrs.map((h, i) => html`<rect x=${(i * bw + bw * 0.12).toFixed(2)} y=${yOf(h.aqi).toFixed(2)} width=${(bw * 0.76).toFixed(2)} height=${Math.max(0.6, H - yOf(h.aqi)).toFixed(2)} rx="0.5" fill=${fillFor(eaqiBand(h.aqi))} key=${i}></rect>`)}
      </svg>
      <div class="relative h-4 text-[0.55rem] font-mono text-base-content/60">
        ${ticks.map((d) => html`<span class="absolute -translate-x-1/2 whitespace-nowrap" style=${`left:${Math.min(94, Math.max(4, (d.i + 0.5) * bw)).toFixed(1)}%`} key=${d.i}>${d.label}</span>`)}
      </div>
    </div>

    <!-- pollutants: each value coloured by its own EEA sub-index band -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60 px-1 mb-0.5">${T(t, "pollutantsLabel")}</div>
      ${POLLUTANTS.map((p) => {
        const v = c[p.f], pb = pollutantBand(p.sp, v);
        return html`<div class="flex items-baseline gap-3 py-1.5 border-b border-base-300/50 last:border-0" key=${p.sp}>
          <span class="font-mono text-sm font-semibold w-16 shrink-0">${p.label}</span>
          <span class="flex-1"></span>
          <span class="tabular-nums font-bold text-lg" style=${pb >= 0 ? `color:${inkFor(pb)}` : ""}>${v != null ? Math.round(v) : "—"}</span>
          <span class="text-xs text-base-content/60 w-14 shrink-0">µg/m³</span>
        </div>`;
      })}
    </div>

    <!-- pollen: active species, banded -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60 px-1 mb-0.5">${T(t, "pollenLabel")}</div>
      ${active.length ? active.map((p) => {
        const pb = pollenBand(p.sp, p.v);
        return html`<div class="flex items-center gap-3 py-1.5 border-b border-base-300/50 last:border-0" key=${p.sp}>
          <span class="w-2 h-2 rounded-full shrink-0" style=${`background:${POLLEN_DOT[pb] || "var(--fallback-bc,currentColor)"}`}></span>
          <span class="font-medium truncate flex-1 min-w-0">${T(t, p.key)}</span>
          <span class="text-sm font-semibold" style=${POLLEN_INK[pb] ? `color:${POLLEN_INK[pb]}` : ""}>${T(t, POLLEN_KEYS[pb])}</span>
          <span class="tabular-nums text-xs text-base-content/60 w-20 text-right shrink-0">${Math.round(p.v)} ${T(t, "grains")}</span>
        </div>`;
      }) : html`<div class="flex items-center gap-2 py-1.5 text-base-content/60"><span class="w-2 h-2 rounded-full bg-base-content/30 shrink-0"></span><span>${T(t, "pnNone")}</span></div>`}
    </div>
  </div>`;
}
