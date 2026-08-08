// microspec runtime — hackrf unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { sampleRatePayload, setFreqPayload, clampLnaGain, clampVgaGain, roundBasebandFilter, basebandFilterParams, REQUEST, MODE, VENDOR_ID, PRODUCT_ID, TRANSFER_SIZE } from "../hackrf.js";
import { clampTxVgaGain, TX_ENDPOINT } from "../hackrf.js";

// ================= HackRF protocol (hackrf.js) =================

Deno.test("hackrf request codes + ids match libhackrf", () => {
  assertEquals([REQUEST.SET_TRANSCEIVER_MODE, REQUEST.SAMPLE_RATE_SET, REQUEST.BASEBAND_FILTER_BANDWIDTH_SET, REQUEST.SET_FREQ, REQUEST.AMP_ENABLE, REQUEST.SET_LNA_GAIN, REQUEST.SET_VGA_GAIN], [1, 6, 7, 16, 17, 19, 20]);
  assertEquals([MODE.OFF, MODE.RECEIVE, MODE.TRANSMIT, MODE.RX_SWEEP], [0, 1, 2, 5]);
  assertEquals(REQUEST.INIT_SWEEP, 26);   // hackrf_init_sweep, used by the wideband sweep
  assertEquals([VENDOR_ID, PRODUCT_ID], [0x1d50, 0x6089]);
  assertEquals(TRANSFER_SIZE, 262144);
});

Deno.test("sampleRatePayload: LE { freq_hz, divider }", () => {
  const v = new DataView(sampleRatePayload(2_000_000));
  assertEquals(v.getUint32(0, true), 2_000_000);
  assertEquals(v.getUint32(4, true), 1);
});

Deno.test("setFreqPayload: LE { freq_mhz, freq_hz } split", () => {
  const v = new DataView(setFreqPayload(99_750_000));
  assertEquals(v.getUint32(0, true), 99);           // MHz part
  assertEquals(v.getUint32(4, true), 750_000);      // Hz remainder
  const dc = new DataView(setFreqPayload(100_000_000));
  assertEquals(dc.getUint32(0, true), 100); assertEquals(dc.getUint32(4, true), 0);
});

Deno.test("gain clamps snap to hardware steps and range", () => {
  assertEquals(clampLnaGain(15), 16);   // 8-dB steps
  assertEquals(clampLnaGain(99), 40);   // max
  assertEquals(clampLnaGain(-5), 0);
  assertEquals(clampVgaGain(21), 22);   // 2-dB steps
  assertEquals(clampVgaGain(99), 62);   // max
});

Deno.test("baseband filter rounds down to a valid MAX2837 bandwidth, packed low16/high16", () => {
  assertEquals(roundBasebandFilter(2_000_000), 1_750_000);   // largest valid ≤ request
  assertEquals(roundBasebandFilter(1_000_000), 1_750_000);   // below range → minimum
  assertEquals(roundBasebandFilter(28_000_000), 28_000_000);
  const p = basebandFilterParams(1_750_000);
  assertEquals((p.index << 16) | p.value, 1_750_000);
});

Deno.test("hackrf TX: TX VGA gain clamps 0–47 (1 dB); TX endpoint = 2", () => {
  assertEquals(clampTxVgaGain(30), 30);
  assertEquals(clampTxVgaGain(99), 47);
  assertEquals(clampTxVgaGain(-5), 0);
  assertEquals(TX_ENDPOINT, 2);
});
