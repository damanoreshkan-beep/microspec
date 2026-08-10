// swarm — the host: load the wasm, keep the clock honest, make the noises.
//
// Structurally hunt's host (the wasm is a zero-import reactor either way, the clock clamp is the
// same lesson) minus the painter: swarm draws vectors straight to a resized canvas, so there is
// nothing to bake. What differs is the palette of noises — a ring of wings, not a forest.

import { S, SFX } from "/_rt/swarm.js";
import { createEngine } from "/_rt/audio.js";

export const WASM_URL = new URL("./assets/swarm.wasm", import.meta.url).href;
export const GATE_SEED = 0xB0DA;

export async function loadEngine(url = WASM_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`swarm.wasm ${res.status}`);
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
  const E = instance.exports;
  return {
    init: (seed) => E.game_init(seed >>> 0),
    step: (input) => E.game_step(input >>> 0),
    state: () => new Int32Array(E.memory.buffer, E.game_state(), S.COUNT),
    list: () => ({ dl: new Int16Array(E.memory.buffer, E.game_dl(), E.game_dl_count() * 4), n: E.game_dl_count() }),
  };
}

/* One step is 1/60 s and nothing else; the clamp matters more than the loop — returning from a
   backgrounded tab with a minute of unspent time must not fast-forward the ring onto the player. */
export const STEP_MS = 1000 / 60;
export const MAX_CATCHUP = 5;

export function makeClock(step) {
  let acc = 0, last = 0;
  return {
    reset() { acc = 0; last = 0; },
    tick(now) {
      if (!last) { last = now; return 0; }
      acc += Math.min(now - last, 250);
      last = now;
      let n = 0;
      while (acc >= STEP_MS && n < MAX_CATCHUP) { step(); acc -= STEP_MS; n++; }
      if (n === MAX_CATCHUP) acc = 0;
      return n;
    },
  };
}

/* The engine reports what happened; the noises are made here on /_rt/audio.js. The context is
   created inside a real press and NOTHING is sequenced behind resume() — a suspended context
   with no user activation leaves that promise pending rather than rejecting. */
export function makeSound() {
  let eng = null, on = true;
  const ensure = () => {
    if (!eng) { try { eng = createEngine({ master: 0.5 }); } catch { eng = null; } }
    if (eng) eng.resume?.();
    return eng;
  };
  const tone = (freq, dur, type = "triangle", gain = 0.15, slide = 0) => {
    if (!eng || !on) return;
    const { ctx, master } = eng, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, gain, freq) => {
    if (!eng || !on) return;
    const { ctx, master, buffers } = eng, t = ctx.currentTime;
    if (!buffers?.white) return;
    const s = ctx.createBufferSource(); s.buffer = buffers.white;
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  };
  return {
    arm: ensure,
    get enabled() { return on; },
    set enabled(v) { on = v; },
    play(bits) {
      if (!on || !eng) return;
      if (bits & SFX.SHOOT) noise(0.07, 0.15, 3200);                              // the snap of the shot
      if (bits & SFX.HIT) tone(1240, 0.05, "square", 0.08);
      if (bits & SFX.KILL) { tone(880, 0.06, "triangle", 0.12); setTimeout(() => tone(1320, 0.09, "triangle", 0.1), 45); }
      if (bits & SFX.WARN) tone(330, 0.08, "sawtooth", 0.06, 40);                 // wings, close
      if (bits & SFX.HURT) { tone(200, 0.2, "sawtooth", 0.16, -120); noise(0.12, 0.12, 420); }
      if (bits & SFX.WAVE) { tone(523, 0.09, "triangle", 0.12); setTimeout(() => tone(784, 0.12, "triangle", 0.11), 90); }
      if (bits & SFX.DEATH) { tone(392, 0.15, "triangle", 0.15); setTimeout(() => tone(165, 0.55, "triangle", 0.15, -70), 160); }
    },
  };
}
