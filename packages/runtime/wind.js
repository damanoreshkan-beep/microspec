import { noiseBuffer } from "./audio.js";

export const FIPPLE = [[1, 1], [2, 0.11], [3, 0.26], [4, 0.05], [5, 0.1], [6, 0.03]];

export function handCovered(touched) {
  const set = new Set(touched);
  if (!touched.length) return set;                  
  const top = Math.min(...touched);
  for (let i = 0; i < top; i++) set.add(i);
  return set;
}

export function fingeredSemitone(covered, scale) {
  const holes = scale.length - 1;
  let k = 0;
  while (k < holes && covered.has(k)) k++;
  for (let i = k + 1; i < holes; i++) if (covered.has(i)) return scale[k] - 1;   
  return scale[k];
}

let _noise;                                    
const noiseFor = (ctx) => (_noise ||= noiseBuffer(ctx, "white", 4));

export function blow(ctx, dest, freq, {
  partials = FIPPLE,
  gain = 0.32,
  attack = 0.045,        
  release = 0.09,
  breath = 0.05,         
  chiff = 0.16,          
  vibrato = 5.2,         
  vibratoCents = 9,
} = {}) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + attack);
  out.connect(dest);

  const oscs = partials.map(([ratio, g]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq * ratio;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(out); o.start();
    return { o, ratio };
  });

  const lfo = ctx.createOscillator(); lfo.frequency.value = vibrato;
  const lg = ctx.createGain(); lg.gain.value = vibratoCents;
  lfo.connect(lg); lfo.start();
  for (const { o } of oscs) lg.connect(o.detune);

  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * 2; bp.Q.value = 1.4;
  const bg = ctx.createGain(); bg.gain.value = breath;
  const ns = ctx.createBufferSource(); ns.buffer = noiseFor(ctx); ns.loop = true;
  ns.connect(bp); bp.connect(bg); bg.connect(out); ns.start();

  if (chiff > 0) {
    const cf = ctx.createBiquadFilter(); cf.type = "highpass"; cf.frequency.value = freq * 1.5;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(chiff, ctx.currentTime);
    cg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    const cn = ctx.createBufferSource(); cn.buffer = noiseFor(ctx); cn.loop = true;
    cn.connect(cf); cf.connect(cg); cg.connect(out); cn.start(); cn.stop(ctx.currentTime + 0.06);
  }

  let dead = false;
  return {
    setFreq(f) {
      if (dead) return;
      const t = ctx.currentTime, glide = 0.02;
      for (const { o, ratio } of oscs) o.frequency.setTargetAtTime(f * ratio, t, glide);
      bp.frequency.setTargetAtTime(f * 2, t, glide);
    },
    stop() {
      if (dead) return; dead = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + release);
      const end = t + release + 0.02;
      for (const { o } of oscs) o.stop(end);
      lfo.stop(end); ns.stop(end);
      setTimeout(() => { try { out.disconnect(); } catch {  } }, (release + 0.1) * 1000);
    },
  };
}
