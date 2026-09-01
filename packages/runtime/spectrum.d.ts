/**
 * # runtime/spectrum.js — the visualiser's maths, verified by `deno test` where WebGL cannot run
 *
 * Audio-reactive visual DSP and geometry with no browser and no WebGL: a Uint8Array FFT frame (0..255, from
 * an AnalyserNode) goes in; perceptual log band levels, a bass/mid/treble split, a spectral-centroid hue, an
 * asymmetric attack/release envelope, a scrolling height-field for the "audio terrain" and smoothed,
 * clamped device-tilt parallax come out — plus the pure geometry the ten three.js scenes and their Canvas2D
 * fallbacks share. The farm rule behind it: the maths lives in a unit-tested runtime module, not the app, so
 * the visual is verified by `deno test` even though WebGL only runs in CI, and a deterministic seeded frame
 * keeps the headless gate shot from being a dead flatline. Refs: audioMotion-analyzer (fractional-octave log
 * bands), Codrops 3D visualizer (uniform-driven displacement), MDN AnalyserNode.
 *
 * ![spectrum — FFT frame in, band levels, split, hue, envelope, terrain and geometry out](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-spectrum.svg)
 *
 * ## Import
 * ```js
 * import { logBandEdges, bandLevels, Envelope, seedFrame } from "/_rt/spectrum.js";                    // an app's page: the import map resolves /_rt/
 * import { logBandEdges, bandLevels, Envelope, seedFrame } from "@microspec/core/runtime/spectrum.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * **Analysis (a Uint8Array frame in)**
 * - {@link DEFAULTS} — `{ fMin: 32, fMax: 16000, bars: 28, sr: 44100, fftSize: 2048 }`.
 * - {@link logBandEdges} — bars+1 monotonic FFT-bin indices with equal ratios per band (≈1/6-octave at 28 bars).
 * - {@link bandLevels} — mean magnitude per band, 0..1; at least one bin per band even where edges collapse.
 * - {@link splitBands} — `{ bass, mid, treble }` energy over 20-150 / 250-2000 / 2000-16000 Hz.
 * - {@link spectralCentroid} — energy-weighted mean frequency as `{ hz, hue, t }`; hue runs 280 (warm) to 190 (cyan).
 * - {@link seedFrame} — a deterministic bass-heavy frame with ripple, animated by `phase`, no AudioContext and no Math.random.
 *
 * **Motion (stateful)**
 * - {@link Envelope} — fast-attack, slow-release follower per band; `update(targets)` mutates and returns its Float32Array `v`.
 * - {@link advanceTerrain} — scroll a caller-owned row-major height-field back one row with decay and inject the front row.
 * - {@link Parallax} — EMA-smoothed, clamped tilt to an offset in -1..1; eases back to centre when `reduced` or unread.
 *
 * **Geometry (pure)**
 * - {@link sampleBand} — the band level at a 0..1 fraction, clamped; 0 for an empty array.
 * - {@link idle} — the always-on "breath" `floor + amp·sin(2·phase)` so a silent scene is never a flatline.
 * - {@link fib} — point i of n on a unit sphere by the Fibonacci lattice, no pole clumping.
 * - {@link galaxyDisc} — Float32Array(n·3) base positions of a spun, jittered spiral disc from a caller-owned `rng`.
 * - {@link frameFit} — `{ dist, drop }` that frames a subject on BOTH axes of a perspective camera, so a portrait viewport never clips it.
 *
 * ## In practice
 * ```js
 * import { logBandEdges, bandLevels, splitBands, spectralCentroid, Envelope, seedFrame } from "/_rt/spectrum.js";   // rave
 *
 * const N = 28;
 * const EDGES = logBandEdges();
 * const env = Envelope(0.55, 0.12, N);
 *
 * function frame(live, phase) {                                  // live: analyser.getByteFrequencyData() or null
 *   const u8 = live || seedFrame(1024, phase);                   // paused/gate → gentle seeded idle
 *   const levels = env.update(bandLevels(u8, EDGES));            // asymmetric attack-fast/release-slow, per band
 *   const bands = splitBands(u8);                                // bass → radial pulse, mid → vertical drive, treble → sparkle
 *   const { hue } = spectralCentroid(u8);                        // a dub track sits violet, an acid line pushes to cyan
 *   return { levels, bands, hue };
 * }
 * ```
 *
 * ## How it fits
 * It imports nothing — the module is the leaf the visual stack stands on. In the runtime, `sensors.js`
 * hands raw DeviceOrientation readings to {@link Parallax} for their smoothing and clamping, and
 * `tests/spectrum_test.js` pins every function. Seven farm apps import it — rave (all of it, behind its
 * three.js gallery), drift (`splitBands`, `seedFrame` over Canvas2D), grain, handpan, homin, tide, v2m — and
 * the product module `rt/v2m.js` takes `fib` for its point clouds.
 *
 * ## Invariants and pitfalls
 * - Hearing is logarithmic: linear bins leave the top half of a bar chart dead, so bands are geometric
 *   (`binHz(i) = i · sr / fftSize`) and every edge is clamped to [1, bins-1].
 * - The maths lives here, not in the app: the three.js scene AND its Canvas2D fallback consume the same
 *   functions, which is what lets `deno test` verify a visual WebGL can only show in CI.
 * - `Envelope.update` and `advanceTerrain` mutate the buffer they return — the Float32Array is caller-owned
 *   state, not a fresh value per frame.
 * - `seedFrame` has no Math.random: the gate must be deterministic. `galaxyDisc` takes its `rng` from the
 *   caller for the same reason.
 * - Breathe a cloud by MULTIPLYING the base positions from `galaxyDisc` (stable, returns to rest) — never by
 *   integrating velocity, which drifts and blows up.
 * - A three.js `fov` is VERTICAL: a distance picked on a wide preview is wrong on a phone by exactly the
 *   aspect ratio (at 390×844 the horizontal field is 0.46× the vertical), and every scene in rave's gallery
 *   was once amputated at both rims. `frameFit` derives the distance from both fields; the binding axis wins.
 * - Raw β/γ on a hand-held phone is jittery and fast near-field parallax induces eye fatigue: `Parallax` is
 *   an EMA with a small alpha, and `reduced` or a null reading eases back to centre, never a hard jump.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/spectrum.js — edit the JSDoc there, never this file.
/**
 * Geometric (log-spaced) band edges as FFT-bin indices, so the bar chart reads as a real spectrum.
 * @param bars number of bands
 * @param fMin lowest frequency (Hz)
 * @param fMax highest frequency (Hz)
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns bars+1 monotonic bin indices in [1, bins-1]
 */
export function logBandEdges(bars?: number, fMin?: number, fMax?: number, sr?: number, fftSize?: number): number[];
/**
 * Mean magnitude within each band, normalised to 0..1.
 * @param u8 the FFT frame (Uint8Array, 0..255)
 * @param edges bin indices from logBandEdges
 * @returns one level per band
 */
export function bandLevels(u8: any, edges: any): any[];
/**
 * Bass / mid / treble energy (20-150 / 250-2000 / 2000-16000 Hz), each 0..1.
 * @param u8 the FFT frame
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns `{ bass, mid, treble }`
 */
export function splitBands(u8: any, sr?: number, fftSize?: number): {
    bass: number;
    mid: number;
    treble: number;
};
/**
 * Energy-weighted mean frequency of the frame, mapped to a hue so the visual depends on the song.
 * @param u8 the FFT frame
 * @param sr sample rate
 * @param fftSize the AnalyserNode fftSize
 * @returns { hz, hue (280..190), t (0..1 log position between 80 Hz and 6 kHz) }
 */
export function spectralCentroid(u8: any, sr?: number, fftSize?: number): number;
/**
 * A stateful asymmetric envelope follower: fast attack, slow release, per band.
 * @param attack rise coefficient per update (0..1)
 * @param release fall coefficient per update (0..1)
 * @param n number of bands
 * @returns { v, update(targets) } — `update` mutates and returns the Float32Array `v`
 */
export function Envelope(attack?: number, release?: number, n?: number): Float32Array;
/**
 * Scroll the audio-terrain height-field back one row (with decay) and inject the current levels as the front row.
 * @param grid caller-owned Float32Array(rows*cols), row-major, row 0 = front
 * @param rows grid rows
 * @param cols grid columns
 * @param front the current band levels
 * @returns the same grid, mutated
 */
export function advanceTerrain(grid: any, rows: any, cols: any, front: any): any;
/**
 * Smoothed, clamped device-tilt to parallax offset in -1..1; eases back to centre when reduced or unread.
 * @param opts `alpha` (EMA factor), `maxDeg` (tilt that maps to full offset), `gain`, `reduced` (prefers-reduced-motion)
 * @returns { x, y, update(beta, gamma) } — `update` feeds a DeviceOrientation reading and returns { x, y }
 */
export function Parallax({ alpha, maxDeg, gain, reduced }?: {
    alpha?: number;
    maxDeg?: number;
    gain?: number;
    reduced?: boolean;
}): number;
/**
 * Sample the band-level array at a 0..1 fraction, clamped.
 * @param levels band levels
 * @param frac position across the bands, 0..1
 * @returns the nearest band's level, 0 for an empty array
 */
export function sampleBand(levels: any, frac: any): any;
/**
 * Idle "breath" pulse so a silent scene is never a dead flatline.
 * @param phase animation phase (radians)
 * @param floor centre of the pulse
 * @param amp amplitude around the floor
 * @returns floor + amp·sin(2·phase)
 */
export function idle(phase: any, floor?: number, amp?: number): number;
/**
 * Point i of n on a unit sphere via the Fibonacci lattice — even, no pole clumping.
 * @param i point index
 * @param n total points
 * @returns [x, y, z] on the unit sphere
 */
export function fib(i: any, n: any): number[];
/**
 * Base positions for a spiral galaxy disc: n points over spun, jittered arms.
 * @param n number of points
 * @param opts `radius`, `branches`, `spin`, `randomness`, `power`, `thin` (y squash)
 * @param rng caller-owned 0..1 source (deterministic → testable)
 * @returns Float32Array(n*3) of xyz triples
 */
export function galaxyDisc(n: any, { radius, branches, spin, randomness, power, thin }?: {
    radius?: number;
    branches?: number;
    spin?: number;
    randomness?: number;
    power?: number;
    thin?: number;
}, rng?: () => number): Float32Array;
/**
 * Camera distance that frames a subject in a perspective camera on BOTH axes, so a portrait viewport never clips it.
 * @param halfW the subject's projected half-width in world units
 * @param halfH the subject's projected half-height in world units
 * @param fovYDeg the camera's vertical field of view (degrees)
 * @param aspect viewport width / height
 * @param opts `margin` (air around the subject, 1 = rim-hugging), `lift` (push up the frame, fraction of height)
 * @returns { dist, drop } — place the camera `dist` away and aim at (0, -drop, 0)
 */
export function frameFit(halfW: any, halfH: any, fovYDeg: any, aspect: any, { margin, lift }?: {
    margin?: number;
    lift?: number;
}): number;
/**
 * A deterministic seeded FFT frame — a bass-heavy descending curve with ripple — for the gate and the Canvas2D fallback.
 * @param bins frame length
 * @param phase animates the ripple without an AudioContext
 * @returns Uint8Array(bins) of 0..255 magnitudes
 */
export function seedFrame(bins?: number, phase?: number): Uint8Array;
/** Default analysis parameters: frequency range, bar count, sample rate and FFT size. */
export const DEFAULTS: {};
