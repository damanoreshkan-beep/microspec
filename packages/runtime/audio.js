
export const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
export const audioSupported = !!AC;

export function noiseBuffer(ctx, type, seconds = 4) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  if (type === "white") { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  else if (type === "pink") { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }         
  else { let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } }                                                                       
  return buf;
}

export const noiseSource = (ctx, buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
export const filter = (ctx, type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q; return f; };
export const lfo = (ctx, hz, depth, target, base) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); if (base != null) target.value = base; o.start(); return o; };

export function strike(ctx, dest, freq, { type = "sine", dur = 1.2, attack = 0.005, peak = 0.4, partials = [[1, 1]] } = {}) {
  const t = ctx.currentTime, g = ctx.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [r, pg] of partials) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * r; const pn = ctx.createGain(); pn.gain.value = pg; o.connect(pn); pn.connect(g); o.start(t); o.stop(t + dur + 0.05); }
}

const SEMI = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export function noteToMidi(note) { const m = /^([A-G][#b]?)(-?\d)$/.exec(String(note).trim()); return m ? SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12 : null; }
export const noteFreq = (note) => { const m = noteToMidi(note); return m == null ? null : midiToFreq(m); };

export function createEngine({ master = 0.85, noise = true } = {}) {
  if (!AC) return null;
  const ctx = new AC();
  const masterGain = ctx.createGain(); masterGain.gain.value = master; masterGain.connect(ctx.destination);
  const buffers = noise ? { white: noiseBuffer(ctx, "white"), pink: noiseBuffer(ctx, "pink"), brown: noiseBuffer(ctx, "brown") } : {};
  return {
    ctx, master: masterGain, buffers,
    strike: (freq, opts) => strike(ctx, masterGain, freq, opts),
    resume: () => { try { return ctx.resume(); } catch {  } },
    close: () => { try { ctx.close(); } catch {  } },
  };
}
