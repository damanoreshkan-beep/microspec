// microspec runtime — the natal chart: birth instant, angles, houses (SYSTEMIC, pure).
//
// Transits mean nothing without a natal chart, and a natal chart means nothing without the birth INSTANT
// and PLACE. This module owns that precision end to end, and it is deliberately dependency-free (no UI, no
// ephemeris import) so it unit-tests offline like aspects.js / synastry.js. The ephemeris-bound wrappers
// (which need astronomy-engine's SiderealTime + e_tilt) live in astro.js and call in here.
//
// Three things happen at this altitude:
//   1. wall clock + IANA zone → an exact UTC instant, honouring HISTORY (pre-standard-time Local Mean Time,
//      every DST rule ever). The tz database is already in the engine — Intl exposes it to the second.
//   2. RAMC + obliquity + latitude → Ascendant, Midheaven, and twelve house cusps.
//   3. a transiting longitude vs a natal one → the aspect, its orb, and (via a caller-supplied ephemeris
//      callback) the exact instant it perfects.
//
// See apps/transit/RESEARCH.md for the derivations, the published-chart check and the JPL Horizons
// accuracy measurement.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const norm360 = (d) => (((d % 360) + 360) % 360);
// signed difference in (-180, 180] — the short way round the circle.
export const wrap180 = (d) => { const x = norm360(d); return x > 180 ? x - 360 : x; };
const sin = (d) => Math.sin(d * D2R), cos = (d) => Math.cos(d * D2R), tan = (d) => Math.tan(d * D2R);

// ── 1. the birth instant ──────────────────────────────────────────────────────────────────────────────

// The offset (ms) an IANA zone was at a given instant. Formats the instant IN the zone, reads the wall-clock
// fields back as if they were UTC, and subtracts — the classic inversion, and the only way to reach the
// engine's tz database from JS. hourCycle:"h23" (NOT hour12:false, which yields hour "24" on some engines).
// Whole-second resolution, which is all tzdata itself carries (LMT offsets are defined to the second).
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
  // Date.UTC maps years 0..99 to 1900..1999 — undo that for the (rare, but real) early-year chart.
  const fix = year >= 0 && year <= 99 ? Date.UTC(year, 0, 1) - Date.UTC(year + 1900, 0, 1) : 0;
  return (asUTC + fix) - Math.floor(ts / 1000) * 1000;
}

// True Local Mean Time from longitude alone (ms) — what a sundial in that town read before the railways
// imposed zones. The pre-1880 convention of published charts, and the honest fallback when no zone is known.
export const lmtOffset = (lng) => Math.round(lng * 240000);          // 4 min per degree → 240 000 ms

// Is `zone` a zone this engine actually knows? A typo must fail loudly, not silently become UTC.
export function knownZone(zone) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

// Wall clock + zone → the UTC instant, by fixed-point iteration (see RESEARCH.md §1).
//
// wall: { y, mo (1-12), d, h, mi, s, ms } — the numbers on the clock in the room where it happened.
// zone: an IANA name, or { offsetMs } to bypass the database entirely (a birth certificate beats tzdata).
//
// Returns { ms, offset, ambiguous, nonexistent, zone } — the two flags are REPORTED, never silently guessed:
//   ambiguous   — the autumn hour that runs twice; we take the earlier (still-DST) instant.
//   nonexistent — the spring hour that never happened; we keep the post-transition offset.
export function zonedToUTC(wall, zone) {
  const { y, mo = 1, d = 1, h = 0, mi = 0, s = 0, ms = 0 } = wall;
  let base = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (y >= 0 && y <= 99) base += Date.UTC(y, 0, 1) - Date.UTC(y + 1900, 0, 1);   // no 1900-window surprise
  if (zone && typeof zone === "object" && Number.isFinite(zone.offsetMs)) {
    return { ms: base - zone.offsetMs, offset: zone.offsetMs, ambiguous: false, nonexistent: false, zone: null };
  }
  if (!knownZone(zone)) return null;
  // Converges in two rounds: the guess is wrong by at most one offset, and offsets differ by ≤ ~1 h.
  let ts = base - zoneOffset(base, zone);
  for (let i = 0; i < 3; i++) {
    const off = zoneOffset(ts, zone);
    const next = base - off;
    if (next === ts) break;
    ts = next;
  }
  const off = zoneOffset(ts, zone);
  const nonexistent = base - off !== ts;                    // the requested wall time never occurred
  // Ambiguity: the *earlier* offset (before the transition) also reproduces this wall time → the hour ran
  // twice. Probe an instant one offset-window earlier; if it round-trips too, prefer that earlier instant.
  let ambiguous = false;
  const earlyOff = zoneOffset(ts - 7200000, zone);
  if (!nonexistent && earlyOff !== off && base - earlyOff < ts && zoneOffset(base - earlyOff, zone) === earlyOff) {
    ambiguous = true;
    return { ms: base - earlyOff, offset: earlyOff, ambiguous, nonexistent, zone };
  }
  return { ms: ts, offset: off, ambiguous, nonexistent, zone };
}

// "+02:00" / "+00:53:28" / "-0430" / "Z" → ms, or null. The manual-offset escape hatch's parser.
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

// ms → "+02:00" (or "+00:53:28" when the seconds are not zero — historic LMT offsets are not round).
export function formatOffset(ms) {
  if (!Number.isFinite(ms)) return "";
  const sign = ms < 0 ? "-" : "+", a = Math.abs(ms) / 1000;
  const p = (n) => String(Math.floor(n)).padStart(2, "0");
  const ss = Math.round(a % 60);
  return `${sign}${p(a / 3600)}:${p((a % 3600) / 60)}${ss ? ":" + p(ss) : ""}`;
}

// ── 2. angles + houses ────────────────────────────────────────────────────────────────────────────────

// Ecliptic longitude of the ecliptic point whose right ascension is `ra`. The workhorse: MC and every
// Placidus cusp are just this applied to a solved RA.
export const lonAtRA = (ra, eps) => norm360(Math.atan2(sin(ra), cos(ra) * cos(eps)) * R2D);

// The Midheaven: the ecliptic degree on the upper meridian.
export const midheaven = (ramc, eps) => lonAtRA(ramc, eps);

// The Ascendant: the ecliptic degree rising on the eastern horizon. Verified independently — the returned
// longitude sits at altitude 0.000000000° with an eastern azimuth (RESEARCH.md §3).
export const ascendant = (ramc, eps, phi) =>
  norm360(Math.atan2(cos(ramc), -(sin(ramc) * cos(eps) + tan(phi) * sin(eps))) * R2D);

// The Vertex: where the prime vertical cuts the ecliptic in the WEST — the Ascendant of the co-latitude
// taken from the opposite meridian. Traditional "fated encounters" point; cheap, so we surface it.
// Verified geometrically, not by convention: the returned longitude sits at azimuth exactly 270.0000°
// (due west). The tempting extra +180° gives azimuth 90° — that is the Antivertex, the opposite point.
export const vertex = (ramc, eps, phi) =>
  ascendant(norm360(ramc + 180), eps, (phi >= 0 ? 90 : -90) - phi);

// Placidus is undefined where an ecliptic degree never rises: |sin α · tanφ · tanε| > 1 somewhere on the
// circle. tanφ·tanε = 1 at φ ≈ ±66.56°, so this is the actual polar circle, not a safety margin.
export const placidusDefined = (eps, phi) => Math.abs(tan(phi) * tan(eps)) < 1;

// One Placidus cusp by fixed-point iteration on the semi-arc (RESEARCH.md §4).
//   offset — 0° for the cusps above the horizon (11, 12), 180° for those below (2, 3)
//   f      — the fraction of the semi-arc (⅓ or ⅔)
//   diurnal— which semi-arc is trisected
function placidusCusp(ramc, eps, phi, offset, f, diurnal) {
  const k = tan(phi) * tan(eps);
  let ra = norm360(ramc + offset + (diurnal ? f * 90 : -f * 90));    // seed: the AD = 0 answer
  for (let i = 0; i < 200; i++) {
    const x = -sin(ra) * k;
    if (Math.abs(x) > 1) return null;                                // circumpolar → no semi-arc exists
    const dsa = Math.acos(x) * R2D;
    const sa = diurnal ? dsa : 180 - dsa;
    const next = norm360(ramc + offset + (diurnal ? f * sa : -f * sa));
    const step = Math.abs(wrap180(next - ra));
    ra = next;
    if (step < 1e-11) return lonAtRA(ra, eps);
  }
  return null;                                                       // did not converge → say so, don't guess
}

// Porphyry: trisect each ASC→MC quadrant in ecliptic longitude. Closed-form, defined everywhere — the
// standard fallback above the polar circle (what Swiss Ephemeris does), and a house system in its own right.
function porphyryCusps(asc, mc) {
  const c = new Array(12);
  const q1 = norm360(asc - mc) / 3;                  // MC → ASC, forward through houses 11 and 12
  const q2 = norm360(norm360(mc + 180) - asc) / 3;   // ASC → IC, forward through houses 2 and 3
  c[0] = asc; c[1] = norm360(asc + q2); c[2] = norm360(asc + 2 * q2);
  c[9] = mc; c[10] = norm360(mc + q1); c[11] = norm360(mc + 2 * q1);
  // the lower six are the opposites of the upper six — derived LAST, so nothing overwrites a solved cusp.
  c[3] = norm360(c[9] + 180); c[4] = norm360(c[10] + 180); c[5] = norm360(c[11] + 180);
  c[6] = norm360(c[0] + 180); c[7] = norm360(c[1] + 180); c[8] = norm360(c[2] + 180);
  return c;
}

export const HOUSE_SYSTEMS = ["placidus", "whole", "equal", "porphyry"];

// The twelve cusps, house 1 first. Returns { cusps, system, asc, mc, vertex, fallback } — `system` is what
// was ACTUALLY used and `fallback` names what was asked for when Placidus had to be abandoned, so the UI can
// tell the truth about an Arctic birth instead of quietly drawing a different chart.
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

// Which house (1..12) a longitude falls in. Walks the cusps forward, so it is correct for the wildly uneven
// houses Placidus produces at high latitude (a house can span 90°+ or shrink under 5°).
export function houseOf(lon, cusps) {
  if (!cusps || cusps.length !== 12) return null;
  const l = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const span = norm360(cusps[(i + 1) % 12] - cusps[i]);
    if (norm360(l - cusps[i]) < (span || 360)) return i + 1;
  }
  return 12;
}

// ── 3. transits against the natal chart ───────────────────────────────────────────────────────────────

// Transit orbs are event orbs, not natal orbs: `exact` is the aspect happening now, `range` is it coming
// into range. Reusing the natal 8° conjunction orb would call a Pluto conjunction "active" for six years.
export const TRANSIT_ORB = { exact: 1, range: 3 };

// The five Ptolemaic angles, shared with aspects.js's table but addressed by angle here.
export const TRANSIT_ASPECTS = [
  { type: "conjunction", angle: 0, nature: "neutral" },
  { type: "sextile", angle: 60, nature: "soft" },
  { type: "square", angle: 90, nature: "hard" },
  { type: "trine", angle: 120, nature: "soft" },
  { type: "opposition", angle: 180, nature: "hard" },
];

// Short-arc separation 0..180 between two ecliptic longitudes.
export const separation = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

// The aspect a transiting longitude makes to a natal one, or null. `orb` is the distance from exact.
//
// `signedAngle` matters more than it looks. `separation` is the SHORT arc, so a trine at 120° means the
// transiting body is either 120° ahead of the natal point or 120° behind it — two different places on the
// wheel. The root finder solves λ(t) − natal − angle = 0, so handing it the wrong sign searches the far
// side of the chart and reports "no hit" for an aspect that perfects within the hour. Symmetric aspects
// (0°, 180°) are unaffected; sextile/square/trine are not.
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

// Every transit→natal contact, tightest first.
//   transiting — [{ key, lon }] where the sky is now (or on the scrubbed date)
//   natal      — [{ key, lon }] the birth chart, PLUS the angles as pseudo-bodies ({key:"asc"}, {key:"mc"})
//   prev       — optional { key: lon } for the transiting bodies a step earlier → applying/separating
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

// How finely a hit time may honestly be quoted, given the ephemeris error divided by the body's speed
// (RESEARCH.md §5). Quoting seconds for a Pluto transit would be a lie told with decimal places.
export const HIT_PRECISION = {
  sun: "second", moon: "second", mercury: "second", venus: "second", mars: "second",
  jupiter: "minute", saturn: "minute", uranus: "day", neptune: "day", pluto: "day",
};
// Coarse scan step (ms) per body — small enough that no crossing hides between samples, large enough to
// keep the scan to a few dozen ephemeris calls.
// Sized so a body moves at most ~0.5° per sample: fine enough that a retrograde loop cannot slip a PAIR of
// crossings between two samples, coarse enough that a twelve-year Pluto window is hundreds of ephemeris
// calls rather than thousands. A uniform step would be either wrong for the Moon or ruinous for Pluto.
export const SCAN_STEP = {
  moon: 36e5, sun: 216e5, mercury: 216e5, venus: 432e5, mars: 864e5,
  jupiter: 2592e5, saturn: 3456e5, uranus: 8640e5, neptune: 12960e5, pluto: 12960e5,
};
// How far either side of "now" it is worth looking for a body's exact hit, scaled to how fast it moves.
// Pluto covers ~0.5° a year, so a three-month window would report "no hit" for an aspect that is plainly
// building; the Moon laps the zodiac monthly, so a wide window would just bury today's hit in noise.
const DAY_MS = 864e5;
export const HIT_WINDOW = {
  moon: 3 * DAY_MS, sun: 60 * DAY_MS, mercury: 60 * DAY_MS, venus: 90 * DAY_MS, mars: 400 * DAY_MS,
  jupiter: 800 * DAY_MS, saturn: 1100 * DAY_MS, uranus: 2600 * DAY_MS, neptune: 3600 * DAY_MS, pluto: 4400 * DAY_MS,
};

// Exact instants at which a transiting body perfects `angle` to a fixed natal longitude, within a window.
//
//   lonAt(ms) → the body's ecliptic longitude at that instant (the caller binds the ephemeris; that keeps
//               this module pure and makes the search trivially testable against an analytic stub).
//
// f(t) = wrap180(λ(t) − natal − angle) is continuous and crosses zero at the hit. Coarse-scan for sign
// changes (guarding |Δ| < 90° so a wrap-around is never mistaken for a crossing), then bisect to `tolMs`.
// Retrograde bodies cross the same aspect up to three times — every bracket in the window is returned.
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
