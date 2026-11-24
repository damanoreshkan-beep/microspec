import { assert, assertEquals } from "jsr:@std/assert@1";
import { envelopeOf, breathe, BREATH_HZ, spectrumOf, SPECTRUM_HZ, SPECTRUM_BANDS, tapLevels, listen, TAP } from "../breath.js";

const RATE = 8000;
const kick = (seconds, freq = 60) => Float32Array.from({ length: RATE * seconds }, (_, i) => ((i / RATE) % 1 < 0.5 ? Math.sin(2 * Math.PI * freq * i / RATE) : 0));

Deno.test("spectrum — frames × bands bytes; a low tone lights the low bands, a high tone the high ones; silence is dark", () => {
  const rate = 22050, secs = 2;
  const song = Float32Array.from({ length: rate * secs }, (_, i) => Math.sin(2 * Math.PI * (i < rate ? 80 : 4000) * i / rate));
  const sp = spectrumOf(song, rate);
  assertEquals(sp.length % SPECTRUM_BANDS, 0);
  assert(Math.abs(sp.length / SPECTRUM_BANDS - secs * SPECTRUM_HZ) <= 1, `${sp.length / SPECTRUM_BANDS} frames for ${secs} s`);
  const frame = (f) => Array.from(sp.slice(f * SPECTRUM_BANDS, (f + 1) * SPECTRUM_BANDS));
  const peak = (arr) => arr.indexOf(Math.max(...arr));
  assert(peak(frame(10)) <= 2, `the 80 Hz second peaks low: band ${peak(frame(10))}`);
  assert(peak(frame(30)) >= 8, `the 4 kHz second peaks high: band ${peak(frame(30))}`);
  const quiet = spectrumOf(new Float32Array(rate), rate);
  assertEquals(Math.max(...quiet), 0, "silence is dark in every band");
});

Deno.test("breath — one frame per 1/BREATH_HZ s, bytes 0..255", () => {
  const env = envelopeOf(kick(4), RATE);
  assertEquals(env.length, 4 * BREATH_HZ);
  assert(env instanceof Uint8Array);
  assertEquals(envelopeOf(kick(4), RATE, 20).length, 80, "a caller's own rate");
});

Deno.test("breath — the form swells on the bass and falls back in the silence", () => {
  const env = envelopeOf(kick(4), RATE);
  const loud = env[3], quiet = env[9];
  assert(loud > 180, `a bass hit should be near full breath, got ${loud}`);
  assert(quiet < loud / 3, `the gap should fall well back, got ${quiet} after ${loud}`);
});

Deno.test("breath — the low-pass hears the bass, not the hi-hat", () => {
  const bass = envelopeOf(kick(2, 60), RATE), hat = envelopeOf(kick(2, 3500), RATE);
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

Deno.test("tapLevels — each band over its own running peak: a quiet band fills its range, silence stays dark, a peak falls slowly", () => {
  const peaks = new Float32Array(3);
  const a = tapLevels([0.8, 0.2, 0], peaks);
  assertEquals(Array.from(a).map((v) => +v.toFixed(3)), [1, 1, 0], "the first frame sets the peaks");
  assert(Math.abs(peaks[2] - 0.08) < 1e-6, "silence never lowers a peak under the floor");
  const b = tapLevels([0.4, 0.2, 0.04], peaks);
  assert(Math.abs(b[0] - 0.4 / (0.8 * 0.996)) < 1e-5, "half the peak reads about half");
  assertEquals(+b[1].toFixed(3), 1, "a steady quiet band stays full");
  assert(b[2] <= 0.5 + 1e-6, "a whisper under the floor stays dim");
  for (let i = 0; i < 600; i++) tapLevels([0.1, 0.2, 0], peaks);
  assert(peaks[0] < 0.8 * 0.2 && peaks[0] >= 0.1, `the loud peak has fallen to the band's level: ${peaks[0]}`);
});

const fakeWeb = (initial) => {
  const was = { AudioContext: globalThis.AudioContext, document: globalThis.document };
  const w = { ctxs: [], routes: [], resumed: 0, level: 0, dl: {} };
  globalThis.AudioContext = /** @type {any} */ (class {
    sampleRate = 44100; destination = { name: "speakers" }; ls = {}; state = initial;
    constructor() { w.ctxs.push(this); }
    resume() { w.resumed++; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    addEventListener(k, f) { this.ls[k] = f; }
    createAnalyser() { return { name: "analyser", fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 1024, getByteFrequencyData(b) { b.fill(w.level); } }; }
    createMediaElementSource(el) { const n = { el, to: [], connect(x) { n.to.push(x.name); } }; w.routes.push(n); return n; }
  });
  globalThis.document = /** @type {any} */ ({ addEventListener: (k, f) => (w.dl[k] = f), removeEventListener: (k) => delete w.dl[k] });
  w.restore = () => { globalThis.AudioContext = was.AudioContext; globalThis.document = was.document; };
  return w;
};
const element = () => {
  const ls = {};
  return { ls, paused: false, addEventListener: (k, f) => (ls[k] = f), removeEventListener: (k) => delete ls[k] };
};

Deno.test("listen — null where Web Audio is missing", () => {
  assertEquals(listen(/** @type {any} */ (element())), null);
});

Deno.test("listen — connect() in the tap makes the context and routes the element once, to the speakers and the analyser", () => {
  const w = fakeWeb("running");
  try {
    const audio = element();
    const tap = listen(/** @type {any} */ (audio));
    assertEquals(w.ctxs.length, 0, "nothing is made before the tap");
    assertEquals(tap.frame(), null);
    tap.connect();
    tap.connect();
    audio.ls.play();
    assertEquals(w.ctxs.length, 1, "one context");
    assertEquals(w.routes.length, 1, "the element is routed once");
    assertEquals(w.routes[0].el, audio);
    assertEquals(w.routes[0].to, ["speakers", "analyser"], "the song still reaches the speakers, and the analyser hears it");
    assertEquals(tap.state(), { ctx: "running", routed: true, fault: "", heard: false });
    w.level = 200;
    let f = null;
    for (let i = 0; i < TAP.heard; i++) f = tap.frame();
    assert(f && f.bands.length === SPECTRUM_BANDS && f.bands.some((v) => v > 200), "a loud song lights the bands");
    assertEquals(tap.state().heard, true);
    audio.paused = true;
    audio.src = "next-song.mp3";
    audio.paused = false;
    audio.ls.play();
    assert(tap.frame(), "the next song reads at once: the routing belongs to the element, not to a song");
    assertEquals(w.routes.length, 1, "switching songs never routes again");
    audio.paused = true;
    assertEquals(tap.frame(), null, "a paused song reads nothing");
    tap.stop();
    assertEquals(w.routes.length, 1, "stop never undoes the routing: the song keeps its speakers");
  } finally {
    w.restore();
  }
});

Deno.test("listen — a context born held back routes nothing until it runs, and is resumed by play, a touch and its own statechange", async () => {
  const w = fakeWeb("suspended");
  try {
    const audio = element();
    const tap = listen(/** @type {any} */ (audio));
    tap.connect();
    assertEquals(w.routes.length, 0, "a held-back context never takes the song: it would silence it");
    assert(w.resumed >= 1, "the tap asks it to run");
    assertEquals(tap.state().routed, false);
    const before = w.resumed;
    w.dl.pointerdown();
    audio.ls.play();
    assert(w.resumed >= before + 2, "a touch and a play resume it again");
    w.ctxs[0].state = "running";
    w.ctxs[0].ls.statechange();
    assertEquals(w.routes.length, 1, "once running, the element is routed");
    await Promise.resolve();
    assertEquals(w.routes.length, 1, "and only once");
    w.ctxs[0].state = "suspended";
    const held = w.resumed;
    w.ctxs[0].ls.statechange();
    assert(w.resumed > held, "a context that stops while routed is resumed at once");
  } finally {
    w.restore();
  }
});
