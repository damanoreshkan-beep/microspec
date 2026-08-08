// microspec runtime — ripple unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { RippleField, ring, RIPPLE_DEFAULTS } from "../ripple.js";

// ---- ripple.js — percussive wave-field ----

Deno.test("ring: crest at the front (u=0) is 1, decays away from it", () => {
  assertEquals(ring(0, 0.95, 3.7), 1, "peak at the wavefront");
  assert(Math.abs(ring(3, 0.95, 3.7)) < 0.01, "Gaussian-windowed → ~0 far from the front");
});

Deno.test("RippleField: the crest rides an outgoing front r=speed·age", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, hue: 260, t: 0 });
  const age = 1, front = RIPPLE_DEFAULTS.speed * age;   // 4.6
  const atFront = Math.abs(f.sample(front, 0, age).h);
  const atOrigin = Math.abs(f.sample(0, 0, age).h);
  assert(atFront > atOrigin, "displacement peaks at the wavefront, not the origin");
  assert(atFront > 0.05, "the crest carries real amplitude");
});

Deno.test("RippleField: energy decays monotonically after a strike", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, t: 0 });
  const e0 = f.energy(0.2), e1 = f.energy(0.8), e2 = f.energy(2.0);
  assert(e0 > e1 && e1 > e2, "ring-out: energy only falls");
  assert(e0 <= 1.0001, "starts at ≤ amp");
});

Deno.test("RippleField: amplitude-weighted hue leans to the dominant strike", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, hue: 210, t: 0 });   // near, strong
  f.strike(9, 0, { amp: 1, hue: 290, t: 0 });   // far
  const front = RIPPLE_DEFAULTS.speed * 1;       // sample on the near strike's crest at t=1
  const hue = f.sample(front, 0, 1).hue;
  assert(hue >= 200 && hue <= 300, "hue stays in the non-wrapping band");
  assert(Math.abs(hue - 210) < Math.abs(hue - 290), "biased toward the crest we sampled on");
});

Deno.test("RippleField: prune drops rung-out strikes; max caps the source list", () => {
  const f = RippleField({ life: 0.2, max: 3 });
  f.strike(0, 0, { t: 0 });
  assertEquals(f.active(), 1);
  f.prune(5);                                    // long after → below eps
  assertEquals(f.active(), 0, "pruned the dead strike");
  for (let i = 0; i < 6; i++) f.strike(i, 0, { t: 0 });
  assertEquals(f.active(), 3, "capped at max, oldest evicted");
});

Deno.test("RippleField: deterministic (no Math.random) — identical sequences match", () => {
  const build = () => { const f = RippleField(); f.strike(1, 2, { amp: 0.8, hue: 240, t: 0 }); f.strike(-3, 1, { amp: 0.5, hue: 280, t: 0.3 }); return f; };
  const a = build().sample(2, 2, 0.7), b = build().sample(2, 2, 0.7);
  assertEquals(a.h, b.h, "same height");
  assertEquals(a.hue, b.hue, "same hue");
});

Deno.test("RippleField.glow: a soft halo, bright at the strike, fading with distance + time", () => {
  const f = RippleField();
  f.strike(0, 0, { amp: 1, t: 0 });
  const c0 = f.glow(0, 0, 0.05), near = f.glow(0.5, 0, 0.05), far = f.glow(4, 0, 0.05);
  assert(c0 > near && near > far, "brightest at the strike point, falls off with distance");
  assert(f.glow(0, 0, 0.05) > f.glow(0, 0, 1.2), "fades over time");
  assert(far < 0.05, "localised — negligible far away");
});
