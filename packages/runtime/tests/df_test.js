// microspec runtime — df unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { newRose, addSample, roseStats, hasBearing } from "../df.js";

// ================= hunt-mode direction finding (df.js) =================

Deno.test("df: an omnidirectional antenna produces a CIRCLE and no bearing is offered", () => {
  const rose = newRose(72);
  for (let h = 0; h < 360; h += 5) addSample(rose, h, 0.7);              // same strength whichever way you point
  const s = roseStats(rose);
  assert(s.r < 0.01, `a uniform sweep must have near-zero concentration, got ${s.r}`);
  assertEquals(hasBearing(s), false, "the stock whip must never produce an arrow");
  assertEquals(s.coverage, 1);
});

Deno.test("df: a directional lobe earns a bearing, and points where the signal actually peaked", () => {
  const rose = newRose(72);
  for (let h = 0; h < 360; h += 5) {
    const lobe = Math.max(0, Math.cos((h - 90) * Math.PI / 180)) ** 2;   // a Yagi-ish pattern facing east
    addSample(rose, h, lobe);
  }
  const s = roseStats(rose);
  assert(s.r > 0.3, `a lobe must concentrate, got ${s.r}`);
  assert(Math.abs(s.bearingDeg - 90) < 5, `bearing should be ~90 deg, got ${s.bearingDeg}`);
  assertEquals(hasBearing(s), true);
});

Deno.test("df: headings wrap — 350 and 10 average to 0, not 180", () => {
  const rose = newRose(72);
  addSample(rose, 350, 1); addSample(rose, 10, 1);
  const s = roseStats(rose);
  assert(s.bearingDeg < 5 || s.bearingDeg > 355, `circular mean broken: got ${s.bearingDeg}`);
  // …but two samples is not a sweep, so no arrow is offered yet.
  assertEquals(hasBearing(s), false, "coverage gate must reject an unfinished sweep even when r is high");
});

Deno.test("df: a decaying rose follows the walk — stale strength expires and the arrow goes recent", () => {
  const rose = newRose(72, 30_000);
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) addSample(rose, i, 1.0, t0 + i * 100);           // strong at ~north
  let s = roseStats(rose);
  assert(s.bearingDeg < 6 || s.bearingDeg > 354, `fresh rose should point ~0, got ${s.bearingDeg}`);
  // 90 s later (3 tau) the user has walked; east is where the strength is NOW. A weaker fresh reading
  // must out-vote a stronger stale one, or the arrow leads to where the user used to stand.
  for (let i = 0; i < 5; i++) addSample(rose, 90 + i, 0.6, t0 + 90_000 + i * 100);
  s = roseStats(rose);
  assert(Math.abs(s.bearingDeg - 90) < 10, `the arrow stayed anchored to the past: ${s.bearingDeg}`);
});

Deno.test("df: a tau-less rose keeps the old accumulate-forever behaviour bit for bit", () => {
  const rose = newRose(72);
  addSample(rose, 0, 1, 1_000_000);
  addSample(rose, 0, 1, 99_000_000);                                            // an hour later
  assertEquals(rose.count[0], 2);                                               // integers, nothing faded
  assertEquals(rose.sum[0], 2);
});

Deno.test("df: an unswept arc is not a null — unvisited bins stay distinguishable from measured silence", () => {
  const rose = newRose(72);
  for (let h = 0; h < 90; h += 5) addSample(rose, h, 1);                 // swept only a quarter of the circle
  const s = roseStats(rose);
  assert(s.coverage < 0.3, `coverage must report the truth, got ${s.coverage}`);
  assertEquals(hasBearing(s), false);
  assertEquals(rose.count[40], 0);                                       // never visited
});
