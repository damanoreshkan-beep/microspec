// microspec runtime — horoscope unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { sunSign } from "../horoscope.js";

Deno.test("horoscope sunSign: cutoffs map month/day to the right sign, wrapping at year end", () => {
  assertEquals(sunSign(1, 1), 9);    // Jan 1 → Capricorn
  assertEquals(sunSign(1, 19), 9);   // last Capricorn day
  assertEquals(sunSign(1, 20), 10);  // Aquarius starts
  assertEquals(sunSign(3, 20), 11);  // last Pisces day
  assertEquals(sunSign(3, 21), 0);   // Aries starts
  assertEquals(sunSign(7, 23), 4);   // Leo
  assertEquals(sunSign(12, 21), 8);  // last Sagittarius day
  assertEquals(sunSign(12, 22), 9);  // Capricorn again
});
