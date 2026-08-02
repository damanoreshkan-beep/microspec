// microspec runtime — a deterministic 433 MHz band, synthesised as RAW IQ BYTES.
//
// This is the gate fixture, and its shape is the whole point. The predecessor app seeded a list of finished
// ROWS, so under the gate its screen looked perfect while the code that turns radio into rows had never once
// run. Here the fixture stops at the antenna: it produces the same interleaved signed-in-uint8 IQ that
// rtlsdr.js `read()` returns, and every stage above it — FFT, channel integration, run detection, extraction,
// classification — is the identical code the real radio drives.
//
// Deterministic by construction (seeded LCG, no Date, no Math.random) so screenshots and CI never flake.

import { TUNE_HZ, channelCentre, LPD433 } from "./chan433.js";

const TAU = 2 * Math.PI;

const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000 - 0.5) * 2;

// An event is what a listener would call a thing on the air:
//   { kind:"voice", channel, startMs, durMs, strength, toneHz?, devHz?, modHz? }
//   { kind:"burst", channel|offsetHz, startMs, durMs, strength, pulseMs? }
// `channel` is an LPD433 channel number; `offsetHz` places a device off the voice grid (real ISM devices sit
// at 433.92 MHz, which lands inside channel 35).
// The voice runs long enough to be CTCSS-resolvable: the 2.5 Hz tone spacing forces a >=0.4 s window
// (ctcss.js), so a fixture with a 200 ms transmission would make the tone untestable by construction.
export const DEMO_EVENTS = [
  { kind: "voice", channel: 12, startMs: 20, durMs: 600, strength: 0.55, toneHz: 100.0, devHz: 2500, modHz: 900 },
  { kind: "burst", offsetHz: 433_920_000, startMs: 120, durMs: 18, strength: 0.7, pulseMs: 1 },
  { kind: "burst", offsetHz: 433_920_000, startMs: 300, durMs: 18, strength: 0.7, pulseMs: 1 },
  { kind: "voice", channel: 47, startMs: 300, durMs: 320, strength: 0.35, toneHz: 118.8, devHz: 2500, modHz: 600 },
];
export const DEMO_MS = 700;

export function synthBand({
  centreHz = TUNE_HZ, sampleRate = 2_400_000, ms = 700,
  events = DEMO_EVENTS, noise = 0.02, seed = 20260802,
} = {}) {
  const n = Math.round(sampleRate * ms / 1000);
  const out = new Uint8Array(n * 2);
  const rnd = lcg(seed);

  // Pre-resolve each event to a frequency offset and a sample span.
  const evs = events.map((e) => {
    const hz = e.offsetHz ?? channelCentre(LPD433, e.channel);
    return {
      ...e,
      delta: hz - centreHz,
      from: Math.round(sampleRate * e.startMs / 1000),
      to: Math.round(sampleRate * (e.startMs + e.durMs) / 1000),
      phase: 0,
      pulse: Math.max(1, Math.round(sampleRate * (e.pulseMs ?? 1) / 1000)),
    };
  });

  for (let i = 0; i < n; i++) {
    let re = rnd() * noise, im = rnd() * noise;
    for (const e of evs) {
      if (i < e.from || i >= e.to) continue;
      const t = i / sampleRate;
      let amp = e.strength;
      if (e.kind === "voice") {
        // FM: carrier offset plus deviation from the speech tone, plus the sub-audible CTCSS tone.
        const mod = Math.sin(TAU * (e.modHz ?? 800) * t) + (e.toneHz ? 0.15 * Math.sin(TAU * e.toneHz * t) : 0);
        e.phase += TAU * (e.delta + (e.devHz ?? 2500) * mod) / sampleRate;
      } else {
        // OOK: the carrier frequency never moves; the amplitude is keyed on and off.
        e.phase += TAU * e.delta / sampleRate;
        if (Math.floor((i - e.from) / e.pulse) % 2 !== 0) amp = 0;
      }
      re += amp * Math.cos(e.phase);
      im += amp * Math.sin(e.phase);
    }
    out[i * 2] = quant(re);
    out[i * 2 + 1] = quant(im);
  }
  return out;
}

// Float → the farm's signed-in-uint8 (the layout rtlsdr.js read() hands over after its XOR).
function quant(v) {
  const q = Math.max(-128, Math.min(127, Math.round(v * 127)));
  return q < 0 ? q + 256 : q;
}
