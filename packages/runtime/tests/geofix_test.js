import { assert, assertEquals } from "jsr:@std/assert@1";
import { mulberry32 } from "../groove.js";
import { meanFix, stationaryTail, segErr, totalErr, usableFix, BIAS_FRAC } from "../geofix.js";

Deno.test("meanFix — averaging shrinks the random error toward the truth", () => {
  const rnd = mulberry32(7);
  const truth = { lat: 50.4501, lng: 30.5234 };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const ss = Array.from({ length: 60 }, () => ({
    lat: truth.lat + (gauss() * 5) / 110540,
    lng: truth.lng + (gauss() * 5) / (111320 * Math.cos(truth.lat * Math.PI / 180)),
    accuracy: 10, t: 0,
  }));
  const m = meanFix(ss);
  const off = (p) => Math.hypot((p.lat - truth.lat) * 110540, (p.lng - truth.lng) * 111320 * Math.cos(truth.lat * Math.PI / 180));
  const single = ss.reduce((s, p) => s + off(p), 0) / ss.length;
  assert(off(m) < single / 2, `the mean of 60 fixes (${off(m).toFixed(2)} m off) must beat a typical single fix (${single.toFixed(2)} m off)`);
  assertEquals(m.n, 60);
});

Deno.test("meanFix — √N is not allowed to run to zero: the bias is the floor", () => {
  const ss = Array.from({ length: 400 }, () => ({ lat: 50.45, lng: 30.52, accuracy: 12, t: 0 }));
  const m = meanFix(ss);
  assertEquals(Math.round(m.accuracy * 1000) / 1000, BIAS_FRAC * 12);
  assert(m.accuracy > 0, "400 agreeing fixes still do not make a perfect position");
  assert(meanFix(ss.slice(0, 4)).accuracy >= BIAS_FRAC * 12, "and neither do 4");
});

Deno.test("meanFix — one fix is never better than itself", () => {
  const m = meanFix([{ lat: 50.45, lng: 30.52, accuracy: 9, t: 0 }]);
  assertEquals(m.accuracy, 9);
  assertEquals(m.n, 1);
  assertEquals(meanFix([]), null);
});

Deno.test("stationaryTail — averages one spot, never a walk", () => {
  const base = { lat: 50.45, lng: 30.52, accuracy: 6 };
  const still = Array.from({ length: 5 }, (_, i) => ({ ...base, lat: base.lat + i * 1e-6, t: 1000 + i * 1000 }));
  const walked = [{ ...base, lat: base.lat - 40 / 110540, t: 500 }, ...still];
  assertEquals(stationaryTail(walked, { now: 6000 }).length, 5, "the pre-walk fix must be cut, not averaged");
  const old = [{ ...base, t: -60000 }, ...still];
  assertEquals(stationaryTail(old, { now: 6000, maxAgeMs: 25000 }).length, 5);
  assertEquals(stationaryTail([], { now: 0 }).length, 0);
});

Deno.test("stationaryTail — 'same spot' scales with the fix quality", () => {
  const at = (dLat, accuracy) => ({ lat: 50.45 + dLat / 110540, lng: 30.52, accuracy, t: 1000 });
  const coarse = [at(-6, 10), { ...at(0, 10), t: 2000 }];
  const fine = [at(-6, 1), { ...at(0, 1), t: 2000 }];
  assertEquals(stationaryTail(coarse, { now: 2000 }).length, 2);
  assertEquals(stationaryTail(fine, { now: 2000 }).length, 1);
});

Deno.test("segErr / totalErr — a measurement carries its endpoints' doubt", () => {
  assertEquals(segErr({ accuracy: 3 }, { accuracy: 4 }), 5);
  assert(segErr({ accuracy: 3 }, { accuracy: 4 }) < 3 + 4, "independent errors must not simply add");
  assertEquals(totalErr([3, 4]), 5);
  assertEquals(totalErr([]), 0);
});

Deno.test("usableFix — a vague fix is a wrong vertex, not a coarse one", () => {
  assert(usableFix({ accuracy: 8 }));
  assert(!usableFix({ accuracy: 60 }), "±60 m must not be droppable into a polyline");
  assert(!usableFix({ accuracy: 0 }) && !usableFix(null) && !usableFix({}));
  assert(usableFix({ accuracy: 60 }, 80), "the limit is the caller's to set");
});
