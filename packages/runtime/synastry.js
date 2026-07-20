// synastry — astrology compatibility from two birth charts. The REAL planet positions come from
// /_rt/astro.js (astronomy-engine ephemeris); this module owns only the pure, deterministic astrology on
// top of them: the sign of an ecliptic longitude, the aspect between two signs (the traditional
// element/angle model), and the per-axis + overall compatibility scores from each person's Sun/Moon/
// Mercury/Venus/Mars signs. Depth lives here with unit tests, like astro.js / geomag.js — never in an app.

export const signOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);   // ecliptic longitude → sign 0..11
const wrap = (s) => (((s % 12) + 12) % 12);
export const ELEMENT = (s) => wrap(s) % 4;    // 0 fire · 1 earth · 2 air · 3 water
export const MODALITY = (s) => wrap(s) % 3;   // 0 cardinal · 1 fixed · 2 mutable

// score 0..100 for a pair of signs by the angle between them (their aspect):
//   trine (4 apart, same element) hums; sextile (2, complementary) flows; conjunction (0) is intense;
//   square (3) grates; opposition (6) attracts-and-strains; the awkward 1/5 angles sit in between.
const ASPECT = [78, 47, 72, 43, 90, 46, 66];   // by sign-distance 0..6
export function signPair(a, b) {
  const A = wrap(a), B = wrap(b);
  const d = Math.min((A - B + 12) % 12, (B - A + 12) % 12);   // 0..6
  return ASPECT[d];
}

// A, B = { sun, moon, mercury, venus, mars } sign indices → the five axes + a weighted overall (0..100).
export function compat(A, B) {
  const p = signPair;
  const core = Math.round((p(A.sun, B.sun) * 2 + p(A.moon, B.moon)) / 3);              // who you are together
  const love = Math.round((p(A.venus, B.mars) + p(B.venus, A.mars) + p(A.venus, B.venus)) / 3);
  const emotion = Math.round((p(A.moon, B.moon) + p(A.moon, B.sun) + p(B.moon, A.sun)) / 3);
  const mind = Math.round((p(A.mercury, B.mercury) + p(A.mercury, B.sun) + p(B.mercury, A.sun)) / 3);
  const passion = Math.round((p(A.mars, B.mars) + p(A.venus, B.mars) + p(B.venus, A.mars)) / 3);
  const overall = Math.round(core * 0.32 + love * 0.28 + emotion * 0.2 + mind * 0.1 + passion * 0.1);
  return { overall, core, love, emotion, mind, passion };
}

// score → band 0..3 (challenge · mixed · warm · harmony) for a label + colour.
export const band = (s) => (s >= 78 ? 3 : s >= 62 ? 2 : s >= 48 ? 1 : 0);
