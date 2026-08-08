// microspec runtime — gsmband unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { BANDS, arfcnToFreq, freqToArfcn, arfcnPowers, activeArfcns, steadyScore } from "../gsmband.js";

// ================= GSM band model (gsmband.js) =================

Deno.test("arfcn↔freq per TS 45.005, round-trips", () => {
  assertEquals(arfcnToFreq("gsm900", 1), 935.2e6);
  assertEquals(arfcnToFreq("gsm900", 124), 959.8e6);
  assertEquals(Math.round(arfcnToFreq("dcs1800", 512)), 1805.2e6);
  assertEquals(Math.round(arfcnToFreq("dcs1800", 885)), 1879.8e6);
  for (const [band, n] of [["gsm900", 62], ["gsm900", 100], ["dcs1800", 512], ["dcs1800", 700]]) {
    assertEquals(freqToArfcn(band, arfcnToFreq(band, n)), n, `${band} ${n} round-trips`);
  }
});

Deno.test("arfcnPowers: a spectral peak lands on its ARFCN; activeArfcns picks it out", () => {
  const b = BANDS.gsm900, df = 25_000, n0 = Math.round((b.dlLo - 2e6) / df);
  // build a flat -100 dB band profile with a +40 dB bump exactly at ARFCN 50's centre
  const f0 = b.dlLo - 1e6, N = Math.ceil((b.dlHi + 1e6 - f0) / df), db = new Float32Array(N).fill(-100);
  const fc = arfcnToFreq("gsm900", 50), bin = Math.round((fc - f0) / df);
  db[bin] = -60;
  const powers = arfcnPowers("gsm900", { f0, df, db });
  assertEquals(powers.length, b.arfcnHi - b.arfcnLo + 1, "one entry per ARFCN in band");
  const active = activeArfcns(powers, 8);
  assertEquals(active[0].arfcn, 50, "the lit channel is ARFCN 50");
  assert(active.length <= 3, "only the bump is active over the floor");
});

Deno.test("steadyScore: a constant-power (BCCH-like) carrier scores higher than a fluctuating one", () => {
  assert(steadyScore([-60, -60, -61, -60]) > steadyScore([-60, -80, -55, -90]), "steady > bursty");
  assertEquals(steadyScore([-60]), 0, "needs history");
});
