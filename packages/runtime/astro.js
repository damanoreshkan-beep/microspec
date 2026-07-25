import { html } from "htm/preact";
import _SunCalc from "https://esm.sh/suncalc@1.9.0";
import * as Astro from "https://esm.sh/astronomy-engine@2";
import { houses as Houses, exactHits, SCAN_STEP, HIT_WINDOW } from "./natal.js";
const SunCalc = _SunCalc.default || _SunCalc;

export const BODIES = {
  sun: { name: "Sun", color: "#FDB813", size: 20, glow: true },
  moon: { name: "Moon", color: "#CFCFD6", size: 10 },
  mercury: { name: "Mercury", color: "#9A948C", size: 9 },
  venus: { name: "Venus", color: "#E7D8A6", size: 12 },
  mars: { name: "Mars", color: "#D9603B", size: 10 },
  jupiter: { name: "Jupiter", color: "#D6A15B", size: 17 },
  saturn: { name: "Saturn", color: "#E3C878", size: 14, ring: true },
  uranus: { name: "Uranus", color: "#9FE0DC", size: 12 },
  neptune: { name: "Neptune", color: "#5B7FD1", size: 12 },
  pluto: { name: "Pluto", color: "#B79A7E", size: 8 },
};
export const BODY_KEYS = Object.keys(BODIES);

const _rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const _shift = (h, t, tgt) => `rgb(${_rgb(h).map((x) => Math.round(x + (tgt - x) * t)).join(",")})`;
export const lighten = (h) => _shift(h, 0.5, 255);
export const darken = (h) => _shift(h, 0.42, 0);

const disc = (c) => {
  const glow = c.glow ? `,0 0 ${Math.round(c.size * 0.8)}px ${Math.round(c.size * 0.22)}px ${c.color}88` : "";
  return html`<div class="rounded-full" style=${`width:${c.size}px;height:${c.size}px;background:radial-gradient(circle at 33% 28%, ${lighten(c.color)}, ${c.color} 55%, ${darken(c.color)});box-shadow:inset -1px -1px 1.5px rgba(0,0,0,.42),0 0 0 0.5px rgba(130,130,130,.35)${glow}`}></div>`;
};

export function Planet({ body }) {
  const c = BODIES[body];
  if (!c) return null;
  if (!c.ring) return disc(c);
  return html`<div class="relative flex items-center justify-center" style=${`width:${c.size * 2.1}px;height:${c.size * 2.1}px`}><div class="absolute" style=${`width:${c.size * 2.1}px;height:${c.size * 0.72}px;border:1.4px solid ${lighten(c.color)};border-radius:50%;opacity:.8;transform:rotate(-18deg)`}></div>${disc(c)}</div>`;
}

export function sunHorizon(lat, lng, date) {
  const p = SunCalc.getPosition(date, lat, lng);
  return { az: (180 + p.azimuth * 180 / Math.PI + 360) % 360, alt: p.altitude * 180 / Math.PI };
}

export function skyPositions(lat, lng, date, keys = BODY_KEYS, { aboveHorizon = true } = {}) {
  const out = [];
  if (keys.includes("sun")) out.push({ key: "sun", ...sunHorizon(lat, lng, date) });
  try {
    const obs = new Astro.Observer(lat, lng, 0), time = new Astro.AstroTime(date);
    for (const k of keys) {
      if (k === "sun" || !BODIES[k]) continue;
      const eq = Astro.Equator(BODIES[k].name, time, obs, true, true);
      const h = Astro.Horizon(time, obs, eq.ra, eq.dec, "normal");
      out.push({ key: k, az: h.azimuth, alt: h.altitude });
    }
  } catch {  }
  return aboveHorizon ? out.filter((m) => m.key === "sun" || m.alt > 0) : out;
}

export function eclipticPositions(date, keys = BODY_KEYS) {
  const out = [];
  try {
    const time = new Astro.AstroTime(date);
    for (const k of keys) {
      if (!BODIES[k]) continue;
      const ecl = Astro.Ecliptic(Astro.GeoVector(BODIES[k].name, time, true));
      out.push({ key: k, lon: (ecl.elon + 360) % 360 });
    }
  } catch {  }
  return out;
}

export const sunTimes = (lat, lng, date) => SunCalc.getTimes(date, lat, lng);

export { ASPECTS, aspects } from "./aspects.js";


export function chartFrame(date, lng) {
  const t = new Astro.AstroTime(date);
  return { ramc: (((Astro.SiderealTime(t) * 15 + lng) % 360) + 360) % 360, eps: Astro.e_tilt(t).tobl };
}

export function natalHouses(date, lat, lng, system = "placidus") {
  const { ramc, eps } = chartFrame(date, lng);
  return { ...Houses(ramc, eps, lat, system), ramc, eps };
}

export const bodyLonAt = (key) => (ms) => {
  const b = BODIES[key];
  if (!b) return NaN;
  return (Astro.Ecliptic(Astro.GeoVector(b.name, new Astro.AstroTime(new Date(ms)), true)).elon + 360) % 360;
};

export function hitTimes(key, natalLon, angle, aroundMs, opts = {}) {
  const w = HIT_WINDOW[key] || 400 * 864e5;
  return exactHits(bodyLonAt(key), natalLon, angle, aroundMs - w, aroundMs + w,
    { step: SCAN_STEP[key] || 864e5, ...opts });
}

export * from "./natal.js";
