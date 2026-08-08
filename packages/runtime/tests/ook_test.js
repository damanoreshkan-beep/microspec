// microspec runtime — ook unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { capture, isolateFrame, framesEqual, renderOOK, OOK_FREQS } from "../ook.js";

// ================= Sub-GHz OOK clone (ook.js) + HackRF TX =================

Deno.test("renderOOK: correct length; ON regions carry a carrier, OFF is silence", () => {
  const iq = renderOOK([+1000, -1000], { fs: 2e6, repeats: 1, gapUs: 0, tailUs: 0, amp: 110 });
  assertEquals(iq.length, 2 * (2000 + 2000));            // 1000µs ON + 1000µs OFF @ 2 MSps = 2000+2000 samples
  let onMag = 0, offMag = 0;
  for (let s = 0; s < 2000; s++) onMag += iq[2 * s] ** 2 + iq[2 * s + 1] ** 2;
  for (let s = 2000; s < 4000; s++) offMag += iq[2 * s] ** 2 + iq[2 * s + 1] ** 2;
  assert(onMag > 2000 * 100 * 100 * 0.9, "ON carries a full-scale carrier");
  assertEquals(offMag, 0, "OFF is exactly zero");
});

Deno.test("OOK round-trip: renderOOK → capture recovers the timing frame (validates both sides)", () => {
  // EV1527-style; a real frame's last OFF merges into the inter-frame gap, so the recoverable frame ends on an
  // ON pulse (the lost last-OFF is just part of the gap the replay re-adds anyway).
  const frame = [+400, -1200, +1200, -400, +400, -1200, +1200];
  const iq = renderOOK(frame, { fs: 2e6, freqOffset: 250_000, amp: 110, repeats: 1, gapUs: 6000, tailUs: 6000 });
  const bytes = new Uint8Array(iq.buffer);
  const timings = capture(bytes, { fs: 2e6, decim: 8 });
  const { frame: got } = isolateFrame(timings, { gapUs: 3000 });
  assert(framesEqual(got, frame, 0.15), `recovered ${JSON.stringify(got)} ≈ ${JSON.stringify(frame)}`);
});

Deno.test("isolateFrame: splits repeated frames on long gaps, keeps the modal frame", () => {
  const f = [+400, -1200, +1200, -400];
  const stream = [...f, -5000, ...f, -5000, ...f, -5000];   // 3 repeats separated by 5 ms gaps
  const iso = isolateFrame(stream, { gapUs: 3000 });
  assertEquals(iso.frame, f);
  assertEquals(iso.repeats, 3);
});

Deno.test("framesEqual: identical→fixed(true), different→rolling(false)", () => {
  const a = [+400, -1200, +1200, -400];
  assert(framesEqual(a, [+410, -1180, +1220, -390], 0.15), "same code within tolerance");
  assert(!framesEqual(a, [+1200, -400, +400, -1200], 0.15), "different code (rolling)");
  assert(!framesEqual(a, [+400, -1200], 0.15), "different length");
  assertEquals(OOK_FREQS[0], 433_920_000);
});
