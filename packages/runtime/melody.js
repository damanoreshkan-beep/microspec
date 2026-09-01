/* @ts-self-types="./melody.d.ts" */
/**
 * Melodic phrase generation for the pitched instruments (kalimba, handpan): a seeded SCORED SEARCH over a
 * scale, not a random walk — candidates are ranked on measured consonance, stepwise motion, an arch contour
 * and a tonic cadence. Pure and DOM-free so the gate proves the claim. Exports `scoreMelody` and
 * `generateMelody`.
 * @module
 */

import { mulberry32, harmonicity } from "./groove.js";


const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const gauss = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

function pickW(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

const isTonic = (scale, i) => ((scale[i] % 12) + 12) % 12 === 0;
const isFifth = (scale, i) => ((scale[i] % 12) + 12) % 12 === 7;
function nearestTonicIndex(scale, from) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < scale.length; i++) if (isTonic(scale, i)) { const d = Math.abs(i - from); if (d < bestD) { bestD = d; best = i; } }
  return best < 0 ? 0 : best;
}

function buildPhrase(rng, scale, len, restP) {
  const notes = [];
  let prev = 0;
  for (let k = 0; k < len; k++) {
    if (k === 0) { notes.push({ i: nearestTonicIndex(scale, 0) }); prev = notes[0].i; continue; }
    if (rng() < restP) { notes.push({ rest: true }); continue; }
    const weights = scale.map((off, i) => {
      const leap = Math.abs(i - prev);
      const step = gauss(leap, 0, 2.4);                        
      return (0.05 + step) * (0.4 + 0.6 * harmonicity(off));   
    });
    const i = pickW(rng, weights);
    notes.push({ i }); prev = i;
  }
  return notes;
}

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

  s += 1.0 * mean(idxs.map((i) => harmonicity(scale[i])));

  let sum = 0, big = 0;
  for (let k = 1; k < idxs.length; k++) { const d = Math.abs(scale[idxs[k]] - scale[idxs[k - 1]]); sum += d; if (d > 7) big++; }
  const meanLeap = sum / (idxs.length - 1);
  s += 1.3 * gauss(meanLeap, 2.6, 2.4);
  s -= 0.28 * big;

  s += isTonic(scale, idxs[idxs.length - 1]) ? 1.0 : isFifth(scale, idxs[idxs.length - 1]) ? 0.4 : -0.2;
  s += isTonic(scale, idxs[0]) ? 0.5 : 0;

  const peak = idxs.indexOf(Math.max(...idxs));
  s += 0.5 * gauss(peak / Math.max(1, idxs.length - 1), 0.5, 0.3);

  const variety = new Set(idxs).size / idxs.length;
  s += 0.5 * gauss(variety, 0.55, 0.22);

  return s;
}

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
  for (let k = best.length - 1; k >= 0; k--) if (!best[k].rest) { best[k] = { i: nearestTonicIndex(scale, best[k].i) }; break; }
  return { notes: best, seed: seed >>> 0, score: bestScore, meanScore: sum / tries, tries };
}
