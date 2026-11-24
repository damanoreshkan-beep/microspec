/* @ts-self-types="./breath.d.ts" */
/**
 * # runtime/breath.js — a form that breathes with the song, at almost no cost
 *
 * Two readings. OFFLINE: the copy kept on the phone is decoded once at 8 kHz mono, low-passed, cut into 10 frames a
 * second and smoothed with a fast rise and a slow fall (`envelopeOf` — pure, unit-tested); the envelope becomes a
 * `scale` keyframe track handed to the COMPOSITOR as one Web Animation pinned to the audio clock (`breathe`).
 * LIVE: `listen` reads the song as it plays, the standard way of every Web Audio visualiser — the element routed
 * through `createMediaElementSource` → an AnalyserNode and the speakers — so any song gives its spectrum whatever
 * its source. The live bands are normalised to their own running peak (`tapLevels` — pure, unit-tested), so a
 * quiet band moves as much as a loud one, as the offline spectrum is to its 95th percentile.
 *
 * ## Import
 * ```js
 * import { envelopeOfBlob, breathe } from "/_rt/breath.js";                    // an app's page: the import map resolves /_rt/
 * import { envelopeOf, BREATH_HZ } from "@microspec/core/runtime/breath.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link BREATH_HZ} — 10: envelope frames per second (a beat at 180 bpm is still three frames).
 * - {@link envelopeOf} — `envelopeOf(pcm, rate, hz)`: mono PCM → `Uint8Array` envelope 0..255 (bass RMS, smoothed, normalised to its 95th percentile).
 * - {@link envelopeOfBlob} — `envelopeOfBlob(blob, hz)`: decode an audio file at 8 kHz mono and return its envelope (browser only).
 * - {@link breathe} — `breathe(el, env, audio, { hz, depth })`: the envelope as a compositor `scale` animation pinned to `audio`; returns a stop.
 * - {@link listen} — `listen(audio, { bands })`: the live reading of a playing element — `{ connect(), frame(),
 *   state(), stop() }`; `connect()` inside the tap that starts the song; `frame()` → `{ pulse, bands }` (pulse
 *   0..1, `bands` a `Uint8Array` 0..255) or `null` while there is nothing to read; `state()` → `{ ctx, routed,
 *   fault, heard }`; `listen` itself is `null` where Web Audio is missing, and under the gate.
 * - {@link TAP} — the live reading's judgement of a loud frame and of a heard song.
 * - {@link tapLevels} — `tapLevels(levels, peaks, { fall, floor })`: levels 0..1 → each over its own running peak (pure).
 *
 * ## In practice
 * ```js
 * import { envelopeOfBlob, breathe } from "/_rt/breath.js";
 *
 * // the song is already on the phone (songstore): read it once, then let the compositor breathe with it
 * const env = await envelopeOfBlob(blob);
 * const stop = breathe(coreEl, env, audio);   // scale 1 → 1.04 on the bass; follows play/pause/seek by itself
 * // the next song, or an unmount:
 * stop();
 * ```
 *
 * ## How it fits
 * Imports `./gate.js` and `./spectrum.js` (the FFT bands). The first consumer is the product's fonoteka: the
 * playing song's cell breathes and wears its spectrum from `listen`, for a song on the phone and a streamed one alike.
 * Unit tests: `packages/runtime/tests/breath_test.js`.
 *
 * ## Invariants and pitfalls
 * - Routed, the element sounds only through the context, so a context that stops is a song that stops. Hence:
 *   the caller runs `connect()` inside the tap that starts the song (a context made in a gesture is born
 *   running); the element is routed only when the context runs; the context is resumed on every `play`, touch,
 *   key, page show and `statechange`; and `stop()` never undoes the routing.
 * - No `captureStream()`: measured on a Galaxy S25 Ultra in Samsung Internet, its copy of a playing song is
 *   silent (a mean band byte of 0–6 of 255 over 8 s), and it is not a standard path across browsers.
 * - The source must be same-origin (or CORS): a cross-origin element routes silence.
 * - `breathe` is a no-op under `prefers-reduced-motion`, in the gate, and on an empty envelope: still is a
 *   valid state of the form, so a caller never needs a fallback.
 * - The depth is SUBTLE on purpose (4%): the form is a reading surface for the title under it, not a speaker
 *   cone. The animated property is `scale` on the element itself — never a CSS variable on a parent (a
 *   variable re-styles every child per frame).
 * - Decoding a 16 MB file costs ~16 MB plus ~8 MB of 8 kHz PCM for a moment; it runs once per song.
 * @module
 */
import { gate } from "./gate.js";
import { logBandEdges, bandLevels, splitBands, Envelope } from "./spectrum.js";

/** Envelope frames per second. */
export const BREATH_HZ = 10;

/**
 * Mono PCM → the song's breath: a 0..255 envelope, BREATH_HZ frames a second. One-pole low-pass at ~160 Hz
 * (the kick and the bass line), RMS per frame, a fast-rise / slow-fall follower, normalised to the 95th
 * percentile so a quiet master breathes as visibly as a loud one and a single peak cannot flatten the rest.
 * @param {Float32Array | number[]} pcm mono samples, -1..1
 * @param {number} rate sample rate in Hz
 * @param {number} [hz] frames per second
 * @returns {Uint8Array} one byte per frame
 */
export function envelopeOf(pcm, rate, hz = BREATH_HZ) {
  const step = Math.max(1, Math.round(rate / hz)), n = Math.floor(pcm.length / step);
  const raw = new Float32Array(n);
  const a = 1 - Math.exp(-2 * Math.PI * 160 / rate);
  let lp = 0;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * step, end = i + step; i < end; i++) { lp += a * (pcm[i] - lp); sum += lp * lp; }
    raw[f] = Math.sqrt(sum / step);
  }
  let v = 0;
  for (let f = 0; f < n; f++) { const t = raw[f]; v += (t > v ? 0.7 : 0.25) * (t - v); raw[f] = v; }
  const p95 = n ? Float32Array.from(raw).sort()[Math.min(n - 1, Math.floor(n * 0.95))] : 0;
  const out = new Uint8Array(n);
  if (p95 > 1e-6) for (let f = 0; f < n; f++) out[f] = Math.round(255 * Math.min(1, raw[f] / p95));
  return out;
}

/**
 * Decode an audio file at 8 kHz mono and return its envelope. Browser only (OfflineAudioContext). The
 * decode resamples to the context's rate, so the PCM held in memory is 8000 samples a second, not 44100 × 2.
 * @param {Blob} blob an audio file (the copy kept on the phone)
 * @param {number} [hz] frames per second
 * @returns {Promise<Uint8Array>}
 */
export async function envelopeOfBlob(blob, hz = BREATH_HZ) {
  const buf = await blob.arrayBuffer();
  let ctx;
  try { ctx = new OfflineAudioContext(1, 1, 8000); } catch { ctx = new OfflineAudioContext(1, 1, 22050); }
  const audio = await ctx.decodeAudioData(buf);
  return envelopeOf(audio.getChannelData(0), audio.sampleRate, hz);
}

/** The spectrum's frame rate, frames a second. */
export const SPECTRUM_HZ = 20;
/** The spectrum's band count — twelve, log-spaced 55 Hz … 7 kHz. */
export const SPECTRUM_BANDS = 12;
/** The live reading's judgement: a frame is loud when its mean band level is at least `loud`; `heard` loud frames mean the song is heard. */
export const TAP = Object.freeze({ loud: 0.03, heard: 10 });

/**
 * Mono PCM → the song's SPECTRUM: `bands` energies a frame, SPECTRUM_HZ frames a second, one byte each. Band
 * centres are log-spaced from 55 Hz to 7 kHz (or the Nyquist, whichever is lower), each measured by Goertzel over
 * the frame, followed on a fast-rise /
 * slow-fall path per band and normalised per band to its 95th percentile, so a quiet band moves as much as a
 * loud one and the picture is the song's SHAPE, not its mastering. Computed ONCE per song, offline.
 * @param {Float32Array | number[]} pcm mono samples, -1..1
 * @param {number} rate sample rate in Hz
 * @param {{ bands?: number, hz?: number }} [opts]
 * @returns {Uint8Array} `frames × bands` bytes, frame-major
 */
export function spectrumOf(pcm, rate, { bands = SPECTRUM_BANDS, hz = SPECTRUM_HZ } = {}) {
  const step = Math.max(1, Math.round(rate / hz)), n = Math.floor(pcm.length / step);
  const top = Math.min(7000, rate * 0.45), lo = 55;
  const coef = Array.from({ length: bands }, (_, b) => 2 * Math.cos(2 * Math.PI * (lo * Math.pow(top / lo, b / Math.max(1, bands - 1))) / rate));
  const raw = new Float32Array(n * bands);
  for (let f = 0; f < n; f++) {
    const base = f * step;
    for (let b = 0; b < bands; b++) {
      const c = coef[b];
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = 0; i < step; i++) { s0 = pcm[base + i] + c * s1 - s2; s2 = s1; s1 = s0; }
      raw[f * bands + b] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / step;
    }
  }
  const out = new Uint8Array(n * bands);
  for (let b = 0; b < bands; b++) {
    let v = 0;
    const col = new Float32Array(n);
    for (let f = 0; f < n; f++) { const t = raw[f * bands + b]; v += (t > v ? 0.6 : 0.2) * (t - v); col[f] = v; }
    const p95 = n ? Float32Array.from(col).sort()[Math.min(n - 1, Math.floor(n * 0.95))] : 0;
    if (p95 > 1e-7) for (let f = 0; f < n; f++) out[f * bands + b] = Math.round(255 * Math.min(1, col[f] / p95));
  }
  return out;
}

/**
 * Decode an audio file (22.05 kHz mono) and return its spectrum. Browser only (OfflineAudioContext).
 * @param {Blob} blob an audio file (the copy kept on the phone)
 * @param {{ bands?: number, hz?: number }} [opts]
 * @returns {Promise<Uint8Array>} `frames × bands` bytes
 */
export async function spectrumOfBlob(blob, opts = {}) {
  const buf = await blob.arrayBuffer();
  let ctx;
  try { ctx = new OfflineAudioContext(1, 1, 22050); } catch { ctx = new OfflineAudioContext(1, 1, 44100); }
  const audio = await ctx.decodeAudioData(buf);
  return spectrumOf(audio.getChannelData(0), audio.sampleRate, opts);
}

const still = () => gate || (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * The envelope as ONE compositor animation of `scale` on `el`, its clock pinned to `audio`: it plays, pauses,
 * seeks and changes rate with the element, and corrects a drift over 150 ms on `timeupdate` (~4 Hz).
 * A no-op (returns a no-op stop) when still, with no Web Animations, or with an empty envelope.
 * @param {{ animate?: Function }} el the form to breathe (its own `scale` — never a parent variable); a DOM Element
 * @param {Uint8Array} env from {@link envelopeOf} / {@link envelopeOfBlob}
 * @param {{ paused: boolean, currentTime: number, playbackRate: number, addEventListener: Function, removeEventListener: Function }} audio
 *   the playing element (an HTMLMediaElement)
 * @param {{ hz?: number, depth?: number }} [opts] `depth` = the scale at full breath minus 1 (default 0.04)
 * @returns {() => void} stop — removes the listeners and the animation (the form returns to scale 1)
 */
export function breathe(el, env, audio, { hz = BREATH_HZ, depth = 0.04 } = {}) {
  if (still() || !env?.length || typeof el?.animate !== "function") return () => {};
  const frames = Array.from(env, (v) => ({ scale: String(1 + Math.round(depth * v / 255 * 1e4) / 1e4) }));
  const anim = el.animate(frames, { duration: env.length / hz * 1000, fill: "both", easing: "linear" });
  anim.pause();
  const sync = () => { anim.currentTime = audio.currentTime * 1000; };
  const on = { play: () => { sync(); anim.playbackRate = audio.playbackRate || 1; anim.play(); }, pause: () => { anim.pause(); sync(); } };
  const drift = () => { if (!audio.paused && Math.abs(Number(anim.currentTime) - audio.currentTime * 1000) > 150) sync(); };
  const rate = () => { anim.playbackRate = audio.playbackRate || 1; };
  const ev = [["playing", on.play], ["pause", on.pause], ["ended", on.pause], ["seeked", sync], ["timeupdate", drift], ["ratechange", rate]];
  for (const [k, f] of ev) audio.addEventListener(k, f);
  if (audio.paused) sync(); else on.play();
  return () => { for (const [k, f] of ev) audio.removeEventListener(k, f); anim.cancel(); };
}

/**
 * Each level over its own running peak: a peak rises at once to a louder level and keeps `fall` of itself a
 * frame, never under `floor`, so silence stays dark and a quiet band still fills its range.
 * @param {ArrayLike<number>} levels this frame's levels, 0..1
 * @param {Float32Array} peaks one running peak per level — the caller's state, mutated
 * @param {{ fall?: number, floor?: number }} [opts] `fall` 0.996 ≈ a 3 s half-life at 60 fps
 * @returns {Float32Array} the normalised levels, 0..1
 */
export function tapLevels(levels, peaks, { fall = 0.996, floor = 0.08 } = {}) {
  const out = new Float32Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    const v = levels[i] || 0;
    peaks[i] = Math.max(v, floor, (peaks[i] || 0) * fall);
    out[i] = Math.min(1, v / peaks[i]);
  }
  return out;
}

/**
 * The live reading of a playing element, the way every Web Audio visualiser does it: the element itself routed
 * once through `createMediaElementSource` → an AnalyserNode and the speakers. The AudioContext is made by
 * `connect()`, which the caller runs inside the tap that starts the song, so the context is born running; the
 * element is routed only once the context runs, and the context is resumed on every `play`, touch, key, page show
 * and `statechange`. Twelve log bands 55 Hz … 7 kHz and the bass, each over its running peak ({@link tapLevels}),
 * followed on a fast-rise / slow-fall path like the offline spectrum. `state()`: the context's state, whether the
 * element is routed, the last fault, and whether sound was heard ({@link TAP}).
 * @param {{ paused: boolean, addEventListener: Function, removeEventListener: Function }} audio
 *   the playing element (an HTMLMediaElement), with a same-origin source
 * @param {{ bands?: number }} [opts]
 * @returns {{ connect: () => void, frame: () => ({ pulse: number, bands: Uint8Array } | null), state: () => { ctx: string, routed: boolean, fault: string, heard: boolean }, stop: () => void } | null}
 */
export function listen(audio, { bands = SPECTRUM_BANDS } = {}) {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (gate || !Ctx) return null;
  const st = { ctx: null, an: null, bins: null, edges: null, node: null, fault: "", heard: 0 };
  const peaks = new Float32Array(bands + 1), env = Envelope(0.6, 0.2, bands + 1), out = new Uint8Array(bands);
  const route = () => {
    if (st.node || st.ctx?.state !== "running") return;
    try {
      st.node = st.ctx.createMediaElementSource(audio);
      st.node.connect(st.ctx.destination);
      st.node.connect(st.an);
    } catch (e) { st.fault = `element ${e?.name || e}`; st.node = null; }
  };
  const connect = () => {
    if (!st.ctx) {
      try { st.ctx = new Ctx(); } catch (e) { st.fault = `context ${e?.name || e}`; return; }
      st.an = st.ctx.createAnalyser(); st.an.fftSize = 2048; st.an.smoothingTimeConstant = 0.5;
      st.bins = new Uint8Array(st.an.frequencyBinCount);
      st.edges = logBandEdges(bands, 55, Math.min(7000, st.ctx.sampleRate * 0.45), st.ctx.sampleRate, st.an.fftSize);
      st.ctx.addEventListener?.("statechange", connect);
    }
    if (st.ctx.state !== "running" && st.ctx.state !== "closed") st.ctx.resume?.().then(route, () => {});
    route();
  };
  const doc = globalThis.document, WAKE = ["pointerdown", "keydown", "visibilitychange"];
  audio.addEventListener("play", connect);
  for (const k of WAKE) doc?.addEventListener?.(k, connect, { capture: true, passive: true });
  return {
    connect,
    frame() {
      if (!st.node || st.ctx?.state !== "running" || audio.paused) return null;
      st.an.getByteFrequencyData(st.bins);
      const lv = bandLevels(st.bins, st.edges);
      lv.push(splitBands(st.bins, st.ctx.sampleRate, st.an.fftSize).bass);
      if (lv.reduce((a, x) => a + x, 0) / lv.length >= TAP.loud) st.heard++;
      const v = env.update(tapLevels(lv, peaks));
      for (let b = 0; b < bands; b++) out[b] = Math.round(255 * v[b]);
      return { pulse: v[bands], bands: out };
    },
    state: () => ({ ctx: st.ctx?.state || "none", routed: !!st.node, fault: st.fault, heard: st.heard >= TAP.heard }),
    stop() {
      audio.removeEventListener("play", connect);
      if (st.node) return;
      for (const k of WAKE) doc?.removeEventListener?.(k, connect, { capture: true });
      st.ctx?.close?.().catch(() => {});
    },
  };
}
