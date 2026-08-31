// microspec runtime — the tilt engine's math (tilt.js): the 1€ filter and the tracker. Pure logic, no DOM.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { OneEuro, TiltTracker } from "../tilt.js";

Deno.test("1€ filter: constant input passes through, jitter is crushed, a step is followed", () => {
  const f = new OneEuro({ minCutoff: 1, beta: 0.02, dCutoff: 1 });
  // constant input → identity
  for (let i = 0; i < 50; i++) assertEquals(typeof f.filter(0.5, 1 / 60), "number");
  assert(Math.abs(f.filter(0.5, 1 / 60) - 0.5) < 1e-6, "constant input must settle to itself");
  // jitter around 0.5 at ±0.02 → output stays within a fraction of the jitter amplitude
  let maxDev = 0;
  for (let i = 0; i < 240; i++) { const y = f.filter(0.5 + (i % 2 ? 0.02 : -0.02), 1 / 60); maxDev = Math.max(maxDev, Math.abs(y - 0.5)); }
  assert(maxDev < 0.012, `jitter passed through: dev ${maxDev.toFixed(4)} (the filter's whole point is killing this)`);
  // a step from 0.5 to 1 is followed quickly (the adaptive cutoff opens on speed)
  let y = 0.5;
  for (let i = 0; i < 30; i++) y = f.filter(1, 1 / 60);
  assert(y > 0.9, `a step is lagged to ${y.toFixed(3)} after 0.5s — beta/minCutoff are strangling motion`);
});

Deno.test("tracker: the rest pose adapts, so a settled hand re-centres to zero", () => {
  const tr = new TiltTracker({ range: 30, tau: 2, dead: 0.004 });
  // hold the phone at β=40°, γ=10° — after a few τ the output must be ~0 (that IS the rest pose)
  let out = { tx: 0, ty: 0 };
  for (let i = 0; i < 600; i++) out = tr.sample(40, 10, 1 / 60);
  assert(Math.abs(out.tx) < 0.05 && Math.abs(out.ty) < 0.05, `rest pose did not adapt: tx=${out.tx.toFixed(3)} ty=${out.ty.toFixed(3)}`);
  // a deliberate tilt reads at the ENGINE's tau (8 s): 15° right of a settled rest ≈ 0.4 travel after 2 s
  // (the rest pose has only drifted ~3° in that time). A fresh tracker per phase — the τ=2 one above exists
  // to prove adaptation quickly, and adaptation is exactly what would eat this phase's amplitude.
  const tr8 = new TiltTracker({ range: 30, tau: 8, dead: 0.004 });
  tr8.sample(40, 10, 1 / 60);                                    // rest = the first sample
  for (let i = 0; i < 120; i++) out = tr8.sample(40, 25, 1 / 60);
  assert(out.tx > 0.25 && out.tx <= 1, `15° right should be ~0.4 travel, got ${out.tx.toFixed(3)}`);
});

Deno.test("tracker: clamped to ±1, dead-band suppresses micro-motion, bad samples are inert", () => {
  const tr = new TiltTracker({ range: 30, tau: 8, dead: 0.004 });
  tr.sample(0, 0, 1 / 60);
  let out;
  for (let i = 0; i < 240; i++) out = tr.sample(0, 90, 1 / 60);   // far past the range
  assert(out.tx <= 1 && out.tx > 0.95, `not clamped to +1: ${out.tx.toFixed(3)}`);
  // micro-jitter below the dead-band moves nothing
  const tr2 = new TiltTracker({ range: 30, tau: 8, dead: 0.004 });
  for (let i = 0; i < 60; i++) tr2.sample(0, 0, 1 / 60);
  const before = tr2.tx;
  const r = tr2.sample(0, 0.02, 1 / 60);                          // 0.02° — sensor noise
  assertEquals(r.moved, false, "sensor noise scheduled a frame");
  assertEquals(tr2.tx, before);
  // NaN / zero-dt samples change nothing and return the last value
  const r2 = tr2.sample(NaN, 5, 1 / 60);
  assertEquals(r2.moved, false);
  const r3 = tr2.sample(5, 5, 0);
  assertEquals(r3.moved, false);
});
