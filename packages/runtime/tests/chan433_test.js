// microspec runtime — chan433 unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { LPD433, PMR446, ISM433, TUNE_HZ, planSpanHz, channelCentre, channelAt, binOf, channelBins, integrateChannels } from "../chan433.js";

// ================= 433 MHz channel grids (chan433.js) =================

Deno.test("channel plans: 1-based centres round-trip, and reject anything off-plan", () => {
  assertEquals(channelCentre(LPD433, 1), 433_075_000);
  assertEquals(channelCentre(LPD433, 69), 434_775_000);
  assertEquals(channelCentre(PMR446, 1), 446_006_250);
  assertEquals(channelCentre(PMR446, 16), 446_193_750);
  assertEquals(channelCentre(LPD433, 0), null);
  assertEquals(channelCentre(LPD433, 70), null);
  for (const plan of [LPD433, PMR446]) {
    for (let n = 1; n <= plan.count; n++) assertEquals(channelAt(plan, channelCentre(plan, n)), n);
  }
  assertEquals(channelAt(LPD433, 400_000_000), null);
  // The tune centre IS a live channel — the reason DC must be offset away from it (rtlsdr.js dcBin).
  assertEquals(channelCentre(LPD433, 35), TUNE_HZ);
});

Deno.test("the whole LPD433 plan fits inside one 2.4 MS/s window, and PMR446 does not", () => {
  assertEquals(planSpanHz(LPD433), 1_700_000);
  assert(planSpanHz(LPD433) < 2_400_000, "the single-tune claim: the plan must fit the window");
  assert(ISM433.hiHz - ISM433.loHz < 2_400_000, "…and so must the ISM device band around it");
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  assert(channelBins(LPD433, geom).every((c) => c.inWindow), "every LPD channel must be in view at once");
  // PMR446 is 11 MHz away: it is a RETUNE, and the mapping must say so rather than silently report noise.
  assert(channelBins(PMR446, geom).every((c) => !c.inWindow), "PMR446 cannot be in the LPD window");
});

Deno.test("binOf: the tune centre lands on the middle bin, and the grid is symmetric", () => {
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  assertEquals(binOf(TUNE_HZ, geom), 1024);
  assertEquals(binOf(TUNE_HZ - 1_200_000, geom), 0);          // lower window edge
  assertEquals(binOf(TUNE_HZ + 1_200_000, geom), 2048);       // upper window edge
  const c35 = channelBins(LPD433, geom)[34];
  assert(c35.lo < 1024 && c35.hi > 1024, "channel 35 straddles the DC bin — the defect dcBin() pins");
});

Deno.test("integrateChannels: energy lands in its own channel and nowhere else", () => {
  const geom = { fftSize: 2048, sampleRate: 2_400_000, centreHz: TUNE_HZ };
  const bins = channelBins(LPD433, geom);
  const power = new Float32Array(geom.fftSize);
  const target = bins[19];                                     // channel 20
  for (let b = Math.ceil(target.lo); b <= Math.floor(target.hi) - 1; b++) power[b] = 1;
  const out = integrateChannels(power, bins);
  assert(out[19] > 0.9, `channel 20 must hold the energy, got ${out[19]}`);
  assertEquals(out[18], 0);
  assertEquals(out[20], 0);
  // A flat spectrum must integrate to exactly the flat level in every channel — this is what makes the
  // fractional edge weights honest, and what lets channels be compared to one noise floor.
  const flat = new Float32Array(geom.fftSize).fill(2);
  for (const v of integrateChannels(flat, bins)) assert(Math.abs(v - 2) < 1e-5, `flat spectrum drifted: ${v}`);
});
