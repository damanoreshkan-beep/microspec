// Geomagnetic storms — the live planetary Kp index (0–9) as a colour-coded gauge, the 3-day Kp forecast,
// solar-wind speed and the aurora latitude. Data from NOAA SWPC (CORS *, keyless, direct). Kp ≥ 5 = a
// geomagnetic storm on the NOAA G-scale (Kp5=G1 … Kp9=G5). Severity colour is theme-aware via light-dark().
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Loading } from "/_rt/skeleton.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
const WIND_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json";
const isGate = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const MOCK = new URLSearchParams(location.search).get("mock");

// per Kp floor 0..9: [dark-theme bright, light-theme dark] — quiet greens → storm oranges/reds → G5 purple
const KP = [["#41C06F", "#177F46"], ["#41C06F", "#177F46"], ["#41C06F", "#177F46"], ["#5FB85B", "#2E7D3A"], ["#D8B23C", "#856400"], ["#E2932F", "#985800"], ["#E7742E", "#A24810"], ["#EC5A4A", "#B63125"], ["#E0463A", "#A5291F"], ["#C94BBA", "#8E2A86"]];
const kpIdx = (kp) => Math.max(0, Math.min(9, Math.floor(kp)));
const kpFill = (kp) => KP[kpIdx(kp)][0]; // bright — for SVG shapes (gauge/bars): saturated, visible on both themes
const kpColor = (kp) => `light-dark(${KP[kpIdx(kp)][1]},${KP[kpIdx(kp)][0]})`; // theme-aware — for TEXT (contrast)
const gLevel = (kp) => kp >= 5 ? Math.min(5, Math.floor(kp) - 4) : 0;
const SEV = ["", "gMinor", "gModerate", "gStrong", "gSevere", "gExtreme"];
const auroraLat = (kp) => Math.round(67 - kp * 1.9);
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const parseUTC = (s) => new Date(String(s).endsWith("Z") ? s : s + "Z");

// gate/mock sample (a G1→G2 storm) so the shot + e2e are deterministic
function makeSample() {
  const kps = [2.33, 2.67, 3.33, 4.00, 4.67, 5.00, 5.67, 6.00, 5.33, 4.33, 3.67, 3.00];
  const base = Date.now();
  return { entries: kps.map((kp, i) => ({ time_tag: new Date(base + (i - 5) * 3 * 3600e3).toISOString().slice(0, 19), kp, observed: i <= 5 ? "observed" : "predicted" })), wind: 512 };
}

// a 270° gauge arc: track (base-300) + value arc (kpColor), proportional to Kp/9
const gauge = (kp) => {
  const R = 42, C = 2 * Math.PI * R, ARC = 0.75, frac = Math.min(1, kp / 9);
  return html`<svg viewBox="0 0 100 100" class="w-36 h-36">
    <circle cx="50" cy="50" r=${R} fill="none" class="text-base-300" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
    <circle cx="50" cy="50" r=${R} fill="none" stroke=${kpFill(kp)} stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(frac * ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
  </svg>`;
};

export function kp({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const [data, setData] = useState(isGate || MOCK ? makeSample() : null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try {
        const [kpR, wR] = await Promise.all([fetch(KP_URL), fetch(WIND_URL)]);
        if (!kpR.ok) throw 0;
        const entries = await kpR.json();
        let wind = null; try { wind = (await wR.json())?.[0]?.proton_speed ?? null; } catch { /* wind optional */ }
        if (live) { setData({ entries, wind }); setErr(false); }
      } catch { if (live) setErr(true); }
    };
    load();
    const id = setInterval(load, 120000); // Kp refreshes ~every 3h; a 2-min poll is ample
    return () => { live = false; clearInterval(id); };
  }, []);

  if (!data) {
    return err
      ? html`<div class="flex flex-col items-center text-base-content/60 py-20 gap-2 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span>${T(t, "statusError")}</span></div>`
      : html`<${Loading} />`;
  }

  const entries = (data.entries || []).filter((e) => e && e.kp != null);
  const observed = entries.filter((e) => e.observed === "observed");
  const cur = observed[observed.length - 1] || entries[entries.length - 1];
  const kpNow = Number(cur.kp), g = gLevel(kpNow);
  const ci = entries.indexOf(cur);
  const win = entries.slice(Math.max(0, ci - 4)); // recent tail + forecast
  const H = 92, yOf = (v) => H - (Math.min(9, v) / 9) * (H - 4), bw = 100 / win.length;

  // day labels at each UTC-date change within the window
  const days = []; let last = "";
  win.forEach((e, i) => { const d = parseUTC(e.time_tag); const k = d.toISOString().slice(0, 10); if (k !== last) { days.push({ x: (i + 0.5) * bw, label: d.toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { weekday: "short", day: "numeric" }) }); last = k; } });

  const stat = (icon, label, value, unit) => html`<div class="card bg-base-100 border border-base-300 rounded-2xl"><div class="card-body p-3 gap-0.5">
    <div class="text-[0.62rem] font-mono uppercase text-base-content/60 flex items-center gap-1">${Icon(icon)}${T(t, label)}</div>
    <div class="text-xl font-bold tabular-nums">${value}<span class="text-sm font-medium text-base-content/60 ml-1">${unit ? T(t, unit) : ""}</span></div>
  </div></div>`;

  return html`<div class="flex flex-col gap-4 items-center">
    <!-- current Kp gauge -->
    <div class="relative w-36 h-36 flex items-center justify-center">
      ${gauge(kpNow)}
      <div class="absolute flex flex-col items-center">
        <div data-kp class="text-4xl font-bold tabular-nums leading-none" style=${`color:${kpColor(kpNow)}`}>${kpNow.toFixed(1)}</div>
        <div class="text-[0.6rem] font-mono uppercase text-base-content/60 mt-1">Kp</div>
      </div>
    </div>
    <div class="flex flex-col items-center gap-0.5 -mt-1">
      <div class="text-lg font-bold">${g > 0 ? html`<span style=${`color:${kpColor(kpNow)}`}>G${g}</span> · ${T(t, SEV[g])}` : T(t, kpNow >= 4 ? "stActive" : "stQuiet")}</div>
      <div class="text-xs text-base-content/60">${T(t, "updated")} ${hhmm(parseUTC(cur.time_tag))}</div>
    </div>

    <!-- 3-day Kp forecast -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class="text-[0.62rem] font-mono uppercase text-base-content/60 px-1">${T(t, "forecast")}</div>
      <svg viewBox=${`0 0 100 ${H}`} class="w-full" style="height:120px" preserveAspectRatio="none">
        <line x1="0" y1=${yOf(5).toFixed(1)} x2="100" y2=${yOf(5).toFixed(1)} stroke="currentColor" stroke-width="0.4" stroke-dasharray="1.5 1.5" class="text-base-content/30"></line>
        ${win.map((e, i) => html`<rect x=${(i * bw + bw * 0.12).toFixed(2)} y=${yOf(e.kp).toFixed(2)} width=${(bw * 0.76).toFixed(2)} height=${Math.max(0.6, H - yOf(e.kp)).toFixed(2)} rx="0.5" fill=${kpFill(e.kp)} opacity=${e.observed === "observed" ? "0.5" : "1"} key=${i}></rect>`)}
      </svg>
      <div class="relative h-4 text-[0.55rem] font-mono text-base-content/60">
        ${days.map((d, i) => html`<span class="absolute -translate-x-1/2 whitespace-nowrap" style=${`left:${Math.min(94, Math.max(6, d.x)).toFixed(1)}%`} key=${i}>${d.label}</span>`)}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 w-full max-w-[420px]">
      ${stat("lucide:wind", "wind", data.wind != null ? Math.round(data.wind) : "—", "kms")}
      ${stat("lucide:sparkles", "aurora", "~" + auroraLat(kpNow) + "°", null)}
    </div>
  </div>`;
}
