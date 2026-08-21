// synastry — astrology compatibility from two birth charts. The REAL planet positions come from
// /_rt/astro.js (astronomy-engine ephemeris); this module owns only the pure, deterministic astrology on
// top of them: the sign of an ecliptic longitude, the inter-chart CONTACTS between two people's bodies with
// their orbs, and the per-axis + overall index built from those contacts. Depth lives here with unit tests,
// like astro.js / geomag.js — never in an app.
//
// It used to score a pair by SIGN DISTANCE alone: Sun in Cancer against Sun in Aries was "3 signs apart,
// therefore a square, therefore 43". That model cannot tell 1° Cancer from 29° Cancer, so a pair one degree
// from an exact trine and a pair 28° away from one scored identically — and the two numbers it fed the ring
// were the same number. Real longitudes were already being computed and then thrown away by `signOf`.
// Now the aspect is measured between the longitudes and carries the distance from exact.
import { ASPECTS } from "./aspects.js";

export const signOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);   // ecliptic longitude → sign 0..11
const wrap = (s) => (((s % 12) + 12) % 12);
export const ELEMENT = (s) => wrap(s) % 4;    // 0 fire · 1 earth · 2 air · 3 water
export const MODALITY = (s) => wrap(s) % 3;   // 0 cardinal · 1 fixed · 2 mutable

// ── orbs belong to the PLANETS, not to the aspects ───────────────────────────────────────────────────────
//
// This is the one place synastry deliberately parts company with aspects.js, and the reason is sourced
// rather than stylistic. aspects.js gives each ASPECT TYPE an orb (conjunction 8°, sextile 4°…), which is
// the modern convention and the right one for a transit wheel. Deborah Houlding, tracing the classical use
// of aspects, is explicit that this is recent: "Only within the last century have orbs come to be determined
// by the nature of the aspect rather than the planets involved, a simplifying process which fails to accept
// that some planets have a stronger influence than others."
//   — Deborah Houlding, "The Classical Origin and Traditional Use of Aspects", https://www.skyscript.co.uk/aspects.html
//
// The older model gives each PLANET an orb, and two planets are in aspect when their distance from exact is
// within the sum of their two MOIETIES (each planet's orb radius). Below is Dariot's table as Houlding
// reproduces it, itself from Al-Biruni — orb radius first, moiety (the figure actually used) second:
//
//   Sun 15°/7½°   Moon 12°/6°   Mercury 7°/3½°   Venus 7°/3½°   Mars 8°/4°   Jupiter 9°/4½°   Saturn 9°/4½°
//
// So Sun–Moon reaches 13½° and Mercury–Venus only 7°, which is the substantive claim: the luminaries carry
// further than the small personal planets. Houlding also records that the sources disagree among themselves
// — 12° for everything, 15°, the mean of the two planets, Ptolemy's 5° — so this is one documented system
// and not "the" traditional orb, which is why it is named and cited here rather than presented as settled.
//
// The three modern planets have NO traditional moiety, because the tradition ended before they were found.
// There is no honest number to write for them, so they are absent rather than guessed — and that is the
// reason the compatibility tab reads the five classical personal bodies and stops there.
export const MOIETY = { sun: 7.5, moon: 6, mercury: 3.5, venus: 3.5, mars: 4, jupiter: 4.5, saturn: 4.5 };

// The bodies a date-only synastry may read, in traditional speed order.
export const SYN_BODIES = ["sun", "moon", "mercury", "venus", "mars"];

const norm360 = (d) => (((d % 360) + 360) % 360);
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

// The five Ptolemaic aspects, taken from aspects.js so the farm keeps ONE definition of what a trine is —
// only the orb is replaced, per the note above. The minor aspects stay out: Houlding records that the
// semisextile "was dismissed as too weak to be of noticeable influence", and that the inconjunct/quincunx
// named the ABSENCE of an aspect — aversum, "turned away from". Modern relationship astrology does read the
// quincunx, but as a reinterpretation, so including it would be asserting a modern school as the tradition.
const PTOLEMAIC = ASPECTS.map(({ type, angle, nature }) => ({ type, angle, nature }));

// contacts(A, B) — every aspect between one person's bodies and the other's, strongest first.
//
//   A, B  [{ key, lon }] — one person's positions each. Unlike aspects.js this is a CROSS product, not a
//         half-matrix: A.sun–B.sun is a real contact (two different Suns), and A.venus–B.mars is a
//         different claim from B.venus–A.mars, so both are kept and `a` always belongs to A.
//   →     [{ a, b, type, nature, angle, orb, limit, strength }]
//         `orb` is the distance from exact, `limit` the two moieties summed, and `strength` 0..1 how close
//         to exact it sits inside its own window — which is what makes a 1° trine outrank a 12° one.
export function contacts(A, B) {
  const out = [];
  for (const p of A) {
    for (const q of B) {
      if (p.lon == null || q.lon == null) continue;
      const limit = (MOIETY[p.key] || 0) + (MOIETY[q.key] || 0);
      if (!limit) continue;                                  // a body with no traditional moiety is not read
      const s = sep(p.lon, q.lon);
      for (const asp of PTOLEMAIC) {
        const delta = Math.abs(s - asp.angle);
        if (delta > limit) continue;
        out.push({ a: p.key, b: q.key, type: asp.type, nature: asp.nature, angle: asp.angle,
          orb: +delta.toFixed(2), limit, strength: +(1 - delta / limit).toFixed(3) });
        break;   // the windows stay disjoint even at the widest limit — unit-tested
      }
    }
  }
  return out.sort((x, y) => y.strength - x.strength);
}

// ── the index ────────────────────────────────────────────────────────────────────────────────────────────
//
// Everything below this line is EDITORIAL, and saying so is not a disclaimer — it is the finding. There is
// no traditional basis for reducing a synastry to a percentage: classical judgement of an aspect turns on
// the nature, dignity, reception and condition of the planets, so a square between two well-placed planets
// is not simply "bad" and a trine to an afflicted Venus is not simply "good". A single scalar erases exactly
// the conditions the tradition judges by. The numeric systems that do exist are 20th-century inventions with
// named authors (Elbert Benjamine's astrodynes, and the closed scoring inside commercial software), not
// received technique. So the ring is this app's index, computed by the formula below and nothing more —
// never "what the tradition scores you".
//
// VALENCE keeps the numbers the sign model already used, so the bands and their colours mean what they
// meant before: a trine reads easiest, a conjunction fuses, a square grates hardest.
const VALENCE = { trine: 90, conjunction: 78, sextile: 72, opposition: 66, square: 43 };

// Two bodies with no aspect between them are in AVERSION — classically not a weak connection but no
// connection, "unconnected, turned away". So an axis reads the contacts it HAS and an absent pair is not
// evidence of mildness: it is silence, and silence does not get a vote.
//
// That distinction is not pedantry, it was measured. Averaging every pair in an axis and scoring the absent
// ones at the neutral midpoint collapsed the whole index: across 1 500 random pairs the overall ran 54–70,
// and two of the four bands — "challenge" and "harmony" — became mathematically unreachable, so the app
// would have shipped two labels no user could ever see. Only about 11 of the 25 possible contacts exist in
// a typical pair, so three dead slots in a five-pair axis dragged every reading back to 60.
//
// Each present contact is therefore weighted by how close to exact it sits, and an axis with no contacts at
// all — which is the honest meaning of aversion across the board — is the one case that returns neutral.
//
// `strength` then has to do TWO jobs, and getting only the first one done was a bug caught by reading a
// rendered block rather than a number. Weighting the votes by strength decides which contact leads when an
// axis holds several; it does not decide how far the axis moves from neutral, so an axis whose only contact
// was a 12°-wide trine scored exactly 90 — the same as an exact one — and a real pair came out 90/90/90/90.
// Each vote is therefore ALSO pulled toward neutral by its own strength before it is weighted: a wide trine
// is a faint yes, not a full one. Without this the orb is measured, printed, and then quietly ignored.
const NEUTRAL = 60;
const pull = (c) => NEUTRAL + (VALENCE[c.type] - NEUTRAL) * c.strength;

// Which body pairs each axis reads. Editorial, and the ordering inside an axis carries no weight — the axis
// is the mean of its pairs. Sun–Moon leads `core` because it is the one cross-chart contact with broad
// agreement across authors (Davison, Arroyo, Sargent all build on it); Venus–Mars leads `love` for the same
// reason. Beyond those two there is no agreed ranking in the literature, so none is invented here: the
// remaining pairs sit inside the axis they obviously belong to and are averaged flat.
const AXES = {
  core: [["sun", "sun"], ["sun", "moon"], ["moon", "sun"], ["moon", "moon"]],
  love: [["venus", "mars"], ["mars", "venus"], ["venus", "venus"]],
  emotion: [["moon", "moon"], ["moon", "venus"], ["venus", "moon"], ["moon", "sun"], ["sun", "moon"]],
  mind: [["mercury", "mercury"], ["mercury", "sun"], ["sun", "mercury"], ["mercury", "moon"], ["moon", "mercury"]],
  passion: [["mars", "mars"], ["venus", "mars"], ["mars", "venus"], ["mars", "sun"], ["sun", "mars"]],
};

// score(contacts) → the five axes + a weighted overall, each 0..100.
// The overall weighting is unchanged from the sign model, deliberately: it is an editorial choice that was
// already made and shipped, and re-tuning it in the same edit that changes the inputs would leave no way to
// tell which of the two moved a score.
export function score(list) {
  const at = new Map(list.map((c) => [c.a + "-" + c.b, c]));
  const axis = (pairs) => {
    let weight = 0, sum = 0;
    for (const [a, b] of pairs) {
      const c = at.get(a + "-" + b);
      if (!c) continue;                                      // aversion: no contact, no vote
      weight += c.strength;
      sum += pull(c) * c.strength;
    }
    return weight ? Math.round(sum / weight) : NEUTRAL;
  };
  const core = axis(AXES.core), love = axis(AXES.love), emotion = axis(AXES.emotion);
  const mind = axis(AXES.mind), passion = axis(AXES.passion);
  const overall = Math.round(core * 0.32 + love * 0.28 + emotion * 0.2 + mind * 0.1 + passion * 0.1);
  return { overall, core, love, emotion, mind, passion };
}

// score → band 0..3 (challenge · mixed · warm · harmony) for a label + colour.
//
// Re-cut for the contact model, because thresholds are only meaningful against the distribution they sort,
// and this one is much narrower than the sign model's. Measured over 3 000 random pairs the index runs
// 48–84 with a median of 65 (p05 56, p25 62, p75 68, p95 74): pulling every vote toward neutral by its own
// orb keeps most pairs near the middle, which is the honest shape — two people picked at random mostly are
// unremarkable to each other. The old 48/62/78 sorted a distribution that no longer exists and left both
// end bands empty (0.0% "challenge", 0.7% "harmony"), i.e. two labels no user would ever see. 58/65/72
// splits it roughly 10 · 40 · 40 · 10.
//
// The number itself stays raw rather than being stretched across 0–100. Rescaling would widen the gaps
// between scores without adding anything that measures them, which is the same invented precision this
// module refuses everywhere else — the BAND carries the verdict, the number is only its position.
export const band = (s) => (s >= 72 ? 3 : s >= 65 ? 2 : s >= 58 ? 1 : 0);
