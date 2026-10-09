/* @ts-self-types="./breath.d.ts" */
/**
 * # runtime/breath.js — a form that breathes with the song, at almost no cost
 *
 * The obvious way to make something pulse with music is an AnalyserNode read on every frame. On a phone it is
 * the wrong way twice over. It routes the playing `<audio>` through Web Audio, and iOS suspends an
 * AudioContext in the background — the song stops when the screen locks, which is the one thing a music
 * app must never do. And it is a main-thread FFT plus a style write 60–120 times a second for as long as
 * the song plays.
 *
 * So the song is read ONCE instead. The copy kept on the phone is decoded at 8 kHz mono (the bass is all a
 * breath needs), low-passed, cut into 10 frames a second and smoothed with a fast rise and a slow fall
 * (`envelopeOf` — pure, unit-tested). The envelope becomes a `scale` keyframe track the length of the song,
 * handed to the COMPOSITOR as one Web Animation (`breathe`), whose clock is pinned to the audio element's:
 * play, pause, seek, rate. There is no requestAnimationFrame, no per-frame JavaScript and no Web Audio graph
 * in the playback path, so background play is untouched.
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
 * Imports `./gate.js` only. The first consumer is the product's fonoteka (the playing song's form). A
 * streamed song with no copy on the phone has no blob and so no breath — the form simply holds still.
 * Unit tests: `packages/runtime/tests/breath_test.js`.
 *
 * ## Invariants and pitfalls
 * - Never connect the playing element to an AudioContext for this (see above — the background-play trap).
 * - `breathe` is a no-op under `prefers-reduced-motion`, in the gate, and on an empty envelope: still is a
 *   valid state of the form, so a caller never needs a fallback.
 * - The depth is SUBTLE on purpose (4%): the form is a reading surface for the title under it, not a speaker
 *   cone. The animated property is `scale` on the element itself — never a CSS variable on a parent (a
 *   variable re-styles every child per frame).
 * - Decoding a 16 MB file costs ~16 MB plus ~8 MB of 8 kHz PCM for a moment; it runs once per song.
 * @module
 */
import { gate } from "./gate.js";

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
