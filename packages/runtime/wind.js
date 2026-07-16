// microspec runtime — the blown-pipe voice. A fipple flute (сопілка, флояра, денцівка, фрілка, tin
// whistle, recorder) is a SUSTAINED instrument: it holds a note for as long as there is breath, and the
// player changes pitch underneath it without ever re-attacking. audio.js `strike()` cannot express that —
// it is percussive by construction, attack straight into decay — so a plucked/struck primitive is the wrong
// shape for a whole family of instruments. This is that family's primitive.
//
//   const v = blow(ctx, dest, 523.25);   // starts sounding
//   v.setFreq(587.33);                   // legato — pitch moves, the breath never stops
//   v.stop();                            // release, then self-cleans
//
// The timbre is taken from published fipple-flute acoustics, not tuned by ear:
//   · the fundamental dominates, and partials above the 5th die away fast;
//   · ODD harmonics dominate the even ones — the labium edge sits near-symmetrically in the jet, so the
//     even modes are poorly driven. That imbalance IS the recorder's hollow, pure timbre. Give a fipple
//     flute a full even harmonic series and it stops sounding like one and starts sounding like a reed.
//   · a real pipe is never silent between the harmonics: turbulent jet noise at the labium is always there,
//     and the "chiff" at the start of a note is that noise before the standing wave establishes.
// Refs: Bolton (flute-a-bec.com/acoustiquegb.html) · recorder spectrum literature.
import { noiseBuffer } from "./audio.js";

// [ratio, gain] — odd-dominant, fundamental-led. The even partials are present but quiet: removing them
// entirely gives a synthetic hollowness (a pure square), keeping them equal gives a reed.
export const FIPPLE = [[1, 1], [2, 0.11], [3, 0.26], [4, 0.05], [5, 0.1], [6, 0.03]];

// fingeredSemitone — which note a set of covered holes sounds, from the ACOUSTICS rather than a chart.
//
//   the air column effectively ends at the FIRST OPEN hole from the top — that sets the note;
//   holes covered BELOW that opening lengthen the column slightly and flatten it about a semitone.
//
// The second line is the cross/fork fingering ("вилка"), and it is how a six-hole diatonic pipe reaches
// notes between its scale steps. Encoding the rule rather than a lookup table means the chromatics fall out
// instead of being transcribed — and it is checkable: on a D whistle, C natural is fingered ○●●○○○ (top
// hole open, so the base is the seventh, C♯; two holes covered below it flatten it to C natural). This
// reproduces that, and every other entry of the standard chart, from one line of physics.
//
// Generic across the fipple family — сопілка, флояра, денцівка, фрілка, tin whistle, recorder — because the
// hole count and the scale are the caller's. `scale[i]` = semitones above the tonic with i holes covered
// consecutively from the top; scale.length - 1 = the number of holes.
// NOT modelled: half-holing (rolling a finger to cover part of a hole), which real players use for the
// semitones a fork cannot reach. A touchscreen has no half of a fingertip.
export function fingeredSemitone(covered, scale) {
  const holes = scale.length - 1;
  let k = 0;
  while (k < holes && covered.has(k)) k++;
  for (let i = k + 1; i < holes; i++) if (covered.has(i)) return scale[k] - 1;   // fork → flatten
  return scale[k];
}

let _noise;                                    // one shared noise buffer per context — it is 4s of random
const noiseFor = (ctx) => (_noise ||= noiseBuffer(ctx, "white", 4));

// blow — start a sustained pipe voice. Returns { setFreq, stop }. Never throws; every node it makes is
// disconnected on stop() after the release tail, because WebAudio nodes do not GC promptly (crbug #904) and
// a flute app holds and releases hundreds of them.
export function blow(ctx, dest, freq, {
  partials = FIPPLE,
  gain = 0.32,
  attack = 0.045,        // a jet takes time to form — an instant attack reads as a synth, not a pipe
  release = 0.09,
  breath = 0.05,         // continuous turbulence at the labium
  chiff = 0.16,          // the noise transient before the standing wave settles
  vibrato = 5.2,         // Hz — the player's, not the instrument's
  vibratoCents = 9,
} = {}) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + attack);
  out.connect(dest);

  // ---- harmonics ----
  const oscs = partials.map(([ratio, g]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq * ratio;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(out); o.start();
    return { o, ratio };
  });

  // ---- vibrato ---- (cents on every partial, so the whole tone bends together rather than detuning apart)
  const lfo = ctx.createOscillator(); lfo.frequency.value = vibrato;
  const lg = ctx.createGain(); lg.gain.value = vibratoCents;
  lfo.connect(lg); lfo.start();
  for (const { o } of oscs) lg.connect(o.detune);

  // ---- breath ---- bandpassed noise tracking the note; this is what stops it sounding like an organ
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * 2; bp.Q.value = 1.4;
  const bg = ctx.createGain(); bg.gain.value = breath;
  const ns = ctx.createBufferSource(); ns.buffer = noiseFor(ctx); ns.loop = true;
  ns.connect(bp); bp.connect(bg); bg.connect(out); ns.start();

  // ---- chiff ---- the attack transient, gone in ~50ms
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
    // Pitch moves under a continuous breath — the flute's whole gesture. A short ramp rather than a jump:
    // a real bore cannot change length instantly, and stepping the frequency clicks.
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
      setTimeout(() => { try { out.disconnect(); } catch { /* torn down */ } }, (release + 0.1) * 1000);
    },
  };
}
