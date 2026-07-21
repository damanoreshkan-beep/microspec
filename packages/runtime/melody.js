// microspec runtime — melodic phrase generation. The maths behind "auto-generate a line that sounds SWEET",
// shared by the pitched instruments (kalimba thumb-piano, handpan) the way groove.js is shared by the drum
// apps. Same thesis as groove.js: a seeded SCORED SEARCH, not a random walk — draw candidate phrases from
// the scale, score each against measured consonance and melodic expectation, keep the best. Pure, DOM-free,
// zero deps → the claim "this is not random" is mechanically PROVEN by the browser-free gate
// (runtime_test.js), not asserted in a comment.
//
// Results from the literature, each mapped to one term of the score:
//  · Bowling & Purves (2018), PNAS — tones in small-integer frequency ratios read as consonant/attractive.
//    → harmonicity() (reused from groove.js): the fifth and octave dominate, the tritone/semitone are rare.
//  · Huron (2006), "Sweet Anticipation" — melodies overwhelmingly move by SMALL intervals (step/third); a
//    large leap sets up an expectation that the line steps back. → the smoothness term + leap penalty.
//  · Melodic arch (Huron; Narmour's registral return) — phrases tend to rise then fall, and to close by
//    RESOLVING to the tonic. → the arch-contour term + a guaranteed tonic landing.
//
// A generated phrase therefore beats a coin-flip line by construction — smoother, more consonant, and it
// actually cadences — which runtime_test.js asserts head-to-head against random.

import { mulberry32, harmonicity } from "./groove.js";

// A `scale` is ascending semitone offsets from the tonic; index 0 is the tonic. E.g. D Kurd's fields from
// the ding are [0, 7, 8, 10, 12, 14, 15, 17, 19]; a C-major kalimba octave is [0, 2, 4, 5, 7, 9, 11, 12].
// generateMelody returns indices INTO that array (+ rests), so each app maps a step back to its own
// tone-field / tine and its frequency — the runtime never needs to know the instrument's geometry.

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const gauss = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

// weighted pick over indices 0..n-1
function pickW(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

// The pitch-class of the tonic is 0; a note is "a tonic" when it is the root in any octave (offset % 12 === 0).
const isTonic = (scale, i) => ((scale[i] % 12) + 12) % 12 === 0;
const isFifth = (scale, i) => ((scale[i] % 12) + 12) % 12 === 7;
// nearest scale index whose pitch-class is the tonic — used to land the cadence smoothly from wherever we are
function nearestTonicIndex(scale, from) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < scale.length; i++) if (isTonic(scale, i)) { const d = Math.abs(i - from); if (d < bestD) { bestD = d; best = i; } }
  return best < 0 ? 0 : best;
}

// Draw one candidate phrase. Generation is already MILDLY biased (toward small steps from the previous note
// and toward consonant degrees) so the search space is musical; the scorer then does the real ranking. The
// first sounding note is grounded on the tonic (a handpan/kalimba phrase almost always starts on the root).
function buildPhrase(rng, scale, len, restP) {
  const notes = [];
  let prev = 0;
  for (let k = 0; k < len; k++) {
    if (k === 0) { notes.push({ i: nearestTonicIndex(scale, 0) }); prev = notes[0].i; continue; }
    if (rng() < restP) { notes.push({ rest: true }); continue; }
    const weights = scale.map((off, i) => {
      const leap = Math.abs(i - prev);
      const step = gauss(leap, 0, 2.4);                        // prefer nearby scale degrees (stepwise motion)
      return (0.05 + step) * (0.4 + 0.6 * harmonicity(off));   // ...times consonance with the tonic
    });
    const i = pickW(rng, weights);
    notes.push({ i }); prev = i;
  }
  return notes;
}

// Score a phrase. Higher = sweeter to the ear.
export function scoreMelody(notes, scale) {
  const sounding = notes.filter((n) => !n.rest);
  if (sounding.length < 3) return -Infinity;
  const idxs = sounding.map((n) => n.i);
  let s = 0;

  // 1. Consonance of the notes actually heard (Bowling & Purves).
  s += 1.0 * mean(idxs.map((i) => harmonicity(scale[i])));

  // 2. Smoothness — the mean absolute melodic interval wants to sit in the step/third range (~2–3 semitones,
  //    Huron); a wall of big leaps is punished.
  let sum = 0, big = 0;
  for (let k = 1; k < idxs.length; k++) { const d = Math.abs(scale[idxs[k]] - scale[idxs[k - 1]]); sum += d; if (d > 7) big++; }
  const meanLeap = sum / (idxs.length - 1);
  s += 1.3 * gauss(meanLeap, 2.6, 2.4);
  s -= 0.28 * big;

  // 3. Resolution — a phrase that ends on the tonic (or, less strongly, the fifth) reads as finished.
  s += isTonic(scale, idxs[idxs.length - 1]) ? 1.0 : isFifth(scale, idxs[idxs.length - 1]) ? 0.4 : -0.2;
  s += isTonic(scale, idxs[0]) ? 0.5 : 0;

  // 4. Arch — reward the melodic peak sitting near the middle (rise then fall).
  const peak = idxs.indexOf(Math.max(...idxs));
  s += 0.5 * gauss(peak / Math.max(1, idxs.length - 1), 0.5, 0.3);

  // 5. Shape, not aimlessness and not a drone: reward SOME repetition (a motif recurs) while penalising a
  //    phrase that is basically one repeated note. The sweet spot is moderate variety.
  const variety = new Set(idxs).size / idxs.length;
  s += 0.5 * gauss(variety, 0.55, 0.22);

  return s;
}

// generateMelody — draw `tries` candidates and keep the highest-scoring, then GUARANTEE the cadence by
// snapping the final sounding note to the nearest tonic (a resolution the search rewards but shouldn't be
// left to chance). Deterministic in `seed`, so a phrase is reproducible and shareable.
export function generateMelody(scale, { seed = 1, len = 16, restP = 0.18, tries = 200 } = {}) {
  if (!Array.isArray(scale) || scale.length < 2) return { notes: [], seed: seed >>> 0 };
  const rng = mulberry32(seed >>> 0);
  let best = null, bestScore = -Infinity, sum = 0;
  for (let k = 0; k < tries; k++) {
    const cand = buildPhrase(rng, scale, len, restP);
    const sc = scoreMelody(cand, scale);
    sum += sc;
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  // Cadence guarantee: land the last sounding note on the tonic, chosen near where the line already is.
  for (let k = best.length - 1; k >= 0; k--) if (!best[k].rest) { best[k] = { i: nearestTonicIndex(scale, best[k].i) }; break; }
  return { notes: best, seed: seed >>> 0, score: bestScore, meanScore: sum / tries, tries };
}
