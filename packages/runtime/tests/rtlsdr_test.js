// microspec runtime — rtlsdr unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { ifFreqWord, sampleRateRatio, muxConfigFor, pllDivider, pllWords, gainSplit, dcBin, offsetBinaryToSigned, supportsSweep as RTL_SWEEP, VENDOR_ID as RTL_VID, TRANSFER_SIZE as RTL_XFER } from "../rtlsdr.js";

// ================= RTL-SDR protocol (rtlsdr.js) =================
// The pure arithmetic the R820T2 / RTL2832U enforce. Assertions are on PROPERTIES and on the two facts that
// bit us (gain saturation, DC landing on a live channel) — not on constants copied back out of the code.

Deno.test("rtlsdr: device ids, transfer size, and no hardware sweep", () => {
  assertEquals(RTL_VID, 0x0bda);
  assertEquals(RTL_XFER, 262144);           // matches hackrf.js so one worker can hold either radio
  assertEquals(RTL_SWEEP, false);           // no RX_SWEEP — callers must step-retune
});

Deno.test("ifFreqWord: the DDC word is the negated 22-bit fraction of the crystal", () => {
  const w = ifFreqWord(3_570_000);                       // the tuner IF programmed at open()
  const word = (w.hi << 16) | (w.mid << 8) | w.lo;
  // Reassembled, it must be the two's-complement 22-bit form of -(hz/xtal * 2^22).
  const expect = (-Math.floor(3_570_000 * (1 << 22) / 28_800_000)) & 0x3fffff;
  assertEquals(word, expect);
  assert(w.hi <= 0x3f, "the high register is 6 bits wide");
  assert(w.mid <= 0xff && w.lo <= 0xff);
  // Direction matters: a positive IF must produce a NEGATIVE shift, i.e. the top of the 22-bit field set.
  assert(word > 0x200000, "a positive IF must shift DOWN — the sign bit of the 22-bit field must be set");
});

Deno.test("sampleRateRatio: low two bits are dropped, so the ACHIEVED rate is what axes must use", () => {
  const exact = sampleRateRatio(2_400_000);              // 28.8 MHz / 2.4 MS/s = 12 exactly
  assertEquals(exact.ratio & 3, 0);
  assertEquals(exact.achieved, 2_400_000);               // our design rate is exactly representable
  const odd = sampleRateRatio(1_000_000);
  assertEquals(odd.ratio & 3, 0);
  assert(odd.achieved !== 1_000_000, "1 MS/s is NOT exactly representable — the app must label the achieved rate");
  assert(Math.abs(odd.achieved - 1_000_000) / 1e6 < 1e-3, "…but it is within 0.1%");
});

Deno.test("muxConfigFor: picks the last tracking-filter band at or below the frequency", () => {
  assertEquals(muxConfigFor(437_495_000)[0], 310);       // 433.925 + 3.57 IF — the homin tune
  assertEquals(muxConfigFor(0)[0], 0);
  assertEquals(muxConfigFor(588_000_000)[0], 588);       // on the boundary → the higher band
  assertEquals(muxConfigFor(6_000_000_000)[0], 588);     // above the table → clamps to the top row
});

Deno.test("pll: divider selection and the integer/fractional split, with the range guard", () => {
  const { divNum, mixDiv } = pllDivider(437_495_000);
  assertEquals(mixDiv, 1 << (divNum + 1));
  assert(divNum >= 0 && divNum <= 6, "the divider is capped at 6");
  const w = pllWords(437_495_000, mixDiv);
  assert(w.valid, "the homin tune must be inside the PLL's integer range");
  assertEquals(w.vco, 437_495_000 * mixDiv);
  assertEquals(w.nint, Math.floor(w.vco / (2 * 28_800_000)));
  assertEquals(w.ni * 4 + w.si, w.nint - 13);            // the ni/si pair must reconstruct nint
  assert(w.sdm >= 0 && w.sdm <= 65535);
  assert(!pllWords(500_000_000, 16).valid, "nint > 63 must be reported invalid, not written to the tuner");
});

Deno.test("gainSplit: one control, monotonic, clamped — a mid gain must NOT be maximum gain", () => {
  // The regression this pins: _applyGain used to add lna+vga and clamp to 49, so HackRF-shaped calls
  // (setLnaGain(32) + setVgaGain(30) = 62) always saturated. A 433 window holds a handheld metres away and
  // a sensor hundreds of metres away — permanent max gain overloads the front end.
  assert(gainSplit(32).step < gainSplit(49).step, "32 dB must be distinguishable from maximum gain");
  let prev = -1;
  for (let db = 0; db <= 49; db++) {
    const g = gainSplit(db);
    assert(g.step >= prev, `gain must be monotonic (broke at ${db} dB)`);
    assert(g.step >= 0 && g.step <= 30, `step out of hardware range at ${db} dB: ${g.step}`);
    assertEquals(g.lnaV, Math.floor(g.step / 2));
    assertEquals(g.mixV, Math.floor((g.step - 1) / 2));
    prev = g.step;
  }
  assertEquals(gainSplit(-5).step, gainSplit(0).step);   // clamps low
  assertEquals(gainSplit(99).step, gainSplit(49).step);  // clamps high (r82xx_gains tops out at 49.6 dB)
});

Deno.test("dcBin: at zero offset the DC artifact sits ON LPD channel 35 — offset tuning moves it between channels", () => {
  // 433.925 MHz centre, 96 bins of 25 kHz. (433.925 - 433.075) / 0.025 = 34 exactly, so the centre bin IS a
  // channel. Left alone, one voice channel would silently never work.
  const onChannel = dcBin(0, 25_000, 96);
  assertEquals(onChannel, 48);
  assert(Number.isInteger(onChannel), "zero offset puts DC exactly on a channel centre — this is the defect");
  const offset = dcBin(12_500, 25_000, 96);
  assertEquals(offset, 48.5);
  assert(!Number.isInteger(offset), "a half-channel offset must put DC BETWEEN two channels");
});

Deno.test("offsetBinaryToSigned: RTL's uint8 DC maps to zero in the farm's signed-in-uint8 layout", () => {
  const out = offsetBinaryToSigned(Uint8Array.from([0, 127, 128, 255]));
  const asSigned = [...out].map((b) => (b > 127 ? b - 256 : b));
  assertEquals(asSigned, [-128, -1, 0, 127]);            // 128 (the RTL's DC) must become 0
});
