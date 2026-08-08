// microspec runtime — player unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { cycleRepeat as tpCycleRepeat, advance as tpAdvance, clock as tpClock } from "../player.js";

Deno.test("player cycleRepeat — off → all → one → off", () => {
  assertEquals(tpCycleRepeat("off"), "all");
  assertEquals(tpCycleRepeat("all"), "one");
  assertEquals(tpCycleRepeat("one"), "off");
  assertEquals(tpCycleRepeat(undefined), "all", "an unset mode starts the cycle, never crashes");
});

Deno.test("player advance — repeat off stops at the end when a track ENDS, wraps when you press next", () => {
  assertEquals(tpAdvance(0, 5, { repeat: "off" }), 1);
  assertEquals(tpAdvance(4, 5, { repeat: "off" }), -1, "auto-advance past the last track stops");
  assertEquals(tpAdvance(4, 5, { repeat: "off", manual: true }), 0, "pressing next at the end wraps");
});

Deno.test("player advance — repeat one holds on END but never traps a manual press", () => {
  assertEquals(tpAdvance(2, 5, { repeat: "one" }), 2, "a finished track plays again");
  assertEquals(tpAdvance(2, 5, { repeat: "one", manual: true }), 3,
    "pressing next under repeat-one must move on — the bug hand-written players ship");
  assertEquals(tpAdvance(4, 5, { repeat: "all" }), 0, "repeat all wraps on its own");
});

Deno.test("player advance — previous, single track, empty queue", () => {
  assertEquals(tpAdvance(3, 5, { step: -1 }), 2);
  assertEquals(tpAdvance(0, 5, { step: -1 }), 4, "previous from the first track wraps to the end");
  assertEquals(tpAdvance(0, 1, { repeat: "off" }), -1, "one track, played out → stop");
  assertEquals(tpAdvance(0, 1, { repeat: "all" }), 0);
  assertEquals(tpAdvance(0, 0), -1, "nothing queued → nothing to play");
  assertEquals(tpAdvance(0, 0, { manual: true }), -1);
});

Deno.test("player advance — shuffle never repeats the current track and stays in range", () => {
  for (const r of [0, 0.001, 0.4, 0.5, 0.999]) {
    for (const i of [0, 3, 7]) {
      const n = tpAdvance(i, 8, { shuffle: true, rng: () => r });
      assert(n >= 0 && n < 8, `out of range: ${n}`);
      assert(n !== i, `shuffle returned the track already playing (i=${i}, rng=${r})`);
    }
  }
});

Deno.test("player clock — mm:ss, and never NaN", () => {
  assertEquals(tpClock(0), "0:00");
  assertEquals(tpClock(61000), "1:01");
  assertEquals(tpClock(3599000), "59:59");
  assertEquals(tpClock(-5), "0:00");
  assertEquals(tpClock(undefined), "0:00");
});

Deno.test("player transport strings are SYSTEMIC — an app must not have to restate them", async () => {
  const i18n = await import("../i18n.js");
  for (const k of ["aPlay", "aPause", "aStop", "aPrev", "aNext", "aSeek", "aRepeat"]) {
    assert(i18n.SYS[k]?.en && i18n.SYS[k]?.uk, `SYS.${k} missing a locale — the widget would ship a raw key`);
  }
});
