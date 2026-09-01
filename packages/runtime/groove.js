/* @ts-self-types="./groove.d.ts" */
/**
 * Groove theory: the maths behind "generate a beat a human actually wants to move to", so no music app has
 * to reinvent it. Pure functions, zero deps, no DOM. Four results from the literature — Euclidean rhythms
 * (`bjorklund`), Longuet-Higgins & Lee syncopation (`syncopation`), Witek's inverted-U (`grooveU`) and
 * Bowling & Purves harmonicity (`harmonicity`) — feed a scored search (`generateGroove`) that beats random by
 * construction, which the unit gate asserts.
 * @module
 */

/** Steps per bar — a 16-step 4/4 grid (sixteenths). */
export const N = 16;

/** Metric weight of each of the 16 grid positions (Longuet-Higgins & Lee): 0 on the downbeat down to -4 on a sixteenth offbeat. */
export const METRIC_WEIGHTS = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];
const WMIN = -4, WSPAN = 4;   

/**
 * Euclidean rhythm (Toussaint 2005 / Bjorklund): spread k onsets over n steps as evenly as possible.
 * @param k number of onsets
 * @param n number of steps
 * @returns a boolean array of length n, true where an onset falls
 */
export function bjorklund(k, n) {
  n = Math.max(0, Math.floor(n)); k = Math.floor(k);
  if (n === 0) return [];
  if (k <= 0) return Array(n).fill(false);
  if (k >= n) return Array(n).fill(true);
  let a = Array.from({ length: k }, () => [true]);
  let b = Array.from({ length: n - k }, () => [false]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length), na = [], nb = [];
    for (let i = 0; i < m; i++) na.push(a[i].concat(b[i]));
    const rest = a.length > m ? a : b;
    for (let i = m; i < rest.length; i++) nb.push(rest[i]);
    a = na; b = nb;
  }
  return a.concat(b).flat();
}

/**
 * Rotate a pattern left by r steps (negative r rotates right).
 * @param p the pattern array
 * @param r number of steps to rotate
 * @returns a new array of the same length
 */
export const rotate = (p, r) => p.map((_, i) => p[(((i + r) % p.length) + p.length) % p.length]);

/**
 * Raw Longuet-Higgins & Lee syncopation score of a 16-step pattern, summed over the bar.
 * @param p boolean pattern of length N
 * @returns the summed weight difference (0 for an empty or unsyncopated pattern)
 */
export function syncopation(p) {
  const on = [];
  for (let i = 0; i < p.length; i++) if (p[i]) on.push(i);
  if (!on.length) return 0;
  let s = 0;
  for (let k = 0; k < on.length; k++) {
    const i = on[k], next = on[(k + 1) % on.length];
    let best = -Infinity;
    for (let d = 1; d < p.length; d++) {
      const j = (i + d) % p.length;
      if (j === next) break;                       
      if (METRIC_WEIGHTS[j] > best) best = METRIC_WEIGHTS[j];
    }
    if (best > METRIC_WEIGHTS[i]) s += best - METRIC_WEIGHTS[i];
  }
  return s;
}

/**
 * Syncopation per onset, normalised to 0..1 so patterns of different density compare fairly.
 * @param p boolean pattern of length N
 * @returns a value in 0..1
 */
export function syncopationNorm(p) {
  const onsets = p.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (!onsets) return 0;
  return Math.min(1, syncopation(p) / (onsets * WSPAN));
}

/**
 * Fraction of steps that carry an onset.
 * @param p boolean pattern
 * @returns onsets ÷ length, 0 for an empty pattern
 */
export const density = (p) => (p.length ? p.reduce((n, v) => n + (v ? 1 : 0), 0) / p.length : 0);

/**
 * Witek's inverted-U as a Gaussian: reward peaks at `mu` and falls off either side.
 * @param x the measured value (e.g. normalised syncopation)
 * @param mu where the reward peaks
 * @param sigma how forgiving the peak is
 * @returns a reward in 0..1
 */
export const grooveU = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

const RATIOS = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];
const HMAX = 1 / Math.log2(2);   
/**
 * Consonance of an interval (Bowling & Purves 2018), scored from its just-intonation ratio.
 * @param semitones interval from the root in semitones (any integer; reduced mod 12)
 * @returns a value in 0..1 — unison/octave/fifth high, tritone/minor-second low
 */
export function harmonicity(semitones) {
  const s = ((Math.round(semitones) % 12) + 12) % 12;
  const [a, b] = RATIOS[s];
  const prod = a * b;
  return prod <= 1 ? 1 : Math.min(1, (1 / Math.log2(prod)) / HMAX);
}

/**
 * Seeded mulberry32 PRNG.
 * @param seed 32-bit integer seed
 * @returns a function yielding uniform floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickW = (rng, items, weights) => {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Per-band syncopation targets `{ mu, sigma, w }` for the low / mid / high roles — each its own inverted-U and weight. */
export const BANDS = {
  low: { mu: 0.06, sigma: 0.12, w: 1.4 },    
  mid: { mu: 0.42, sigma: 0.18, w: 2.2 },    
  high: { mu: 0.26, sigma: 0.20, w: 1.0 },   
};

const CHROMA = [0, 3, 5, 7, 10, 12];

/**
 * Draw a 16-step bass riff: tonic/fifth on strong positions, harmonicity-weighted pentatonic notes elsewhere.
 * @param rng a seeded random function (see `mulberry32`)
 * @returns an array of N semitone offsets from the root
 */
export function makeRiff(rng) {
  return Array.from({ length: N }, (_, i) => {
    if (METRIC_WEIGHTS[i] >= -2) return rng() < 0.78 ? 0 : 7;
    return pickW(rng, CHROMA, CHROMA.map(harmonicity));
  });
}

/**
 * Mean harmonicity of the riff notes that actually sound.
 * @param riff semitone offsets per step (from `makeRiff`)
 * @param bassPattern boolean pattern of the steps where a bass voice fires
 * @returns a value in 0..1, 0 when no bass step fires
 */
export function riffHarmonicity(riff, bassPattern) {
  const hit = riff.filter((_, i) => bassPattern[i]);
  if (!hit.length) return 0;
  return hit.reduce((s, n) => s + harmonicity(n), 0) / hit.length;
}


/**
 * Draw the line-up for one generation: each role plays with probability `p`, and a low-band voice is always kept.
 * @param rng a seeded random function
 * @param roles the app's voice roles `[{ id, band, ks, rots, p }]`
 * @returns the subset of roles that will play
 */
export function sampleVoices(rng, roles) {
  const on = roles.filter((r) => r.p >= 1 || rng() < r.p);
  const low = roles.filter((r) => r.band === "low");
  return on.some((r) => r.band === "low") || !low.length ? on : on.concat(low[0]);   
}

/**
 * Build one candidate groove from the fixed line-up.
 * @param rng a seeded random function
 * @param voices the roles that play (from `sampleVoices`)
 * @returns `{ tracks: { [id]: bool[N] }, riff }`
 */
export function buildCandidate(rng, voices) {
  const tracks = {};
  for (const r of voices) tracks[r.id] = rotate(bjorklund(pick(rng, r.ks), N), pick(rng, r.rots));
  return { tracks, riff: makeRiff(rng) };
}

/**
 * Score a candidate against the four literature results plus density, backbeat, floor and doubling terms.
 * @param cand a candidate from `buildCandidate`
 * @param roles the roles the candidate's tracks belong to
 * @returns the score — higher is more likely to make a human move
 */
export function scoreGroove(cand, roles) {
  const band = (name) => {
    const ids = roles.filter((r) => r.band === name).map((r) => r.id);
    const merged = Array.from({ length: N }, (_, i) => ids.some((id) => cand.tracks[id]?.[i]));
    return merged;
  };
  let score = 0;
  for (const [name, cfg] of Object.entries(BANDS)) {
    const p = band(name);
    if (!p.some(Boolean)) continue;
    score += cfg.w * grooveU(syncopationNorm(p), cfg.mu, cfg.sigma);
  }
  const all = Array.from({ length: N }, (_, i) => roles.some((r) => cand.tracks[r.id]?.[i]));
  score += 1.0 * grooveU(density(all), 0.55, 0.22);

  const bassIds = roles.filter((r) => r.bass).map((r) => r.id);
  const bassPat = Array.from({ length: N }, (_, i) => bassIds.some((id) => cand.tracks[id]?.[i]));
  if (bassPat.some(Boolean)) score += 1.2 * riffHarmonicity(cand.riff, bassPat);

  const backIds = roles.filter((r) => r.backbeat).map((r) => r.id);
  const back = [4, 12].filter((i) => backIds.some((id) => cand.tracks[id]?.[i])).length / 2;
  score += 0.8 * back;

  const low = band("low");
  score += low[0] ? 0.6 : -1.5;

  const figs = roles.map((r) => (cand.tracks[r.id] || []).map((v) => (v ? 1 : 0)).join("")).filter((f) => f.includes("1"));
  score -= 0.5 * (figs.length - new Set(figs).size);

  const lowIds = roles.filter((r) => r.band === "low").map((r) => r.id);
  if (lowIds.length > 1) {
    const collide = Array.from({ length: N }, (_, i) => lowIds.filter((id) => cand.tracks[id]?.[i]).length > 1).filter(Boolean).length;
    score -= 0.35 * (collide / N);
  }
  return score;
}

/**
 * Generate a groove: fix the line-up, draw `tries` candidates from the Euclidean space and keep the best-scoring one.
 * @param roles the app's voice roles `[{ id, band, ks, rots, p, bass?, backbeat? }]`
 * @param {object} [opts]
 * @param [opts.seed] seed for reproducibility
 * @param [opts.tries] candidates to score (default 220)
 * @returns the best candidate with `voices`, `seed`, `score`, `meanScore` and `tries` attached
 */
export function generateGroove(roles, { seed, tries = 220 } = {}) {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const voices = sampleVoices(rng, roles);       
  let best = null, bestScore = -Infinity, sum = 0;
  for (let i = 0; i < tries; i++) {
    const cand = buildCandidate(rng, voices);
    const sc = scoreGroove(cand, voices);
    sum += sc;
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  return { ...best, voices: voices.map((v) => v.id), seed: s, score: bestScore, meanScore: sum / tries, tries };
}
