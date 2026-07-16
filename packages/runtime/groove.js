
export const N = 16;

export const METRIC_WEIGHTS = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];
const WMIN = -4, WSPAN = 4;   

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

export const rotate = (p, r) => p.map((_, i) => p[(((i + r) % p.length) + p.length) % p.length]);

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

export function syncopationNorm(p) {
  const onsets = p.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (!onsets) return 0;
  return Math.min(1, syncopation(p) / (onsets * WSPAN));
}

export const density = (p) => (p.length ? p.reduce((n, v) => n + (v ? 1 : 0), 0) / p.length : 0);

export const grooveU = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

const RATIOS = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];
const HMAX = 1 / Math.log2(2);   
export function harmonicity(semitones) {
  const s = ((Math.round(semitones) % 12) + 12) % 12;
  const [a, b] = RATIOS[s];
  const prod = a * b;
  return prod <= 1 ? 1 : Math.min(1, (1 / Math.log2(prod)) / HMAX);
}

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

export const BANDS = {
  low: { mu: 0.06, sigma: 0.12, w: 1.4 },    
  mid: { mu: 0.42, sigma: 0.18, w: 2.2 },    
  high: { mu: 0.26, sigma: 0.20, w: 1.0 },   
};

const CHROMA = [0, 3, 5, 7, 10, 12];

export function makeRiff(rng) {
  return Array.from({ length: N }, (_, i) => {
    if (METRIC_WEIGHTS[i] >= -2) return rng() < 0.78 ? 0 : 7;
    return pickW(rng, CHROMA, CHROMA.map(harmonicity));
  });
}

export function riffHarmonicity(riff, bassPattern) {
  const hit = riff.filter((_, i) => bassPattern[i]);
  if (!hit.length) return 0;
  return hit.reduce((s, n) => s + harmonicity(n), 0) / hit.length;
}


export function sampleVoices(rng, roles) {
  const on = roles.filter((r) => r.p >= 1 || rng() < r.p);
  const low = roles.filter((r) => r.band === "low");
  return on.some((r) => r.band === "low") || !low.length ? on : on.concat(low[0]);   
}

export function buildCandidate(rng, voices) {
  const tracks = {};
  for (const r of voices) tracks[r.id] = rotate(bjorklund(pick(rng, r.ks), N), pick(rng, r.rots));
  return { tracks, riff: makeRiff(rng) };
}

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
