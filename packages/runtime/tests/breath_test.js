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

Deno.test("listen — null without captureStream: the element is never connected to a context", () => {
  assertEquals(listen(/** @type {any} */ ({ addEventListener() {}, paused: true })), null);
});

Deno.test("listen — the next song: the ended copy is replaced by a fresh capture, a late track attaches on addtrack", () => {
  const sources = [], was = { AudioContext: globalThis.AudioContext, MediaStream: globalThis.MediaStream };
  globalThis.AudioContext = /** @type {any} */ (class {
    state = "running"; sampleRate = 44100;
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 1024, getByteFrequencyData() {} }; }
    createMediaStreamSource(ms) { const n = { track: ms.tracks[0], connect() {}, disconnect() { n.off = true; } }; sources.push(n); return n; }
  });
  globalThis.MediaStream = /** @type {any} */ (class { constructor(tracks) { this.tracks = tracks; } });
  const track = (id) => ({ id, readyState: "live", stop() { this.readyState = "ended"; } });
  const stream = (tracks) => {
    const ls = {};
    return { tracks, ls, getAudioTracks: () => tracks, getTracks: () => tracks, addEventListener: (k, f) => (ls[k] = f) };
  };
  const ls = {};
  const caps = [stream([track("song-1")]), stream([track("song-2")]), stream([])];
  let n = 0;
  const audio = { paused: false, captureStream: () => caps[n++], addEventListener: (k, f) => (ls[k] = f), removeEventListener: (k) => delete ls[k] };
  try {
    const tap = listen(/** @type {any} */ (audio));
    assert(tap, "a tap where captureStream and Web Audio exist");
    assertEquals(sources.map((s) => s.track.id), ["song-1"], "the playing song is read");
    caps[0].tracks[0].readyState = "ended";
    ls.playing();
    assertEquals(sources.map((s) => s.track.id), ["song-1", "song-2"], "the next song's playing takes a fresh capture");
    assert(sources[0].off, "the ended copy is disconnected");
    caps[1].tracks[0].readyState = "ended";
    ls.playing();
    assertEquals(sources.length, 2, "a capture with no track yet attaches nothing");
    caps[2].tracks.push(track("song-3"));
    caps[2].ls.addtrack();
    assertEquals(sources.map((s) => s.track.id), ["song-1", "song-2", "song-3"], "a track that lands later is attached on addtrack");
    tap.stop();
  } finally {
    globalThis.AudioContext = was.AudioContext;
    globalThis.MediaStream = was.MediaStream;
  }
});

Deno.test("listen — state names where the reading stands: a refused capture, a silent copy, a heard one, a context woken by a touch", () => {
  const was = { AudioContext: globalThis.AudioContext, MediaStream: globalThis.MediaStream, document: globalThis.document };
  let level = 0, resumed = 0;
  const ctxs = [];
  globalThis.AudioContext = /** @type {any} */ (class {
    state = "suspended"; sampleRate = 44100;
    constructor() { ctxs.push(this); }
    resume() { resumed++; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 1024, getByteFrequencyData(a) { a.fill(level); } }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  });
  globalThis.MediaStream = /** @type {any} */ (class { constructor(tracks) { this.tracks = tracks; } });
  const dl = {};
  globalThis.document = /** @type {any} */ ({ addEventListener: (k, f) => (dl[k] = f), removeEventListener: (k) => delete dl[k] });
  const ls = {};
  const tracks = [{ readyState: "live", stop() {} }];
  let refuse = true;
  const audio = {
    paused: false, addEventListener: (k, f) => (ls[k] = f), removeEventListener: (k) => delete ls[k],
    captureStream: () => { if (refuse) throw Object.assign(new Error("cross-origin"), { name: "SecurityError" }); return { getAudioTracks: () => tracks, getTracks: () => tracks, addEventListener() {} }; },
  };
  try {
    const tap = listen(/** @type {any} */ (audio));
    assertEquals(tap.state(), { ctx: "suspended", track: "none", fault: "capture SecurityError", heard: false, mode: "capture" });
    assertEquals(tap.frame(), null, "nothing to read without a copy");
    refuse = false;
    ls.playing();
    assertEquals(tap.state(), { ctx: "suspended", track: "live", fault: "", heard: false, mode: "capture" });
    assertEquals(tap.frame(), null, "a context that is not running reads nothing");
    const before = resumed;
    dl.pointerdown();
    assert(resumed > before, "a touch on the page resumes the held context");
    ctxs[0].state = "running";
    dl.pointerdown();
    assertEquals(resumed, before + 1, "a running context is left alone");
    assert(tap.frame(), "a running context with a live copy gives a frame");
    assertEquals(tap.state().heard, false, "a copy that carries only silence is not heard");
    level = 200;
    tap.frame();
    assertEquals(tap.state().heard, false, "one loud frame is not yet heard");
    for (let i = 1; i < TAP.heard; i++) tap.frame();
    assertEquals(tap.state().heard, true, "sound held on the copy is heard");
    tap.stop();
    assertEquals(Object.keys(dl).length, 0, "the page listeners are removed");
  } finally {
    globalThis.AudioContext = was.AudioContext;
    globalThis.MediaStream = was.MediaStream;
    globalThis.document = was.document;
  }
});

Deno.test("listen — a capture copy silent while the song plays routes the element once through the analyser; a loud copy never does", () => {
  const was = { AudioContext: globalThis.AudioContext, MediaStream: globalThis.MediaStream, document: globalThis.document };
  const run = (level) => {
    const made = [];
    globalThis.AudioContext = /** @type {any} */ (class {
      state = "running"; sampleRate = 44100; destination = { name: "speakers" }; ls = {};
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      addEventListener(k, f) { this.ls[k] = f; }
      createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 1024, getByteFrequencyData(b) { b.fill(level); } }; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createMediaElementSource(el) { const n = { el, to: [], connect(x) { n.to.push(x); } }; made.push(n); return n; }
    });
    globalThis.MediaStream = /** @type {any} */ (class { constructor(t) { this.tracks = t; } });
    globalThis.document = /** @type {any} */ ({ addEventListener() {}, removeEventListener() {} });
    const track = { readyState: "live", stop() {} };
    const audio = { paused: false, captureStream: () => ({ getAudioTracks: () => [track], getTracks: () => [track], addEventListener() {} }), addEventListener() {}, removeEventListener() {} };
    const tap = listen(/** @type {any} */ (audio));
    for (let i = 0; i < TAP.window * 2 + 1; i++) tap.frame();
    return { made, state: tap.state(), tap };
  };
  try {
    const quiet = run(0);
    assertEquals(quiet.made.length, 1, "a silent copy routes the element once, not on every window");
    assertEquals(quiet.state.mode, "element");
    assertEquals(quiet.made[0].to.map((x) => x.name || "analyser"), ["speakers", "analyser"], "the element still reaches the speakers, and the analyser hears it");
    assertEquals(quiet.state.heard, false, "silence is not heard");
    quiet.tap.stop();
    const loud = run(200);
    assertEquals(loud.made.length, 0, "a loud copy is proven and the element stays untouched");
    assertEquals(loud.state.mode, "capture");
    assertEquals(loud.state.heard, true);
  } finally {
    globalThis.AudioContext = was.AudioContext;
    globalThis.MediaStream = was.MediaStream;
    globalThis.document = was.document;
  }
});
