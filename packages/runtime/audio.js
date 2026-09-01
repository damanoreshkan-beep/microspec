/* @ts-self-types="./audio.d.ts" */
/**
 * Web Audio toolkit — everything is SYNTHESISED, no audio files. A lazy, fully guarded AudioContext
 * (`createEngine`, `AC`, `audioSupported`) so the UI still works where audio is unavailable, the canonical
 * noise generators (`noiseBuffer`, `noiseSource`), small node helpers (`filter`, `lfo`), an enveloped
 * `strike` tone and equal-temperament note math (`midiToFreq`, `noteToMidi`, `noteFreq`).
 * @module
 */
// microspec runtime — Web Audio toolkit. Everything is SYNTHESISED (no audio files). A lazy AudioContext
// (created on the first user gesture, fully guarded so the UI still works where audio is unavailable — the
// headless gate / linkedom pre-flight), the canonical noise generators, small node helpers, an enveloped
// "strike" tone, and equal-temperament note→frequency math. Shared by ambient (mixer) + kalimba
// (instrument) + any future sound app. Refs: noise.js (zacharydenton) · Noisehack · MDN.

/** The AudioContext constructor (standard or webkit-prefixed), or null where Web Audio is unavailable. */
export const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
/** Whether Web Audio exists in this environment (false in the headless gate / linkedom pre-flight). */
export const audioSupported = !!AC;

// ---- noise generators (a few-second looped buffer per colour) ----
/**
 * A few-second mono buffer of coloured noise, meant to be looped.
 * @param ctx the AudioContext
 * @param type "white", "pink" (Paul Kellett's filter) or anything else for brown (leaky integrator)
 * @param seconds buffer length (default 4)
 * @returns the AudioBuffer
 */
export function noiseBuffer(ctx, type, seconds = 4) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  if (type === "white") { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  else if (type === "pink") { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }         // Paul Kellett's filter
  else { let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } }                                                                       // brown = leaky integrator
  return buf;
}

// ---- node helpers ----
/**
 * A looping buffer source over a noise buffer (not started).
 * @param ctx the AudioContext
 * @param buf the buffer from `noiseBuffer`
 * @returns the AudioBufferSourceNode
 */
export const noiseSource = (ctx, buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
/**
 * A biquad filter node with its type, frequency and optional Q set.
 * @param ctx the AudioContext
 * @param type the BiquadFilterType ("lowpass", "bandpass", …)
 * @param freq cutoff / centre frequency in Hz
 * @param q resonance; left at the default when null
 * @returns the BiquadFilterNode
 */
export const filter = (ctx, type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q; return f; };
// route a low-freq oscillator into an AudioParam (target) to modulate it by ±depth around base
/**
 * Start a low-frequency oscillator that modulates an AudioParam by ±depth around base.
 * @param ctx the AudioContext
 * @param hz the LFO rate
 * @param depth modulation amplitude in the target's units
 * @param target the AudioParam to modulate
 * @param base the target's centre value; left untouched when null
 * @returns the running OscillatorNode (stop it to end the modulation)
 */
export const lfo = (ctx, hz, depth, target, base) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); if (base != null) target.value = base; o.start(); return o; };

// strike — a struck/plucked tone: fundamental + inharmonic partials, each with its OWN exponential decay
// (bells, chimes, plucks, kalimba tines). partials are [ratio, gain, decayScale?] — decayScale (default 1)
// shortens that partial's decay relative to `dur`, so bright inharmonic overtones can ping in the attack
// and die while the fundamental sustains (the physics of a struck bar). Fire-and-forget; nodes self-free.
/**
 * Play a struck/plucked tone: fundamental + partials, each with its own exponential decay. Fire-and-forget.
 * @param ctx the AudioContext
 * @param dest the node to connect the voices to
 * @param freq the fundamental frequency in Hz
 * @param opts `{ type, dur, attack, peak, partials }` — partials are `[ratio, gain, decayScale?]`
 */
export function strike(ctx, dest, freq, { type = "sine", dur = 1.2, attack = 0.004, peak = 0.4, partials = [[1, 1]] } = {}) {
  const t = ctx.currentTime;
  for (const [r, pg, decayScale = 1] of partials) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * r;
    const g = ctx.createGain(); o.connect(g); g.connect(dest);
    const d = dur * decayScale;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak * pg, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* */ } };   // free the graph promptly (nodes don't GC fast)
    o.start(t); o.stop(t + d + 0.05);
  }
}

// ---- equal-temperament note math ----
const SEMI = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
/**
 * Equal-temperament frequency of a MIDI note number (A4 = 69 = 440 Hz).
 * @param m the MIDI note number
 * @returns the frequency in Hz
 */
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
/**
 * Parse a note name like "C#4" or "Bb-1" into a MIDI note number.
 * @param note the note name (letter, optional # or b, octave)
 * @returns the MIDI number, or null when the name does not parse
 */
export function noteToMidi(note) { const m = /^([A-G][#b]?)(-?\d)$/.exec(String(note).trim()); return m ? SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12 : null; }
/**
 * Frequency of a note name via `noteToMidi` + `midiToFreq`.
 * @param note the note name
 * @returns the frequency in Hz, or null when the name does not parse
 */
export const noteFreq = (note) => { const m = noteToMidi(note); return m == null ? null : midiToFreq(m); };

// createEngine — a lazy audio engine. CALL IT INSIDE A GESTURE HANDLER (then engine.resume()). Returns
// null where audio is unavailable, so callers guard: `if (!eng.current) eng.current = createEngine()`.
/**
 * Create a lazy audio engine (context + master gain + optional noise buffers); call inside a gesture handler.
 * @param opts `{ master, noise }` — master gain (default 0.85) and whether to pre-render the noise buffers
 * @returns `{ ctx, master, buffers, strike, resume, close }`, or null where Web Audio is unavailable
 */
export function createEngine({ master = 0.85, noise = true } = {}) {
  if (!AC) return null;
  const ctx = new AC({ latencyHint: "interactive" });               // lowest-latency mode for playable instruments
  const masterGain = ctx.createGain(); masterGain.gain.value = master; masterGain.connect(ctx.destination);
  const buffers = noise ? { white: noiseBuffer(ctx, "white"), pink: noiseBuffer(ctx, "pink"), brown: noiseBuffer(ctx, "brown") } : {};
  return {
    ctx, master: masterGain, buffers,
    strike: (freq, opts) => strike(ctx, masterGain, freq, opts),
    resume: () => { try { return ctx.resume(); } catch { /* */ } },
    close: () => { try { ctx.close(); } catch { /* */ } },
  };
}
