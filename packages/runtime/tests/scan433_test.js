
import { assert, assertEquals } from "jsr:@std/assert@1";
import { channelPowers, findRuns, channelFloor, extractChannel, classifyChannel, CROWDED_CHANNEL } from "../scan433.js";
import { synthBand, DEMO_MS } from "../fixture433.js";
import { detectCtcss } from "../ctcss.js";
import { instantFreq } from "../burst.js";
import { LPD433, TUNE_HZ, channelCentre, channelAt } from "../chan433.js";


const SR = 2_400_000;
const msToByte = (ms) => Math.round(SR * ms / 1000) * 2;

Deno.test("extractChannel: the cutoff is half the CHANNEL, not the decimation Nyquist", () => {
  const bytes = synthBand({ ms: 60, noise: 0, events: [{ kind: "voice", channel: 20, startMs: 0, durMs: 60, strength: 0.8, devHz: 0, modHz: 0, toneHz: 0 }] });
  const power = (c) => { let p = 0; for (let i = 0; i < c.re.length; i++) p += c.re[i] ** 2 + c.im[i] ** 2; return p / c.re.length; };
  const at = (n) => power(extractChannel(bytes, { deltaHz: channelCentre(LPD433, n) - TUNE_HZ }));
  const on = at(20), adj = 10 * Math.log10(on / at(21)), far = 10 * Math.log10(on / at(25));
  assert(adj > 40, `adjacent-channel rejection must be real, got ${adj.toFixed(1)} dB`);
  assert(far > 55, `a channel five slots away must be gone, got ${far.toFixed(1)} dB`);
});

Deno.test("the fixture band lights up exactly the channels it transmits on", () => {
  const bytes = synthBand();
  const { frames, frameMs } = channelPowers(bytes);
  assert(frames.length > 100, `expected many frames over ${DEMO_MS} ms, got ${frames.length}`);
  assert(Math.abs(frameMs - 1024 * 1000 / SR) < 1e-6);
  const peak = new Float32Array(frames[0].length);
  for (const f of frames) for (let c = 0; c < f.length; c++) if (f[c] > peak[c]) peak[c] = f[c];
  const floor = channelFloor(peak);
  const lit = (n) => peak[n - 1] / floor;
  assert(lit(12) > 20, `channel 12 carries a voice, got ${lit(12).toFixed(1)}x floor`);
  assert(lit(47) > 20, `channel 47 carries a voice, got ${lit(47).toFixed(1)}x floor`);
  assertEquals(channelAt(LPD433, 433_920_000), CROWDED_CHANNEL);
  assert(lit(CROWDED_CHANNEL) > 20, `channel 35 carries the device bursts, got ${lit(CROWDED_CHANNEL).toFixed(1)}x`);
  assert(lit(60) < 5, `channel 60 is silent and must stay silent, got ${lit(60).toFixed(1)}x floor`);
});

Deno.test("findRuns: one transmission is one run, of the duration it was transmitted for", () => {
  const bytes = synthBand();
  const { frames, frameMs } = channelPowers(bytes);
  const series = frames.map((f) => f[11]);                      
  const quiet = frames.map((f) => f[59]);                       
  const floor = channelFloor(Float32Array.from(quiet));
  const runs = findRuns(Float32Array.from(series), { floor, minFrames: 3 });
  assertEquals(runs.length, 1, `one voice transmission must be one run, got ${runs.length}`);
  const ms = (runs[0].end - runs[0].start) * frameMs;
  assert(Math.abs(ms - 600) < 60, `the run should be ~600 ms, got ${ms.toFixed(0)} ms`);
  assertEquals(findRuns(Float32Array.from(quiet), { floor, minFrames: 3 }).length, 0, "silence must produce no runs");
});

Deno.test("classifyChannel: the doorbell reads as a device and the handheld as a person", () => {
  const bytes = synthBand();
  const burst = bytes.slice(msToByte(110), msToByte(150));       
  const gotBurst = classifyChannel(burst, { channelHz: TUNE_HZ, durationMs: 18 });
  assertEquals(gotBurst.kind, "burst", `device misread as ${gotBurst.kind} (fm ${gotBurst.fmActivity}, edges ${gotBurst.transitions})`);

  const voice = bytes.slice(msToByte(40), msToByte(260));        
  const gotVoice = classifyChannel(voice, { channelHz: channelCentre(LPD433, 12), durationMs: 600 });
  assertEquals(gotVoice.kind, "voice", `voice misread as ${gotVoice.kind} (fm ${gotVoice.fmActivity}, edges ${gotVoice.transitions})`);
  assert(gotVoice.fmActivity > gotBurst.fmActivity * 5, "the two must be separated by a wide margin, not a hair");
});

Deno.test("end to end: raw bytes off the antenna become a named CTCSS group", () => {
  const bytes = synthBand();
  const voice = bytes.slice(msToByte(20), msToByte(620));        
  const ch = extractChannel(bytes.slice(msToByte(20), msToByte(620)), { deltaHz: channelCentre(LPD433, 12) - TUNE_HZ });
  assert(voice.length > 0);
  const audio = instantFreq(ch.re, ch.im);                       
  const tone = detectCtcss(audio, ch.sampleRate);
  assert(tone, `no tone found in ${(audio.length / ch.sampleRate).toFixed(2)} s of demodulated audio`);
  assertEquals(tone.toneHz, 100.0, "the fixture transmits CTCSS 100.0 Hz and the chain must recover it");
});
