/**
 * # runtime/groove.js — groove theory: a beat as a search result, not a dice roll
 *
 * The maths behind "generate a beat a human actually wants to move to", so no music app has to reinvent it.
 * Pure functions, zero deps, no DOM — fully unit-testable by the browser-free gate, which is the point: the
 * claim "this is not random" is mechanically proven in `tests/groove_test.js`, not asserted in a README. Four
 * results from the literature each map to one function — Toussaint's Euclidean rhythms ({@link bjorklund}),
 * Longuet-Higgins & Lee syncopation ({@link syncopation}), Witek's inverted-U ({@link grooveU}) and Bowling &
 * Purves harmonicity ({@link harmonicity}) — and {@link generateGroove} is a SCORED SEARCH over them: draw
 * candidates from the Euclidean space, score each against measured human preference, keep the best. It beats
 * random by construction. The app owns the taste (which voices, what an onset count means for a hat versus a
 * kick); the runtime owns the science.
 *
 * ![Groove theory: the four results, the fixed line-up and the scored search](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-groove.svg)
 *
 * ## Import
 * ```js
 * import { generateGroove, mulberry32 } from "/_rt/groove.js";                    // an app's page: the import map resolves /_rt/
 * import { generateGroove, mulberry32 } from "@microspec/core/runtime/groove.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **The grid**
 * - {@link N} — steps per bar: a 16-step 4/4 grid of sixteenths.
 * - {@link METRIC_WEIGHTS} — the Longuet-Higgins & Lee weight of each position, 0 on the downbeat down to -4 on a sixteenth offbeat.
 * - {@link BANDS} — per-band syncopation targets `{ mu, sigma, w }` for the low / mid / high roles.
 *
 * **The four results**
 * - {@link bjorklund} — `(k, n)` spreads k onsets over n steps as evenly as possible; E(3,8) is the tresillo, E(5,16) the bossa clave.
 * - {@link rotate} — `(p, r)` rotates a pattern left by r steps (son and rumba clave are rotations of each other).
 * - {@link syncopation} — raw LHL syncopation of a 16-step pattern, summed over the bar.
 * - {@link syncopationNorm} — the same per onset, normalised to 0..1 so densities compare fairly.
 * - {@link density} — the fraction of steps that carry an onset.
 * - {@link grooveU} — `(x, mu, sigma)` Witek's inverted-U as a Gaussian: reward peaks at `mu`, falls off either side.
 * - {@link harmonicity} — consonance of an interval in semitones, scored from its just-intonation ratio, 0..1.
 *
 * **The search**
 * - {@link mulberry32} — a seeded PRNG: "seed 42" always yields the same groove.
 * - {@link makeRiff} — `(rng)` a 16-step bass riff: tonic/fifth on strong positions, harmonicity-weighted pentatonic notes elsewhere.
 * - {@link riffHarmonicity} — `(riff, bassPattern)` mean harmonicity of the notes that actually sound.
 * - {@link sampleVoices} — `(rng, roles)` the line-up for one generation; each role plays with probability `p`, a low-band voice is always kept.
 * - {@link buildCandidate} — `(rng, voices)` one candidate `{ tracks, riff }`, onset counts and rotations drawn from each role's `ks`/`rots`.
 * - {@link scoreGroove} — `(cand, roles)` the score: per-band inverted-U, density, bass harmonicity, backbeat, floor, doubling and low-collision terms.
 * - {@link generateGroove} — `(roles, { seed, tries = 220 })` the whole thesis: fix the line-up, draw `tries` candidates, keep the best.
 *
 * ## In practice
 * ```js
 * import { generateGroove, mulberry32 } from "/_rt/groove.js";              // apps/rave/view.js
 *
 * // The app's vocabulary: id, band, legal onset counts, legal rotations, play probability, role flags.
 * const V = (id, band, ks, rots, p, extra) => ({ id, band, ks, rots, p, ...extra });
 * const voices = [
 *   V("kick", "low", [4], [0], 1),
 *   V("sub", "low", [4, 6, 7], [0], 0.85, { bass: true }),
 *   V("clap", "mid", [2], [4], 0.85, { backbeat: true }),
 *   V("hat", "high", [8, 11, 13], [0, 1, 2], 0.9),
 * ];
 * const g = generateGroove(voices, { seed });          // g.tracks[id] = bool[16], g.riff = semitones per step
 * const rng = mulberry32(seed ^ 0x5bf03635);           // the app's own stream for fx, from the same seed
 * ```
 *
 * ## How it fits
 * Imports nothing. Inside the runtime `melody.js` builds on `mulberry32` and `harmonicity`, and the `geofix` and
 * `melody` tests borrow the PRNG. In the farm 4 apps import it directly — rave (the full generator), code, nova
 * and trail (`mulberry32`) — and the product `rt/` modules `grain`, `ambient` and `tarot` reach it through
 * `@microspec/core/runtime/groove.js` for the same seeded stream; 9 farm apps precache it in their service
 * workers (code, drift, grain, handpan, kalimba, nova, rave, tarot, trail).
 *
 * ## Invariants and pitfalls
 * - The line-up is drawn ONCE per generation, before the search, never per candidate. Re-rolling it per
 *   candidate makes argmax converge on the same sparsest voices every run — once a backbeat has put the mid band
 *   on Witek's peak, adding a bass line can only move it off. Variety is the app's taste; placement is the science.
 * - {@link sampleVoices} never returns a floorless beat: when no low-band voice was drawn the first one is appended.
 * - Not one global syncopation target: the low band anchors the metre (`mu` 0.06), the mid band sits on Witek's
 *   peak (`mu` 0.42) and drives the groove, the high band lifts lightly (`mu` 0.26).
 * - Use {@link syncopationNorm}, not the raw sum, to compare patterns: a raw LHL sum grows with the number of
 *   notes and would make "more notes" look like "more groove".
 * - {@link riffHarmonicity} scores only the steps where a `bass: true` voice fires — scoring the whole riff would
 *   reward notes that never sound.
 * - The score punishes two voices playing the identical figure (doubling, not arrangement) and sub/kick landing on
 *   the same step (two sine tails on one transient is mud); a low band that misses the downbeat costs -1.5.
 * - Seeds are coerced with `>>> 0`; the result carries `seed`, `score`, `meanScore` and `tries` so a page can show
 *   how far the pick beat the mean.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/groove.js — edit the JSDoc there, never this file.
/**
 * Euclidean rhythm (Toussaint 2005 / Bjorklund): spread k onsets over n steps as evenly as possible.
 * @param k number of onsets
 * @param n number of steps
 * @returns a boolean array of length n, true where an onset falls
 */
export function bjorklund(k: any, n: any): any[];
/**
 * Raw Longuet-Higgins & Lee syncopation score of a 16-step pattern, summed over the bar.
 * @param p boolean pattern of length N
 * @returns the summed weight difference (0 for an empty or unsyncopated pattern)
 */
export function syncopation(p: any): number;
/**
 * Syncopation per onset, normalised to 0..1 so patterns of different density compare fairly.
 * @param p boolean pattern of length N
 * @returns a value in 0..1
 */
export function syncopationNorm(p: any): number;
/**
 * Consonance of an interval (Bowling & Purves 2018), scored from its just-intonation ratio.
 * @param semitones interval from the root in semitones (any integer; reduced mod 12)
 * @returns a value in 0..1 — unison/octave/fifth high, tritone/minor-second low
 */
export function harmonicity(semitones: any): number;
/**
 * Seeded mulberry32 PRNG.
 * @param seed 32-bit integer seed
 * @returns a function yielding uniform floats in [0, 1)
 */
export function mulberry32(seed: any): () => number;
/**
 * Draw a 16-step bass riff: tonic/fifth on strong positions, harmonicity-weighted pentatonic notes elsewhere.
 * @param rng a seeded random function (see `mulberry32`)
 * @returns an array of N semitone offsets from the root
 */
export function makeRiff(rng: any): any[];
/**
 * Mean harmonicity of the riff notes that actually sound.
 * @param riff semitone offsets per step (from `makeRiff`)
 * @param bassPattern boolean pattern of the steps where a bass voice fires
 * @returns a value in 0..1, 0 when no bass step fires
 */
export function riffHarmonicity(riff: any, bassPattern: any): number;
/**
 * Draw the line-up for one generation: each role plays with probability `p`, and a low-band voice is always kept.
 * @param rng a seeded random function
 * @param roles the app's voice roles `[{ id, band, ks, rots, p }]`
 * @returns the subset of roles that will play
 */
export function sampleVoices(rng: any, roles: any): any;
/**
 * Build one candidate groove from the fixed line-up.
 * @param rng a seeded random function
 * @param voices the roles that play (from `sampleVoices`)
 * @returns `{ tracks: { [id]: bool[N] }, riff }`
 */
export function buildCandidate(rng: any, voices: any): {
    tracks: {};
    riff: any[];
};
/**
 * Score a candidate against the four literature results plus density, backbeat, floor and doubling terms.
 * @param cand a candidate from `buildCandidate`
 * @param roles the roles the candidate's tracks belong to
 * @returns the score — higher is more likely to make a human move
 */
export function scoreGroove(cand: any, roles: any): number;
/**
 * Generate a groove: fix the line-up, draw `tries` candidates from the Euclidean space and keep the best-scoring one.
 * @param roles the app's voice roles `[{ id, band, ks, rots, p, bass?, backbeat? }]`
 * @param {object} [opts]
 * @param [opts.seed] seed for reproducibility
 * @param [opts.tries] candidates to score (default 220)
 * @returns the best candidate with `voices`, `seed`, `score`, `meanScore` and `tries` attached
 */
export function generateGroove(roles: any, { seed, tries }?: {
    seed?: any;
    tries?: any;
}): {
    voices: any;
    seed: number;
    score: number;
    meanScore: number;
    tries: any;
    tracks: {};
    riff: any[];
};
/**
 * # runtime/groove.js — groove theory: a beat as a search result, not a dice roll
 *
 * The maths behind "generate a beat a human actually wants to move to", so no music app has to reinvent it.
 * Pure functions, zero deps, no DOM — fully unit-testable by the browser-free gate, which is the point: the
 * claim "this is not random" is mechanically proven in `tests/groove_test.js`, not asserted in a README. Four
 * results from the literature each map to one function — Toussaint's Euclidean rhythms ({@link bjorklund}),
 * Longuet-Higgins & Lee syncopation ({@link syncopation}), Witek's inverted-U ({@link grooveU}) and Bowling &
 * Purves harmonicity ({@link harmonicity}) — and {@link generateGroove} is a SCORED SEARCH over them: draw
 * candidates from the Euclidean space, score each against measured human preference, keep the best. It beats
 * random by construction. The app owns the taste (which voices, what an onset count means for a hat versus a
 * kick); the runtime owns the science.
 *
 * ![Groove theory: the four results, the fixed line-up and the scored search](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-groove.svg)
 *
 * ## Import
 * ```js
 * import { generateGroove, mulberry32 } from "/_rt/groove.js";                    // an app's page: the import map resolves /_rt/
 * import { generateGroove, mulberry32 } from "@microspec/core/runtime/groove.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **The grid**
 * - {@link N} — steps per bar: a 16-step 4/4 grid of sixteenths.
 * - {@link METRIC_WEIGHTS} — the Longuet-Higgins & Lee weight of each position, 0 on the downbeat down to -4 on a sixteenth offbeat.
 * - {@link BANDS} — per-band syncopation targets `{ mu, sigma, w }` for the low / mid / high roles.
 *
 * **The four results**
 * - {@link bjorklund} — `(k, n)` spreads k onsets over n steps as evenly as possible; E(3,8) is the tresillo, E(5,16) the bossa clave.
 * - {@link rotate} — `(p, r)` rotates a pattern left by r steps (son and rumba clave are rotations of each other).
 * - {@link syncopation} — raw LHL syncopation of a 16-step pattern, summed over the bar.
 * - {@link syncopationNorm} — the same per onset, normalised to 0..1 so densities compare fairly.
 * - {@link density} — the fraction of steps that carry an onset.
 * - {@link grooveU} — `(x, mu, sigma)` Witek's inverted-U as a Gaussian: reward peaks at `mu`, falls off either side.
 * - {@link harmonicity} — consonance of an interval in semitones, scored from its just-intonation ratio, 0..1.
 *
 * **The search**
 * - {@link mulberry32} — a seeded PRNG: "seed 42" always yields the same groove.
 * - {@link makeRiff} — `(rng)` a 16-step bass riff: tonic/fifth on strong positions, harmonicity-weighted pentatonic notes elsewhere.
 * - {@link riffHarmonicity} — `(riff, bassPattern)` mean harmonicity of the notes that actually sound.
 * - {@link sampleVoices} — `(rng, roles)` the line-up for one generation; each role plays with probability `p`, a low-band voice is always kept.
 * - {@link buildCandidate} — `(rng, voices)` one candidate `{ tracks, riff }`, onset counts and rotations drawn from each role's `ks`/`rots`.
 * - {@link scoreGroove} — `(cand, roles)` the score: per-band inverted-U, density, bass harmonicity, backbeat, floor, doubling and low-collision terms.
 * - {@link generateGroove} — `(roles, { seed, tries = 220 })` the whole thesis: fix the line-up, draw `tries` candidates, keep the best.
 *
 * ## In practice
 * ```js
 * import { generateGroove, mulberry32 } from "/_rt/groove.js";              // apps/rave/view.js
 *
 * // The app's vocabulary: id, band, legal onset counts, legal rotations, play probability, role flags.
 * const V = (id, band, ks, rots, p, extra) => ({ id, band, ks, rots, p, ...extra });
 * const voices = [
 *   V("kick", "low", [4], [0], 1),
 *   V("sub", "low", [4, 6, 7], [0], 0.85, { bass: true }),
 *   V("clap", "mid", [2], [4], 0.85, { backbeat: true }),
 *   V("hat", "high", [8, 11, 13], [0, 1, 2], 0.9),
 * ];
 * const g = generateGroove(voices, { seed });          // g.tracks[id] = bool[16], g.riff = semitones per step
 * const rng = mulberry32(seed ^ 0x5bf03635);           // the app's own stream for fx, from the same seed
 * ```
 *
 * ## How it fits
 * Imports nothing. Inside the runtime `melody.js` builds on `mulberry32` and `harmonicity`, and the `geofix` and
 * `melody` tests borrow the PRNG. In the farm 4 apps import it directly — rave (the full generator), code, nova
 * and trail (`mulberry32`) — and the product `rt/` modules `grain`, `ambient` and `tarot` reach it through
 * `@microspec/core/runtime/groove.js` for the same seeded stream; 9 farm apps precache it in their service
 * workers (code, drift, grain, handpan, kalimba, nova, rave, tarot, trail).
 *
 * ## Invariants and pitfalls
 * - The line-up is drawn ONCE per generation, before the search, never per candidate. Re-rolling it per
 *   candidate makes argmax converge on the same sparsest voices every run — once a backbeat has put the mid band
 *   on Witek's peak, adding a bass line can only move it off. Variety is the app's taste; placement is the science.
 * - {@link sampleVoices} never returns a floorless beat: when no low-band voice was drawn the first one is appended.
 * - Not one global syncopation target: the low band anchors the metre (`mu` 0.06), the mid band sits on Witek's
 *   peak (`mu` 0.42) and drives the groove, the high band lifts lightly (`mu` 0.26).
 * - Use {@link syncopationNorm}, not the raw sum, to compare patterns: a raw LHL sum grows with the number of
 *   notes and would make "more notes" look like "more groove".
 * - {@link riffHarmonicity} scores only the steps where a `bass: true` voice fires — scoring the whole riff would
 *   reward notes that never sound.
 * - The score punishes two voices playing the identical figure (doubling, not arrangement) and sub/kick landing on
 *   the same step (two sine tails on one transient is mud); a low band that misses the downbeat costs -1.5.
 * - Seeds are coerced with `>>> 0`; the result carries `seed`, `score`, `meanScore` and `tries` so a page can show
 *   how far the pick beat the mean.
 * @module
 */
/** Steps per bar — a 16-step 4/4 grid (sixteenths). */
export const N: 16;
/** Metric weight of each of the 16 grid positions (Longuet-Higgins & Lee): 0 on the downbeat down to -4 on a sixteenth offbeat. */
export const METRIC_WEIGHTS: number[];
/**
 * Rotate a pattern left by r steps (negative r rotates right).
 * @param p the pattern array
 * @param r number of steps to rotate
 * @returns a new array of the same length
 */
export function rotate(p: any, r: any): any;
/**
 * Fraction of steps that carry an onset.
 * @param p boolean pattern
 * @returns onsets ÷ length, 0 for an empty pattern
 */
export function density(p: any): number;
/**
 * Witek's inverted-U as a Gaussian: reward peaks at `mu` and falls off either side.
 * @param x the measured value (e.g. normalised syncopation)
 * @param mu where the reward peaks
 * @param sigma how forgiving the peak is
 * @returns a reward in 0..1
 */
export function grooveU(x: any, mu: any, sigma: any): number;
/** Per-band syncopation targets `{ mu, sigma, w }` for the low / mid / high roles — each its own inverted-U and weight. */
export const BANDS: {};
