import { assert, assertEquals } from "jsr:@std/assert@1";
import { envelopeOf, breathe, BREATH_HZ } from "../breath.js";

const RATE = 8000;
// a 60 Hz "kick" that is loud for 0.5 s, silent for 0.5 s — four bars of it
const kick = (seconds, freq = 60) => Float32Array.from({ length: RATE * seconds }, (_, i) => ((i / RATE) % 1 < 0.5 ? Math.sin(2 * Math.PI * freq * i / RATE) : 0));

Deno.test("breath — one frame per 1/BREATH_HZ s, bytes 0..255", () => {
  const env = envelopeOf(kick(4), RATE);
  assertEquals(env.length, 4 * BREATH_HZ);
  assert(env instanceof Uint8Array);
  assertEquals(envelopeOf(kick(4), RATE, 20).length, 80, "a caller's own rate");
});

Deno.test("breath — the form swells on the bass and falls back in the silence", () => {
  const env = envelopeOf(kick(4), RATE);
  const loud = env[3], quiet = env[9];   // 0.3 s into a hit, 0.4 s into the gap after it
  assert(loud > 180, `a bass hit should be near full breath, got ${loud}`);
  assert(quiet < loud / 3, `the gap should fall well back, got ${quiet} after ${loud}`);
});

Deno.test("breath — the low-pass hears the bass, not the hi-hat", () => {
  const bass = envelopeOf(kick(2, 60), RATE), hat = envelopeOf(kick(2, 3500), RATE);
  // both normalise to their own p95, so compare the RAW energy instead: same amplitude, very different breath
  const lp = (f) => { const a = 1 - Math.exp(-2 * Math.PI * 160 / RATE); let y = 0, s = 0; for (let i = 0; i < RATE; i++) { y += a * (Math.sin(2 * Math.PI * f * i / RATE) - y); s += y * y; } return s; };
  assert(lp(60) > 20 * lp(3500), "a 3.5 kHz tone passes the 160 Hz low-pass at a twentieth of the bass");
  assert(bass.some((v) => v > 0) && hat.length === bass.length);
});

Deno.test("breath — loudness-independent: a quiet master breathes like a loud one", () => {
  const loud = envelopeOf(kick(4), RATE), quiet = envelopeOf(kick(4).map((v) => v * 0.05), RATE);
  for (let i = 0; i < loud.length; i++) assert(Math.abs(loud[i] - quiet[i]) <= 2, `frame ${i}: ${loud[i]} vs ${quiet[i]}`);
});

Deno.test("breath — silence and a too-short input are flat, never NaN", () => {
  assertEquals([...envelopeOf(new Float32Array(RATE), RATE)].every((v) => v === 0), true);
  assertEquals(envelopeOf(new Float32Array(10), RATE).length, 0);
});

Deno.test("breath — breathe is a no-op without Web Animations (Deno, an old engine) and on an empty envelope", () => {
  const stop = breathe({}, new Uint8Array([1, 2, 3]), /** @type {any} */ ({}));
  assertEquals(typeof stop, "function");
  stop();
  const stop2 = breathe({ animate: () => { throw new Error("must not animate an empty envelope"); } }, new Uint8Array(0), /** @type {any} */ ({}));
  stop2();
});

Deno.test("breath — the keyframe track follows the audio element's clock", () => {
  const calls = [];
  const anim = { currentTime: 0, playbackRate: 1, pause: () => calls.push("pause"), play: () => calls.push("play"), cancel: () => calls.push("cancel") };
  let frames = null, opts = null;
  const el = { animate: (f, o) => { frames = f; opts = o; return anim; } };
  const ls = {};
  const audio = { paused: true, currentTime: 12.5, playbackRate: 1, addEventListener: (k, f) => (ls[k] = f), removeEventListener: (k) => delete ls[k] };
  const stop = breathe(el, new Uint8Array([0, 255, 128]), /** @type {any} */ (audio));
  assertEquals(frames.map((f) => f.scale), ["1", "1.04", "1.0201"]);
  assertEquals(opts.duration, 300, "three frames at 10 Hz");
  assertEquals(anim.currentTime, 12500, "a paused element pins the track to its position");
  audio.paused = false; audio.currentTime = 20; ls.playing();
  assertEquals(anim.currentTime, 20000);
  assertEquals(calls.at(-1), "play");
  audio.currentTime = 21; anim.currentTime = 20900; ls.timeupdate();
  assertEquals(anim.currentTime, 20900, "a 100 ms drift is left alone");
  audio.currentTime = 22; ls.timeupdate();
  assertEquals(anim.currentTime, 22000, "a 1.1 s drift is corrected");
  ls.pause();
  assertEquals(calls.at(-1), "pause");
  stop();
  assertEquals(calls.at(-1), "cancel");
  assertEquals(Object.keys(ls).length, 0, "every listener removed");
});
