// microspec runtime — pendulum unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { phase as penPhase, swing as penSwing, state as penState } from "../pendulum.js";

Deno.test("pendulum phase: wraps into [0,1) and guards a zero period", () => {
  assertEquals(penPhase(0, 1000), 0);
  assertEquals(penPhase(500, 1000), 0.5);
  assertEquals(penPhase(1000, 1000), 0, "a full period is back to 0");
  assertEquals(penPhase(1500, 1000), 0.5);
  assertEquals(penPhase(123, 0), 0, "zero period → 0, no divide-by-zero");
});

Deno.test("pendulum swing: cosine, +1 at the poles' turn, 0 at centre", () => {
  assert(Math.abs(penSwing(0) - 1) < 1e-9, "phase 0 → +1 (pole A)");
  assert(Math.abs(penSwing(0.5) + 1) < 1e-9, "phase .5 → -1 (pole B)");
  assert(Math.abs(penSwing(0.25)) < 1e-9, "phase .25 → 0 (crossing centre)");
  assert(Math.abs(penSwing(1) - 1) < 1e-9, "phase 1 → +1 again");
});

Deno.test("pendulum state: angle, crossfade weights and breath count", () => {
  const P = 8000, AMP = 30;
  const a = penState(0, P, AMP);
  assert(Math.abs(a.angle - AMP) < 1e-6, "at rest-top the arm is at +amp");
  assert(Math.abs(a.weightA - 1) < 1e-6 && Math.abs(a.weightB) < 1e-6, "pole A fully lit at phase 0");
  assertEquals(a.active, 0);
  const b = penState(P / 2, P, AMP);
  assert(Math.abs(b.angle + AMP) < 1e-6, "half a breath later the arm is at -amp");
  assert(Math.abs(b.weightA) < 1e-6 && Math.abs(b.weightB - 1) < 1e-6, "pole B fully lit at phase .5");
  assertEquals(b.active, 1);
  for (const el of [0, 700, 1900, 4321, 7999, 15000]) {
    const s = penState(el, P, AMP);
    assert(s.weightA >= 0 && s.weightA <= 1 && s.weightB >= 0 && s.weightB <= 1, "weights in range");
    assert(Math.abs(s.weightA + s.weightB - 1) < 1e-9, "weights sum to 1");
  }
  assertEquals(penState(2.5 * P, P, AMP).breath, 2, "2.5 breaths elapsed → 2 completed");
});
