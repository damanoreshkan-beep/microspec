/* @ts-self-types="./melody.d.ts" */
/**
 * # runtime/melody.js — a seeded scored search for a phrase that sounds sweet, not a random walk
 *
 * Melodic phrase generation for the pitched instruments (kalimba thumb-piano, handpan), shared the way
 * groove.js is shared by the drum apps and built on the same thesis: draw candidate phrases from the scale,
 * score each against measured consonance and melodic expectation, keep the best. Each term of the score maps
 * to one result from the literature — Bowling & Purves (2018) on small-integer frequency ratios reading as
 * consonant (`harmonicity`, reused from groove.js), Huron (2006) on melodies moving by SMALL intervals with a
 * leap setting up a step back (the smoothness term and leap penalty), and the melodic arch with a tonic
 * resolution (the arch-contour term and a guaranteed cadence). Pure, DOM-free, zero deps, so the claim "this
 * is not random" is mechanically PROVEN head-to-head against a coin-flip line by the browser-free unit gate,
 * not asserted in a comment.
 *
 * ![melody.js: candidates drawn from the scale, scored on consonance, smoothness, resolution, arch and variety, the best kept and snapped to the tonic](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-melody.svg)
 *
 * ## Import
 * ```js
 * import { generateMelody } from "/_rt/melody.js";                              // an app's page: the import map resolves /_rt/
 * import { generateMelody, scoreMelody } from "@microspec/core/runtime/melody.js";   // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link generateMelody} — `generateMelody(scale, { seed = 1, len = 16, restP = 0.18, tries = 200 })` →
 *   `{ notes, seed, score, meanScore, tries }`; `notes` are `{ i }` indices INTO `scale` plus `{ rest: true }`
 *   rests, the final sounding note snapped to the nearest tonic. A scale shorter than two steps returns
 *   `{ notes: [], seed }`.
 * - {@link scoreMelody} — `scoreMelody(notes, scale)` → the score (higher is sweeter), or `-Infinity` for a
 *   phrase with fewer than three sounding notes. Five terms: consonance of the notes heard, smoothness of the
 *   mean interval (~2–3 semitones) minus a penalty per leap over a fifth, resolution on the tonic (or, weaker,
 *   the fifth) plus a tonic opening, the peak near the middle, and moderate variety.
 *
 * ## In practice
 * The kalimba's Flow: the current tuning as ~1.4 octaves of degree offsets, a fresh seed, and the returned
 * indices played straight through the same path as a song.
 * ```js
 * import { generateMelody } from "/_rt/melody.js";   // apps/kalimba/view.js
 *
 * const flow = () => {
 *   const steps = STEPS[scale]; const offs = [0]; let acc = 0;
 *   for (let k = 0; k < 9; k++) { acc += steps[k % steps.length]; offs.push(acc); }
 *   const g = generateMelody(offs, { seed: (Math.random() * 0xffffffff) >>> 0, len: 14, restP: 0.16, tries: 220 });
 *   play({ id: "flow", step: 300, seq: g.notes.map((n) => (n.rest ? null : n.i)) });
 * };
 * ```
 * The handpan does the same over its tone-field offsets with `restP: 0.24, tries: 260`.
 *
 * ## How it fits
 * Imports `mulberry32` and `harmonicity` from groove.js — the same seeded PRNG and consonance measure the drum
 * apps rank patterns with. No other runtime module imports it; tests/melody_test.js proves the head-to-head
 * against random. 3 farm apps import `generateMelody` — kalimba, handpan, grain.
 *
 * ## Invariants and pitfalls
 * - A `scale` is ascending semitone offsets from the tonic with index 0 the tonic (D Kurd from the ding:
 *   `[0, 7, 8, 10, 12, 14, 15, 17, 19]`; a C-major kalimba octave: `[0, 2, 4, 5, 7, 9, 11, 12]`). The result is
 *   indices into that array, so each app maps a step back to its own tone-field or tine and its frequency —
 *   the runtime never knows the instrument's geometry.
 * - A note is "a tonic" when its offset is the root in any octave (`offset % 12 === 0`); the cadence snaps to
 *   the tonic index NEAREST the line's last note, not to index 0, so the landing is smooth.
 * - Deterministic in `seed` (`mulberry32(seed >>> 0)`): the same seed, scale and options reproduce the phrase,
 *   so a line is shareable. Draw a random seed only when you want a new phrase.
 * - The first sounding note is always grounded on the tonic; generation is only MILDLY biased (small steps,
 *   consonant degrees) so the search space stays musical — the scorer does the real ranking.
 * - `len` counts rests; with `restP` high and `len` small a candidate can fall under three sounding notes and
 *   score `-Infinity`, so keep `tries` large enough that the best is a real phrase.
 * @module
 */
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
/**
 * Score a phrase against consonance, smoothness, resolution, arch and variety — higher is sweeter to the ear.
 * @param notes the phrase: `{ i }` scale-index notes and `{ rest: true }` rests
 * @param scale ascending semitone offsets from the tonic (index 0 = tonic)
 * @returns the score, or `-Infinity` for a phrase with fewer than three sounding notes
 */
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
/**
 * Generate the best-scoring phrase out of `tries` seeded candidates, with the final sounding note snapped to
 * the nearest tonic so the line always cadences.
 * @param scale ascending semitone offsets from the tonic (index 0 = tonic)
 * @param options `seed` (deterministic), `len` (notes incl. rests), `restP` (rest probability), `tries`
 * @returns `{ notes, seed, score, meanScore, tries }` — `notes` are indices into `scale` plus rests
 */
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
