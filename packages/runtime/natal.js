
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const norm360 = (d) => (((d % 360) + 360) % 360);
export const wrap180 = (d) => { const x = norm360(d); return x > 180 ? x - 360 : x; };
const sin = (d) => Math.sin(d * D2R), cos = (d) => Math.cos(d * D2R), tan = (d) => Math.tan(d * D2R);


const _dtf = new Map();
export function zoneOffset(ts, zone) {
  let f = _dtf.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", era: "narrow",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    _dtf.set(zone, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ts))) p[type] = value;
  const year = p.era === "B" ? 1 - (+p.year) : +p.year;
  const asUTC = Date.UTC(year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const fix = year >= 0 && year <= 99 ? Date.UTC(year, 0, 1) - Date.UTC(year + 1900, 0, 1) : 0;
  return (asUTC + fix) - Math.floor(ts / 1000) * 1000;
}

export const lmtOffset = (lng) => Math.round(lng * 240000);          

export function knownZone(zone) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

export function zonedToUTC(wall, zone) {
  const { y, mo = 1, d = 1, h = 0, mi = 0, s = 0, ms = 0 } = wall;
  let base = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (y >= 0 && y <= 99) base += Date.UTC(y, 0, 1) - Date.UTC(y + 1900, 0, 1);   
  if (zone && typeof zone === "object" && Number.isFinite(zone.offsetMs)) {
    return { ms: base - zone.offsetMs, offset: zone.offsetMs, ambiguous: false, nonexistent: false, zone: null };
  }
  if (!knownZone(zone)) return null;
  let ts = base - zoneOffset(base, zone);
  for (let i = 0; i < 3; i++) {
    const off = zoneOffset(ts, zone);
    const next = base - off;
    if (next === ts) break;
    ts = next;
  }
  const off = zoneOffset(ts, zone);
  const nonexistent = base - off !== ts;                    
  let ambiguous = false;
  const earlyOff = zoneOffset(ts - 7200000, zone);
  if (!nonexistent && earlyOff !== off && base - earlyOff < ts && zoneOffset(base - earlyOff, zone) === earlyOff) {
    ambiguous = true;
    return { ms: base - earlyOff, offset: earlyOff, ambiguous, nonexistent, zone };
  }
  return { ms: ts, offset: off, ambiguous, nonexistent, zone };
}

export function parseOffset(str) {
  if (str == null) return null;
  const t = String(str).trim();
  if (!t) return null;
  if (/^z$/i.test(t)) return 0;
  const m = /^([+-])(\d{1,2}):?(\d{2})(?::?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const hh = +m[2], mm = +m[3], ss = +(m[4] || 0);
  if (hh > 14 || mm > 59 || ss > 59) return null;
  return (m[1] === "-" ? -1 : 1) * ((hh * 3600 + mm * 60 + ss) * 1000);
}

export function formatOffset(ms) {
  if (!Number.isFinite(ms)) return "";
  const sign = ms < 0 ? "-" : "+", a = Math.abs(ms) / 1000;
  const p = (n) => String(Math.floor(n)).padStart(2, "0");
  const ss = Math.round(a % 60);
  return `${sign}${p(a / 3600)}:${p((a % 3600) / 60)}${ss ? ":" + p(ss) : ""}`;
}


export const lonAtRA = (ra, eps) => norm360(Math.atan2(sin(ra), cos(ra) * cos(eps)) * R2D);

export const midheaven = (ramc, eps) => lonAtRA(ramc, eps);

export const ascendant = (ramc, eps, phi) =>
  norm360(Math.atan2(cos(ramc), -(sin(ramc) * cos(eps) + tan(phi) * sin(eps))) * R2D);

export const vertex = (ramc, eps, phi) =>
  ascendant(norm360(ramc + 180), eps, (phi >= 0 ? 90 : -90) - phi);

export const placidusDefined = (eps, phi) => Math.abs(tan(phi) * tan(eps)) < 1;

function placidusCusp(ramc, eps, phi, offset, f, diurnal) {
  const k = tan(phi) * tan(eps);
  let ra = norm360(ramc + offset + (diurnal ? f * 90 : -f * 90));    
  for (let i = 0; i < 200; i++) {
    const x = -sin(ra) * k;
    if (Math.abs(x) > 1) return null;                                
    const dsa = Math.acos(x) * R2D;
    const sa = diurnal ? dsa : 180 - dsa;
    const next = norm360(ramc + offset + (diurnal ? f * sa : -f * sa));
    const step = Math.abs(wrap180(next - ra));
    ra = next;
    if (step < 1e-11) return lonAtRA(ra, eps);
  }
  return null;                                                       
}

function porphyryCusps(asc, mc) {
  const c = new Array(12);
  const q1 = norm360(asc - mc) / 3;                  
  const q2 = norm360(norm360(mc + 180) - asc) / 3;   
  c[0] = asc; c[1] = norm360(asc + q2); c[2] = norm360(asc + 2 * q2);
  c[9] = mc; c[10] = norm360(mc + q1); c[11] = norm360(mc + 2 * q1);
  c[3] = norm360(c[9] + 180); c[4] = norm360(c[10] + 180); c[5] = norm360(c[11] + 180);
  c[6] = norm360(c[0] + 180); c[7] = norm360(c[1] + 180); c[8] = norm360(c[2] + 180);
  return c;
}

export const HOUSE_SYSTEMS = ["placidus", "whole", "equal", "porphyry"];

export function houses(ramc, eps, phi, system = "placidus") {
  const asc = ascendant(ramc, eps, phi), mc = midheaven(ramc, eps), vtx = vertex(ramc, eps, phi);
  const base = { asc, mc, vertex: vtx, fallback: null };
  if (system === "whole") {
    const start = Math.floor(norm360(asc) / 30) * 30;
    return { ...base, system, cusps: Array.from({ length: 12 }, (_, i) => norm360(start + i * 30)) };
  }
  if (system === "equal") {
    return { ...base, system, cusps: Array.from({ length: 12 }, (_, i) => norm360(asc + i * 30)) };
  }
  if (system === "porphyry") return { ...base, system, cusps: porphyryCusps(asc, mc) };

  if (placidusDefined(eps, phi)) {
    const c11 = placidusCusp(ramc, eps, phi, 0, 1 / 3, true);
    const c12 = placidusCusp(ramc, eps, phi, 0, 2 / 3, true);
    const c2 = placidusCusp(ramc, eps, phi, 180, 2 / 3, false);
    const c3 = placidusCusp(ramc, eps, phi, 180, 1 / 3, false);
    if (c11 != null && c12 != null && c2 != null && c3 != null) {
      const cusps = [asc, c2, c3, norm360(mc + 180), norm360(c11 + 180), norm360(c12 + 180),
        norm360(asc + 180), norm360(c2 + 180), norm360(c3 + 180), mc, c11, c12];
      return { ...base, system: "placidus", cusps };
    }
  }
  return { ...base, system: "porphyry", fallback: "placidus", cusps: porphyryCusps(asc, mc) };
}

export function houseOf(lon, cusps) {
  if (!cusps || cusps.length !== 12) return null;
  const l = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const span = norm360(cusps[(i + 1) % 12] - cusps[i]);
    if (norm360(l - cusps[i]) < (span || 360)) return i + 1;
  }
  return 12;
}


export const TRANSIT_ORB = { exact: 1, range: 3 };

export const TRANSIT_ASPECTS = [
  { type: "conjunction", angle: 0, nature: "neutral" },
  { type: "sextile", angle: 60, nature: "soft" },
  { type: "square", angle: 90, nature: "hard" },
  { type: "trine", angle: 120, nature: "soft" },
  { type: "opposition", angle: 180, nature: "hard" },
];

export const separation = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

export function transitAspect(transitLon, natalLon, orb = TRANSIT_ORB.range) {
  const s = separation(transitLon, natalLon);
  const ahead = wrap180(transitLon - natalLon) >= 0;
  for (const a of TRANSIT_ASPECTS) {
    const delta = Math.abs(s - a.angle);
    if (delta <= orb) {
      return { ...a, orb: delta, exact: delta <= TRANSIT_ORB.exact, signedAngle: ahead ? a.angle : -a.angle };
    }
  }
  return null;
}

export function transits(transiting, natal, { orb = TRANSIT_ORB.range, prev = null } = {}) {
  const out = [];
  for (const t of transiting) {
    if (t.lon == null) continue;
    for (const n of natal) {
      if (n.lon == null) continue;
      const a = transitAspect(t.lon, n.lon, orb);
      if (!a) continue;
      let applying = null;
      const p = prev && prev[t.key];
      if (p != null) applying = Math.abs(separation(p, n.lon) - a.angle) > a.orb;
      out.push({ t: t.key, n: n.key, type: a.type, nature: a.nature, angle: a.angle, signedAngle: a.signedAngle,
        natalLon: n.lon, orb: +a.orb.toFixed(3), exact: a.exact, applying });
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

export const HIT_PRECISION = {
  sun: "second", moon: "second", mercury: "second", venus: "second", mars: "second",
  jupiter: "minute", saturn: "minute", uranus: "day", neptune: "day", pluto: "day",
};
export const SCAN_STEP = {
  moon: 36e5, sun: 216e5, mercury: 216e5, venus: 432e5, mars: 864e5,
  jupiter: 2592e5, saturn: 3456e5, uranus: 8640e5, neptune: 12960e5, pluto: 12960e5,
};
const DAY_MS = 864e5;
export const HIT_WINDOW = {
  moon: 3 * DAY_MS, sun: 60 * DAY_MS, mercury: 60 * DAY_MS, venus: 90 * DAY_MS, mars: 400 * DAY_MS,
  jupiter: 800 * DAY_MS, saturn: 1100 * DAY_MS, uranus: 2600 * DAY_MS, neptune: 3600 * DAY_MS, pluto: 4400 * DAY_MS,
};

export function exactHits(lonAt, natalLon, angle, fromMs, toMs, { step = 864e5, tolMs = 1000, max = 8 } = {}) {
  const f = (ms) => wrap180(lonAt(ms) - natalLon - angle);
  const hits = [];
  let t0 = fromMs, f0 = f(t0);
  while (t0 < toMs && hits.length < max) {
    const t1 = Math.min(t0 + step, toMs), f1 = f(t1);
    if (f0 === 0) hits.push(t0);
    else if (f0 * f1 < 0 && Math.abs(f1 - f0) < 90) {
      let lo = t0, hi = t1, flo = f0;
      while (hi - lo > tolMs) {
        const mid = lo + Math.floor((hi - lo) / 2), fm = f(mid);
        if (fm === 0) { lo = hi = mid; break; }
        if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
      }
      hits.push(lo + Math.round((hi - lo) / 2));
    }
    t0 = t1; f0 = f1;
  }
  return hits;
}
