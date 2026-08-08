// microspec runtime — air unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { eaqiBand, pollutantBand, pollenBand, AQI_BANDS, POLLEN_BANDS } from "../air.js";

Deno.test("eaqiBand maps the EEA 6-band scale on its 20-point boundaries", () => {
  assertEquals(eaqiBand(0), 0);
  assertEquals(eaqiBand(20), 0, "20 is the top of Good (inclusive)");
  assertEquals(eaqiBand(20.1), 1, "just over 20 tips into Fair");
  assertEquals(eaqiBand(40), 1);
  assertEquals(eaqiBand(60), 2);
  assertEquals(eaqiBand(80), 3);
  assertEquals(eaqiBand(100), 4);
  assertEquals(eaqiBand(101), 5, "over 100 is Extremely poor");
  assertEquals(eaqiBand(null), -1, "no reading → no band");
  assertEquals(eaqiBand(NaN), -1);
  assert(AQI_BANDS.length === 6, "six band keys for six bands");
});

Deno.test("pollutantBand uses each pollutant's own EEA breakpoints", () => {
  // PM2.5 breakpoints 10/20/25/50/75
  assertEquals(pollutantBand("pm2_5", 10), 0, "10 tops Good");
  assertEquals(pollutantBand("pm2_5", 10.5), 1);
  assertEquals(pollutantBand("pm2_5", 75), 4);
  assertEquals(pollutantBand("pm2_5", 80), 5, "beyond the last breakpoint → extreme");
  // Same concentration, different pollutant → different band (the whole point of per-pollutant bands).
  assertEquals(pollutantBand("no2", 45), 1, "45 µg/m³ NO₂ is only Fair");
  assertEquals(pollutantBand("o3", 45), 0, "45 µg/m³ O₃ is still Good");
  assertEquals(pollutantBand("so2", 300), 2);
  assertEquals(pollutantBand("nonsense", 5), -1, "unknown pollutant → no band");
  assertEquals(pollutantBand("pm10", null), -1);
});

Deno.test("pollenBand is category-aware: zero is 'none', a weed grain bands higher than a grass grain", () => {
  assertEquals(pollenBand("grass", 0), 0, "zero grains → none, not low");
  assertEquals(pollenBand("grass", 30), 1, "30 tops grass Low");
  assertEquals(pollenBand("grass", 31), 2);
  assertEquals(pollenBand("grass", 150), 3);
  assertEquals(pollenBand("grass", 200), 4, "grass very high");
  // 20 grains: moderate for grass, but already High-band material for a potent weed.
  assertEquals(pollenBand("grass", 20), 1, "20 grass grains = Low");
  assertEquals(pollenBand("ragweed", 20), 2, "20 ragweed grains = Moderate (lower threshold)");
  assertEquals(pollenBand("birch", 60), 3, "trees peak fast: 60 birch = High");
  assertEquals(pollenBand("mugwort", null), -1);
  assert(POLLEN_BANDS.length === 5);
});
