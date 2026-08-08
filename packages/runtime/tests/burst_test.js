
import { assert, assertEquals } from "jsr:@std/assert@1";
import { instantFreq, magnitude, fmActivity, envelopeTransitions, classifyEvent, CLASSIFY } from "../burst.js";
import { squelchOpen as levelSquelch } from "../demod.js";


function synthOok({ fs = 25_000, pulses = 8, pulseMs = 1, offsetHz = 500, noise = 0.005 } = {}) {
  const per = Math.round(fs * pulseMs / 1000), n = pulses * 2 * per;
  const re = new Float32Array(n), im = new Float32Array(n);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff - 0.5) * 2; };
  for (let i = 0; i < n; i++) {
    const on = Math.floor(i / per) % 2 === 0;
    const a = (on ? Math.SQRT2 : 0);                    
    const ph = 2 * Math.PI * offsetHz * i / fs;         
    re[i] = a * Math.cos(ph) + rnd() * noise;
    im[i] = a * Math.sin(ph) + rnd() * noise;
  }
  return { re, im, durationMs: n * 1000 / fs };
}

function synthNfm({ fs = 25_000, ms = 500, toneHz = 1000, devHz = 2500, noise = 0.005 } = {}) {
  const n = Math.round(fs * ms / 1000);
  const re = new Float32Array(n), im = new Float32Array(n);
  let seed = 999, ph = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0xffffffff - 0.5) * 2; };
  for (let i = 0; i < n; i++) {
    ph += 2 * Math.PI * devHz * Math.sin(2 * Math.PI * toneHz * i / fs) / fs;
    re[i] = Math.cos(ph) + rnd() * noise;
    im[i] = Math.sin(ph) + rnd() * noise;
  }
  return { re, im, durationMs: ms };
}

const meanPowerDb = (re, im) => {
  let p = 0;
  for (let i = 0; i < re.length; i++) p += re[i] * re[i] + im[i] * im[i];
  return 10 * Math.log10(p / re.length);
};

Deno.test("a LEVEL squelch cannot tell a doorbell from a voice — they carry the same power", () => {
  const ook = synthOok(), voice = synthNfm();
  const a = meanPowerDb(ook.re, ook.im), b = meanPowerDb(voice.re, voice.im);
  assert(Math.abs(a - b) < 0.5, `the two events must be power-matched for this to prove anything (${a} vs ${b})`);
  assertEquals(levelSquelch(a, a - 3, false), true);
  assertEquals(levelSquelch(b, b - 3, false), true);
});

Deno.test("fmActivity separates them, and a constant frequency error does NOT look like modulation", () => {
  const ook = synthOok(), voice = synthNfm();
  const fOok = fmActivity(ook.re, ook.im), fVoice = fmActivity(voice.re, voice.im);
  assert(fVoice > fOok * 5, `voice must show far more frequency movement (voice ${fVoice}, ook ${fOok})`);
  assert(fOok < CLASSIFY.fmBurst, `a 500 Hz offset carrier must read as unmodulated, got ${fOok}`);
  assert(fVoice >= CLASSIFY.fmVoice, `NFM at 2.5 kHz deviation must read as modulated, got ${fVoice}`);
  const f = instantFreq(ook.re, ook.im);
  let s = 0, ss = 0;
  for (const v of f) { s += v; ss += v * v; }
  const plain = Math.sqrt(Math.max(0, ss / f.length - (s / f.length) ** 2)) / (2 * Math.PI);
  assert(plain > fOok * 50, `naive unweighted variance must be wildly misleading here (plain ${plain}, weighted ${fOok})`);
  assert(plain > CLASSIFY.fmVoice, `…misleading enough to cross the voice threshold, which is the actual trap (${plain})`);
});

Deno.test("classifyEvent labels both correctly, and refuses to guess when it matches neither", () => {
  const ook = synthOok(), voice = synthNfm();
  const ookEv = { durationMs: ook.durationMs, fmActivity: fmActivity(ook.re, ook.im), transitions: envelopeTransitions(magnitude(ook.re, ook.im)) };
  const voiceEv = { durationMs: voice.durationMs, fmActivity: fmActivity(voice.re, voice.im), transitions: envelopeTransitions(magnitude(voice.re, voice.im)) };
  assertEquals(classifyEvent(ookEv), "burst");
  assertEquals(classifyEvent(voiceEv), "voice");
  assert(ookEv.transitions >= 8, `8 keyed pulses must show as edges, got ${ookEv.transitions}`);
  assertEquals(voiceEv.transitions, 0);                 
  assertEquals(classifyEvent({ durationMs: 50, fmActivity: 0.05, transitions: 0 }), "unknown");
});

Deno.test("instantFreq: a pure tone reads as one constant frequency", () => {
  const fs = 25_000, hz = 2_000, n = 256;
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.cos(2 * Math.PI * hz * i / fs); im[i] = Math.sin(2 * Math.PI * hz * i / fs); }
  const f = instantFreq(re, im);
  const expect = 2 * Math.PI * hz / fs;
  for (const v of f) assert(Math.abs(v - expect) < 1e-4, `constant tone drifted: ${v} vs ${expect}`);
});
