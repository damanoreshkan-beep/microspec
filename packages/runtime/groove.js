// microspec runtime — groove theory. The maths behind "generate a beat a human actually wants to move to",
// so no music app has to reinvent it. Pure functions, zero deps, no DOM → fully unit-testable by the
// browser-free gate (packages/runtime/runtime_test.js), which is the point: the claim "this is not random"
// is mechanically PROVEN there, not asserted in a README.
//
// Four results from the literature, each mapped to one function below:
//
//  1. Toussaint (2005), "The Euclidean Algorithm Generates Traditional Musical Rhythms" — Bjorklund's
//     algorithm spreads k onsets over n steps as evenly as possible, and the outputs ARE the traditional
//     rhythms of the world (E(3,8)=tresillo, E(5,8)=cinquillo, E(5,16)=bossa clave, E(4,16)=four-on-the-floor).
//     → bjorklund(). This is the pattern vocabulary — a formula, not a coin flip.
//
//  2. Longuet-Higgins & Lee (1984) — syncopation is measurable: give each grid position a metric weight
//     from the metrical tree; a note that outlasts the strongest unit it initiates is syncopated, scored by
//     the weight it covers minus its own. → METRIC_WEIGHTS, syncopation().
//
//  3. Witek et al. (2014), PLoS ONE 9(4):e94446, "Syncopation, Body-Movement and Pleasure in Groove Music" —
//     the relationship between syncopation and both pleasure and wanting-to-move is an INVERTED U: medium
//     syncopation wins; zero is boring, too much is incoherent. → grooveU(), a Gaussian = that curve.
//
//  4. Bowling & Purves (2018), PNAS — tones whose spectra resemble a harmonic series (small-integer
//     frequency ratios) are heard as consonant/attractive. → harmonicity(), computed from just ratios.
//
// The generator is therefore a SCORED SEARCH, not a sampler: draw candidates from the Euclidean space,
// score each against the curves above, keep the best. generateGroove() beats random by construction — and
// runtime_test.js asserts exactly that.

export const N = 16;

// Longuet-Higgins & Lee metric weights for a 16-step 4/4 bar (subdivision tree 2×2×2×2).
// 0 = the downbeat (strongest); -4 = a sixteenth offbeat (weakest). Higher = more metrically salient.
export const METRIC_WEIGHTS = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];
const WMIN = -4, WSPAN = 4;   // the widest possible weight jump — used to normalise syncopation to 0..1

// ---- 1. Euclidean rhythm (Toussaint 2005 / Bjorklund) ----
// Distribute k onsets over n steps as evenly as possible. Returns bool[n].
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

// Rotate a pattern left by r (a rotation of a Euclidean rhythm is still one of its traditional forms —
// son clave and rumba clave are rotations of each other).
export const rotate = (p, r) => p.map((_, i) => p[(((i + r) % p.length) + p.length) % p.length]);

// ---- 2. Syncopation (Longuet-Higgins & Lee 1984) ----
// A note sounds until the next onset (wrapping at the bar). If, while it sounds, it covers a position with
// a HIGHER metric weight than its own onset, it outlasts the unit it initiated → syncopation, scored by the
// difference. Sum over the bar.
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
      if (j === next) break;                       // the next onset — this note stops sounding here
      if (METRIC_WEIGHTS[j] > best) best = METRIC_WEIGHTS[j];
    }
    if (best > METRIC_WEIGHTS[i]) s += best - METRIC_WEIGHTS[i];
  }
  return s;
}

// Syncopation per onset, normalised to 0..1 — comparable across densities (a raw LHL sum just grows with
// the number of notes, which would make "more notes" look like "more groove").
export function syncopationNorm(p) {
  const onsets = p.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (!onsets) return 0;
  return Math.min(1, syncopation(p) / (onsets * WSPAN));
}

export const density = (p) => (p.length ? p.reduce((n, v) => n + (v ? 1 : 0), 0) / p.length : 0);

// ---- 3. The Witek inverted-U ----
// A Gaussian IS the inverted-U curve the paper measured: reward peaks at `mu` and falls off either side, so
// "no syncopation" and "chaos" are both scored down. sigma = how forgiving the peak is.
export const grooveU = (x, mu, sigma) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

// ---- 4. Harmonicity (Bowling & Purves 2018) ----
// Just-intonation ratio per semitone. Consonance tracks small-integer ratios, so we score with Euler-style
// 1/log2(a·b): unison/octave/fifth high, tritone/minor-second low. Computed from the ratios, not a taste table.
const RATIOS = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];
const HMAX = 1 / Math.log2(2);   // the unison (1:1 → log2(1)=0) is clamped to the octave's score as the ceiling
export function harmonicity(semitones) {
  const s = ((Math.round(semitones) % 12) + 12) % 12;
  const [a, b] = RATIOS[s];
  const prod = a * b;
  return prod <= 1 ? 1 : Math.min(1, (1 / Math.log2(prod)) / HMAX);
}

// ---- deterministic RNG (mulberry32) ----
// Seeded so a generated beat is reproducible and shareable — "seed 42" always yields the same groove.
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

// ---- band targets ----
// Not one global syncopation number: the polyphonic groove literature is clear that the roles differ — the
// low end ANCHORS the metre (near-zero syncopation) while the mid/bass voices syncopate AGAINST it, and that
// tension is where the groove lives. So each band gets its own inverted-U target.
export const BANDS = {
  low: { mu: 0.06, sigma: 0.12, w: 1.4 },    // kick/sub: hold the pulse down
  mid: { mu: 0.42, sigma: 0.18, w: 2.2 },    // bass/stab: Witek's peak — the groove driver
  high: { mu: 0.26, sigma: 0.20, w: 1.0 },   // hats/ride: light lift, not chaos
};

// Bass pitches, as semitone offsets from the root. The minor-pentatonic vocabulary of techno bass; each
// candidate note is weighted by harmonicity(), so the fifth and octave dominate and the tritone is rare.
const CHROMA = [0, 3, 5, 7, 10, 12];

export function makeRiff(rng) {
  return Array.from({ length: N }, (_, i) => {
    // Strong metric positions anchor the tonic (a root on the downbeat is what makes the rest legible as
    // tension); weak positions draw from the pool weighted by harmonicity.
    if (METRIC_WEIGHTS[i] >= -2) return rng() < 0.78 ? 0 : 7;
    return pickW(rng, CHROMA, CHROMA.map(harmonicity));
  });
}

// Mean harmonicity of the notes you ACTUALLY hear (riff steps where a bass voice fires) — scoring the whole
// riff would reward notes that never sound.
export function riffHarmonicity(riff, bassPattern) {
  const hit = riff.filter((_, i) => bassPattern[i]);
  if (!hit.length) return 0;
  return hit.reduce((s, n) => s + harmonicity(n), 0) / hit.length;
}

// ---- the scored search ----
// `roles`: [{ id, band: "low"|"mid"|"high", ks:[…], rots:[…], p }] — the app owns its voice vocabulary
// (what an onset count means for a hat vs a kick); the runtime owns the theory.

// Which voices play at all — drawn ONCE per generation, before the search, never per candidate.
// This is the difference between a generator you press twice and one you press twenty times. If the search
// re-rolled the line-up for every candidate, argmax would converge on the same handful of "safest" voices
// every single run: once a backbeat has put the mid band on Witek's peak, ADDING a bass line can only move
// it off, so a scorer left to choose the instrumentation will always choose the sparsest one that scores.
// Fixing the line-up first means each generation searches a different space — the scorer then answers the
// question it is actually good at ("where do these voices go?") instead of one it is bad at ("what is
// interesting?"). Variety is the app's taste; placement is the runtime's science.
export function sampleVoices(rng, roles) {
  const on = roles.filter((r) => r.p >= 1 || rng() < r.p);
  const low = roles.filter((r) => r.band === "low");
  return on.some((r) => r.band === "low") || !low.length ? on : on.concat(low[0]);   // never a floorless beat
}

// Build one candidate: every supplied voice plays, with its onset count and rotation drawn from the legal
// Euclidean space the app declared for it.
export function buildCandidate(rng, voices) {
  const tracks = {};
  for (const r of voices) tracks[r.id] = rotate(bjorklund(pick(rng, r.ks), N), pick(rng, r.rots));
  return { tracks, riff: makeRiff(rng) };
}

// Score a candidate against the four results. Higher = more likely to make a human move.
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
  // Overall density has its own sweet spot — a wall of notes and a near-empty bar both kill groove.
  const all = Array.from({ length: N }, (_, i) => roles.some((r) => cand.tracks[r.id]?.[i]));
  score += 1.0 * grooveU(density(all), 0.55, 0.22);

  // Harmonicity of the audible bass line (Bowling & Purves).
  const bassIds = roles.filter((r) => r.bass).map((r) => r.id);
  const bassPat = Array.from({ length: N }, (_, i) => bassIds.some((id) => cand.tracks[id]?.[i]));
  if (bassPat.some(Boolean)) score += 1.2 * riffHarmonicity(cand.riff, bassPat);

  // A backbeat on 2 and 4 is the single strongest "this is danceable" cue in 4/4 — reward it when a voice
  // whose role is the backbeat lands there.
  const backIds = roles.filter((r) => r.backbeat).map((r) => r.id);
  const back = [4, 12].filter((i) => backIds.some((id) => cand.tracks[id]?.[i])).length / 2;
  score += 0.8 * back;

  // The low band must actually exist and land on the downbeat — no kick, no floor.
  const low = band("low");
  score += low[0] ? 0.6 : -1.5;

  // Two voices playing the exact same figure is doubling, not arrangement: it costs mix headroom and adds
  // no rhythmic information. Penalise duplicates so the search spends its voices on different ideas.
  const figs = roles.map((r) => (cand.tracks[r.id] || []).map((v) => (v ? 1 : 0)).join("")).filter((f) => f.includes("1"));
  score -= 0.5 * (figs.length - new Set(figs).size);

  // Penalise sub/kick landing on the same step everywhere: two sine tails on one transient = mud, not weight.
  const lowIds = roles.filter((r) => r.band === "low").map((r) => r.id);
  if (lowIds.length > 1) {
    const collide = Array.from({ length: N }, (_, i) => lowIds.filter((id) => cand.tracks[id]?.[i]).length > 1).filter(Boolean).length;
    score -= 0.35 * (collide / N);
  }
  return score;
}

// generateGroove — draw `tries` candidates from the Euclidean space and keep the highest-scoring one.
// This is the whole thesis: the space is a formula (Toussaint), the ranking is measured human preference
// (Witek · LHL · Bowling & Purves), so the output is a search result, not a dice roll.
export function generateGroove(roles, { seed, tries = 220 } = {}) {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const voices = sampleVoices(rng, roles);       // the line-up: drawn once, then held fixed
  let best = null, bestScore = -Infinity, sum = 0;
  for (let i = 0; i < tries; i++) {
    const cand = buildCandidate(rng, voices);
    const sc = scoreGroove(cand, voices);
    sum += sc;
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  return { ...best, voices: voices.map((v) => v.id), seed: s, score: bestScore, meanScore: sum / tries, tries };
}
