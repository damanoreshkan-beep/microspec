// microspec runtime — Radiance (.hdr) decoding. Pure bytes, no GPU.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals, assertThrows, assertAlmostEquals } from "jsr:@std/assert@1";
import { decodeHDR, rgbeToLinear, downsampleRGBE } from "../hdr.js";

const enc = new TextEncoder();
const bytes = (...parts) => {
  const out = [];
  for (const p of parts) out.push(...(typeof p === "string" ? enc.encode(p) : p));
  return new Uint8Array(out);
};
const header = (w, h) => `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`;

Deno.test("decodes a FLAT (uncompressed) file", () => {
  // width < 8 forces the flat path — the RLE marker is only valid for 8..32767
  const px = new Uint8Array([255, 128, 64, 128, 10, 20, 30, 140]);
  const img = decodeHDR(bytes(header(2, 1), px));
  assertEquals(img.width, 2);
  assertEquals(img.height, 1);
  assertEquals([...img.rgbe], [...px]);
});

Deno.test("decodes new-style RLE, components stored separately", () => {
  const W = 8;
  // each component encoded as one run of 8 identical bytes: 128+8 then the value
  const scan = new Uint8Array([2, 2, 0, W, 136, 200, 136, 100, 136, 50, 136, 130]);
  const img = decodeHDR(bytes(header(W, 1), scan));
  assertEquals(img.width, W);
  for (let x = 0; x < W; x++) {
    assertEquals([...img.rgbe.subarray(x * 4, x * 4 + 4)], [200, 100, 50, 130], `pixel ${x}`);
  }
});

Deno.test("RLE literal spans and runs mix within one component", () => {
  const W = 8;
  const comp = (vals) => vals;                       // helper for readability
  const scan = new Uint8Array([
    2, 2, 0, W,
    ...comp([4, 1, 2, 3, 4, 132, 9]),                // 4 literals then a run of 4 nines
    ...comp([136, 7]),
    ...comp([136, 7]),
    ...comp([136, 128]),
  ]);
  const img = decodeHDR(bytes(header(W, 1), scan));
  const reds = [...Array(W)].map((_, x) => img.rgbe[x * 4]);
  assertEquals(reds, [1, 2, 3, 4, 9, 9, 9, 9]);
});

Deno.test("malformed input fails loudly rather than returning noise", () => {
  assertThrows(() => decodeHDR(bytes("not a radiance file\n")), Error, "not a Radiance");
  assertThrows(() => decodeHDR(bytes("#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 2\n")), Error, "FORMAT");
  assertThrows(() => decodeHDR(bytes("#?RADIANCE\n\n+X 2 -Y 1\n")), Error, "resolution");
  // a truncated scanline must not silently yield a half-black image
  assertThrows(() => decodeHDR(bytes(header(2, 2), new Uint8Array([1, 2, 3, 128]))), Error);
});

Deno.test("rgbe → linear: the exponent is a power of two, and 0 means black", () => {
  assertEquals(rgbeToLinear(0, 0, 0, 0), [0, 0, 0]);
  // e = 129 → 2^(129-136) = 1/128; 128 * 1/128 = 1.0
  const [r] = rgbeToLinear(128, 0, 0, 129);
  assertAlmostEquals(r, 1.0, 1e-6);
  // one stop up must double
  const [r2] = rgbeToLinear(128, 0, 0, 130);
  assertAlmostEquals(r2, 2.0, 1e-6);
});

Deno.test("HDR really is high dynamic range — values far above 1.0 survive", () => {
  // This is the whole reason for the format: a light source hundreds of times brighter than a wall.
  const [bright] = rgbeToLinear(255, 255, 255, 145);
  assert(bright > 200, `expected a value far above 1.0, got ${bright}`);
});

Deno.test("downsample averages in LINEAR space, not on the packed bytes", () => {
  // Two pixels: one dim, one 256× brighter. A byte-wise average would land near the dim one because the
  // exponents differ; a linear average must land near half the bright one.
  const src = {
    width: 2, height: 1,
    rgbe: new Uint8Array([128, 128, 128, 129, /* 1.0 */ 128, 128, 128, 137 /* 256.0 */]),
  };
  const out = downsampleRGBE(src, 1);
  assertEquals(out.width, 1);
  const [r] = rgbeToLinear(out.rgbe[0], out.rgbe[1], out.rgbe[2], out.rgbe[3]);
  assertAlmostEquals(r, (1.0 + 256.0) / 2, 1.0, "the bright sample must dominate the average");
});

Deno.test("downsample keeps the aspect ratio and stays in range", () => {
  const W = 16, H = 8;
  const rgbe = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgbe[i * 4] = 100; rgbe[i * 4 + 1] = 100; rgbe[i * 4 + 2] = 100; rgbe[i * 4 + 3] = 130; }
  const out = downsampleRGBE({ width: W, height: H, rgbe }, 4);
  assertEquals(out.width, 4);
  assertEquals(out.height, 2);
  assertEquals(out.rgbe.length, 4 * 2 * 4);
  const [r] = rgbeToLinear(out.rgbe[0], out.rgbe[1], out.rgbe[2], out.rgbe[3]);
  const [want] = rgbeToLinear(100, 100, 100, 130);
  assertAlmostEquals(r, want, want * 0.02, "a uniform image must survive downsampling unchanged");
});
