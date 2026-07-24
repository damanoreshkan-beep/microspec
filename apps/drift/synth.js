// apps/drift/synth.js — the SYNTHESIS half of drift (the SELECTION half is /_rt/ambient.js, unit-tested).
// Ten distinct sound-packs, each a signature timbre built from Web Audio primitives only (no samples, offline).
// A pack is a param set, not bespoke code: `pad` describes a sustained voice (the chord bed), `pluck` a
// self-freeing struck voice (the sparkle). Shared discipline from the farm's synth apps: voices are LIGHT and
// self-freeing (nodes don't GC promptly), the heavy FX (reverb/delay) live once on the master bus (view.js),
// and every osc/gain disconnects in onended or after its release tail. See rave/handpan for the lineage.

import { strike, filter as bqf, lfo, noiseSource } from "/_rt/audio.js";

// ---- reverb impulse: exponential-decay stereo noise → ConvolverNode. Longer tail than rave's beat verb
// (ambient wants 3–5 s), copied idiom from apps/rave + apps/handpan makeIR. ----
export function makeIR(ctx, seconds = 4, decay = 2.2) {
  const rate = ctx.sampleRate, len = Math.max(1, (seconds * rate) | 0);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// ---- the ten sound-packs. oscs = [type, freqRatio, detuneCents, gain]; fm morphs a carrier from bell→pad;
// noise adds a filtered air bed; formant shapes a vowel; vibrato/tremolo add life. Every pack is audibly its
// own instrument. `pluck` is the sparkle voice (runtime strike(): fundamental + inharmonic partials). ----
export const PACKS = [
  { id: "warmpad", key: "pWarmpad", icon: "lucide:audio-waveform",
    pad: { oscs: [["sawtooth", 1, -7, 0.5], ["sawtooth", 1, 7, 0.5], ["triangle", 1, 0, 0.55]], lpQ: 0.6 },
    pluck: { type: "triangle", dur: 1.4, partials: [[1, 1], [2, 0.25]] } },
  { id: "supersaw", key: "pSupersaw", icon: "lucide:activity",
    pad: { oscs: [["sawtooth", 1, -14, 0.16], ["sawtooth", 1, -9, 0.16], ["sawtooth", 1, -5, 0.16], ["sawtooth", 1, 0, 0.16], ["sawtooth", 1, 5, 0.16], ["sawtooth", 1, 9, 0.16], ["sawtooth", 1, 14, 0.16]], lpQ: 0.5 },
    pluck: { type: "sawtooth", dur: 1.0, partials: [[1, 1], [2, 0.2]] } },
  { id: "glassbell", key: "pGlassbell", icon: "lucide:gem",
    pad: { oscs: [["sine", 1, 0, 0.6], ["sine", 2, 0, 0.2]], fm: { ratio: 3.5, index: 3, decay: 2.6 }, lpQ: 0.7 },
    pluck: { type: "sine", dur: 2.4, partials: [[1, 1], [2.76, 0.4], [5.4, 0.2], [8.9, 0.1]] } },
  { id: "bowed", key: "pBowed", icon: "lucide:waves",
    pad: { oscs: [["sawtooth", 1, -4, 0.5], ["sine", 0.5, 0, 0.3], ["sawtooth", 1, 4, 0.4]], vibrato: { rate: 5.2, cents: 6 }, tremolo: { rate: 6, depth: 0.06 }, lpQ: 0.8 },
    pluck: { type: "sawtooth", dur: 1.6, attack: 0.06, partials: [[1, 1], [2, 0.3]] } },
  { id: "choir", key: "pChoir", icon: "lucide:mic-2",
    pad: { oscs: [["sawtooth", 1, -5, 0.5], ["sawtooth", 2, 5, 0.32]], formant: [[700, 7, 0.5], [1150, 9, 0.35], [2800, 11, 0.2]], vibrato: { rate: 5, cents: 5 }, lpQ: 0.7 },
    pluck: { type: "sawtooth", dur: 1.2, partials: [[1, 1], [2, 0.4]] } },
  { id: "granular", key: "pGranular", icon: "lucide:cloud-drizzle",
    pad: { oscs: [["sine", 1, -3, 0.35], ["sine", 1, 3, 0.35]], noise: { gain: 0.5, freq: 900, q: 4, sweepRate: 0.05, sweepDepth: 1400 }, lpQ: 0.7 },
    pluck: { type: "triangle", dur: 0.8, partials: [[1, 1]] } },
  { id: "mallet", key: "pMallet", icon: "lucide:disc-2",
    pad: { oscs: [["triangle", 1, -4, 0.5], ["triangle", 1, 4, 0.5]], lpQ: 0.6 },
    pluck: { type: "triangle", dur: 1.0, attack: 0.002, partials: [[1, 1], [3, 0.2]] } },
  { id: "sinedrone", key: "pSinedrone", icon: "lucide:circle",
    pad: { oscs: [["sine", 1, -3, 0.5], ["sine", 1, 3, 0.5], ["sine", 2, 0, 0.18]], lpQ: 0.5 },
    pluck: { type: "sine", dur: 2.0, partials: [[1, 1], [2, 0.2]] } },
  { id: "musicbox", key: "pMusicbox", icon: "lucide:bell",
    pad: { oscs: [["sine", 1, 0, 0.42], ["sine", 2, 0, 0.2]], fm: { ratio: 2, index: 2, decay: 1.2 }, lpQ: 0.7 },
    pluck: { type: "sine", dur: 1.6, partials: [[1, 1], [4, 0.5], [7, 0.15]] } },
  { id: "reedorgan", key: "pReedorgan", icon: "lucide:piano",
    pad: { oscs: [["sine", 1, 0, 0.5], ["sine", 3, 0, 0.18], ["sine", 5, 0, 0.1], ["triangle", 2, 0, 0.15]], lpQ: 0.6 },
    pluck: { type: "triangle", dur: 1.2, partials: [[1, 1], [3, 0.3], [5, 0.15]] } },
];
export const packById = (id) => PACKS.find((p) => p.id === id) || PACKS[0];

// ---- sustained pad voice: attack over `atk`, hold, and a `release(t)` that fades over `rel` then frees the
// graph. Returns { release }. peak is the per-voice ceiling (view.js scales it by voice count → no clipping).
// The per-voice lowpass is a fixed timbre shaper at the style cutoff; the MASTER filter (view.js) does the
// slow global sweep, so movement stays coherent across the whole mix. ----
export function padVoice(ctx, dest, freq, pack, style, peak, buffers) {
  const p = pack.pad, now = ctx.currentTime, atk = Math.max(0.01, style.atk), rel = Math.max(0.2, style.rel);
  const kill = [];                                             // nodes to stop; gains just disconnect
  const vca = ctx.createGain(); vca.gain.setValueAtTime(0.0001, now);
  const lp = bqf(ctx, "lowpass", style.cutoff, p.lpQ ?? 0.7);
  // tremolo (bow) sits after the VCA so it can't fight the ADSR
  let tail = vca;
  if (p.tremolo) { const tr = ctx.createGain(); vca.connect(tr); kill.push(lfo(ctx, p.tremolo.rate, p.tremolo.depth, tr.gain, 1)); tail = tr; }
  lp.connect(vca); tail.connect(dest);

  // formant bank (choir) OR a straight mix bus into the lowpass
  let mix = ctx.createGain();
  if (p.formant) { for (const [f, q, g] of p.formant) { const bp = bqf(ctx, "bandpass", f, q); const bg = ctx.createGain(); bg.gain.value = g; mix.connect(bp); bp.connect(bg); bg.connect(lp); } }
  else mix.connect(lp);

  // oscillators (unison partials); the first is the FM carrier if the pack morphs
  const oscs = [];
  p.oscs.forEach(([type, ratio, det, g], i) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * ratio; o.detune.value = det;
    const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(mix);
    if (p.vibrato) kill.push(lfo(ctx, p.vibrato.rate, p.vibrato.cents, o.detune));   // adds on top of static detune
    if (p.fm && i === 0) {
      const m = ctx.createOscillator(); m.type = "sine"; m.frequency.value = freq * p.fm.ratio;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * p.fm.index, now); mg.gain.setTargetAtTime(freq * 0.15, now, p.fm.decay / 3);
      m.connect(mg); mg.connect(o.frequency); m.start(now); kill.push(m);
    }
    o.start(now); oscs.push(o); kill.push(o);
  });

  // air/granular noise bed (the granular pack), routed through the same lowpass + VCA so it fades with the voice
  if (p.noise && buffers && buffers.white) {
    const s = noiseSource(ctx, buffers.white);
    const bp = bqf(ctx, "bandpass", p.noise.freq, p.noise.q);
    const ng = ctx.createGain(); ng.gain.value = p.noise.gain;
    s.connect(bp); bp.connect(ng); ng.connect(mix); s.start(now);
    if (p.noise.sweepRate) kill.push(lfo(ctx, p.noise.sweepRate, p.noise.sweepDepth, bp.frequency, p.noise.freq));
    kill.push(s);
  }

  vca.gain.setTargetAtTime(peak, now, atk / 3);
  return {
    release(t) {
      const tt = Math.max(t, ctx.currentTime);
      try { vca.gain.cancelScheduledValues(tt); vca.gain.setTargetAtTime(0.0001, tt, rel / 4); } catch { /* */ }
      const end = tt + rel + 2;
      for (const n of kill) { try { n.stop && n.stop(end); } catch { /* */ } }
      oscs[0] && (oscs[0].onended = () => { for (const n of kill) { try { n.disconnect(); } catch { /* */ } } try { mix.disconnect(); lp.disconnect(); vca.disconnect(); tail.disconnect && tail.disconnect(); } catch { /* */ } });
    },
  };
}

// ---- a granular/air noise layer as its own persistent voice (used when a pack/style wants texture). Kept
// separate from padVoice so the noise buffer comes from the engine (createEngine buffers). Returns { stop }. ----
export function textureVoice(ctx, dest, buffers, kind, gain) {
  if (kind === "none" || !buffers) return { stop() {} };
  const buf = kind === "sweep" ? buffers.white : buffers.pink;
  const s = noiseSource(ctx, buf);
  const bp = bqf(ctx, kind === "sweep" ? "bandpass" : "lowpass", kind === "sweep" ? 700 : 1200, kind === "sweep" ? 3 : 0.7);
  const g = ctx.createGain(); g.gain.value = 0.0001;
  s.connect(bp); bp.connect(g); g.connect(dest); s.start();
  g.gain.setTargetAtTime(gain, ctx.currentTime, 2);
  const sweep = kind === "sweep" ? lfo(ctx, 0.03, 1400, bp.frequency, 700) : null;
  return { stop() { const t = ctx.currentTime; try { g.gain.setTargetAtTime(0.0001, t, 1.5); } catch { /* */ } try { s.stop(t + 4); sweep && sweep.stop(t + 4); } catch { /* */ } s.onended = () => { try { s.disconnect(); bp.disconnect(); g.disconnect(); sweep && sweep.disconnect(); } catch { /* */ } }; } };
}

// ---- the sub-drone: a beat-free low sine (root + octave, gently detuned). Constant while playing. ----
export function droneVoice(ctx, dest, freq, gain) {
  const now = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.connect(dest);
  const a = ctx.createOscillator(); a.type = "sine"; a.frequency.value = freq; a.detune.value = -3;
  const b = ctx.createOscillator(); b.type = "sine"; b.frequency.value = freq * 2; b.detune.value = 4;
  const bg = ctx.createGain(); bg.gain.value = 0.35; a.connect(g); b.connect(bg); bg.connect(g);
  a.start(now); b.start(now); g.gain.setTargetAtTime(gain, now, 3);
  return { setFreq(f) { const t = ctx.currentTime; a.frequency.setTargetAtTime(f, t, 0.5); b.frequency.setTargetAtTime(f * 2, t, 0.5); },
    stop() { const t = ctx.currentTime; try { g.gain.setTargetAtTime(0.0001, t, 2); a.stop(t + 5); b.stop(t + 5); } catch { /* */ } a.onended = () => { try { a.disconnect(); b.disconnect(); bg.disconnect(); g.disconnect(); } catch { /* */ } }; } };
}

// ---- the sparkle: a struck note via the runtime's strike() (fundamental + inharmonic partials, exp decay). ----
export function sparkle(ctx, dest, freq, pack, peak) {
  const pl = pack.pluck;
  strike(ctx, dest, freq, { type: pl.type, dur: pl.dur, attack: pl.attack ?? 0.004, peak, partials: pl.partials });
}
