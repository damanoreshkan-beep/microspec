// microspec runtime — v2m unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { MIRRORS as v2mMIRRORS, parseAuthors as v2mParseAuthors, parseListing as v2mParseListing, titleOf as v2mTitleOf, trackId as v2mTrackId, trackURL as v2mTrackURL, mp3Ratio as v2mMp3Ratio, normGain as v2mNormGain, byteCloud as v2mByteCloud, helixStrand as v2mHelixStrand, helixAt as v2mHelixAt, seedBytes as v2mSeedBytes } from "../v2m.js";

Deno.test("v2m parseAuthors — directories only, no sort links, no parent", () => {
  const html = `<a href="?C=N&amp;O=A">Name</a><a href="../">../</a>
    <a href="Dafunk/">Dafunk/</a><a href="Chip%20%28ES%29/">Chip (ES)/</a><a href="stars.v2m">stars.v2m</a>`;
  assertEquals(v2mParseAuthors(html), ["Dafunk", "Chip (ES)"]);
});

Deno.test("v2m parseListing — filename + byte size, .v2m and .v2mz", () => {
  const html = `<tr><td class="link"><a href="stars.v2m" title="stars.v2m">stars.v2m</a></td><td class="size">   9216</td></tr>
    <tr><td class="link"><a href="the%202nd%20movement.v2mz" title="x">the 2nd…</a></td><td class="size">  64267</td></tr>
    <tr><td class="link"><a href="readme.txt">readme.txt</a></td><td class="size">    12</td></tr>`;
  assertEquals(v2mParseListing(html), [
    { file: "stars.v2m", size: 9216 },
    { file: "the 2nd movement.v2mz", size: 64267 },
  ]);
});

Deno.test("v2m URLs are mirror-indexed and percent-encoded", () => {
  const u = v2mTrackURL("Chip (ES)", "invasors from the planet disco.v2m", 0);
  assert(u.startsWith(v2mMIRRORS[0]), "mirror 0");
  assert(u.includes("Chip%20(ES)") && u.includes("planet%20disco.v2m"), "spaces encoded: " + u);
  assert(!u.includes(" "), "no raw spaces");
  // the index wraps, so a caller fails over by incrementing
  assertEquals(v2mTrackURL("A", "b.v2m", v2mMIRRORS.length), v2mTrackURL("A", "b.v2m", 0));
  assertEquals(v2mTitleOf("the abandoned ones.v2m"), "the abandoned ones");
  assertEquals(v2mTrackId("Dafunk", "breeze.v2m"), "V2/Dafunk/breeze.v2m");
});

Deno.test("v2m mp3Ratio — the store's headline number", () => {
  // 9216 bytes of music that plays 157 s = 2 512 000 bytes as a 128 kbit/s MP3
  assertEquals(Math.round(v2mMp3Ratio(9216, 157)), 273);
  assertEquals(v2mMp3Ratio(0, 100), 0, "unknown size → no claim");
  assertEquals(v2mMp3Ratio(1000, 0), 0, "unknown duration → no claim");
});

Deno.test("v2m normGain — loudness, not peak (a 15× peak must stay audible)", () => {
  assertEquals(v2mNormGain(0.1), 1, "already at target");
  assert(v2mNormGain(0.28) < 1 && v2mNormGain(0.28) > 0.3, "loud tune is turned down, not muted");
  assert(v2mNormGain(0.02) > 1, "quiet tune is lifted");
  assert(v2mNormGain(0.0001) <= 2.5 && v2mNormGain(9) >= 0.25, "clamped both ways");
  assertEquals(v2mNormGain(0), 1, "no reading yet → leave it alone");
});

Deno.test("v2m byteCloud — the point count IS the file size", () => {
  const small = v2mByteCloud(v2mSeedBytes(300));
  const big = v2mByteCloud(v2mSeedBytes(3000));
  assertEquals(small.length, 300 * 3, "one point per byte");
  assert(big.length > small.length, "a bigger file is a denser object");
  assertEquals(v2mByteCloud(new Uint8Array(0)).length, 0, "nothing to draw");
  // sub-sampled above the cap, and every point stays inside the unit sphere
  const capped = v2mByteCloud(v2mSeedBytes(30000), 1000);
  assertEquals(capped.length / 3, 1000);
  for (let i = 0; i < capped.length; i += 3) {
    const r = Math.hypot(capped[i], capped[i + 1], capped[i + 2]);
    assert(r <= 1.0001 && r >= 0.499, "radius out of range: " + r);
  }
  // deterministic — the same tune always renders the same object
  assertEquals([...v2mByteCloud(v2mSeedBytes(90))], [...v2mByteCloud(v2mSeedBytes(90))]);

  // THE REGRESSION THAT SHIPPED: real tunes are full of repeated bytes and long zero runs. The first
  // mapping derived position from byte triples, so every identical triple landed on ONE coordinate and a
  // 7 KB tune rendered as a few dozen specks. Distinct positions must track the point count, not the
  // number of distinct byte values.
  const flat = new Uint8Array(4000);            // a pathological file: every byte identical
  const cloud = v2mByteCloud(flat);
  const distinct = new Set();
  for (let i = 0; i < cloud.length; i += 3) distinct.add(cloud[i].toFixed(4) + "," + cloud[i + 1].toFixed(4));
  assert(distinct.size > 3900, "a uniform file collapsed to " + distinct.size + " visible points of 4000");
});

Deno.test("v2m helixStrand — one point per byte, ordered along the strand, value only modulates radius", () => {
  const bytes = v2mSeedBytes(600);
  const { pos, n } = v2mHelixStrand(bytes);
  assertEquals(n, 600, "one point per byte");
  assertEquals(pos.length, 600 * 3);
  // y is monotonic: the strand must READ end to end, or a transcription head means nothing
  for (let k = 1; k < n; k++) {
    assert(pos[k * 3 + 1] >= pos[(k - 1) * 3 + 1] - 1e-6, "strand doubles back at " + k);
  }
  assertEquals(pos[1].toFixed(4), (-1.2).toFixed(4), "starts at the bottom of the span");
  assert(Math.abs(pos[(n - 1) * 3 + 1] - 1.2) < 1e-6, "ends at the top of the span");
  // radius stays inside the band the byte value can reach
  for (let k = 0; k < n; k++) {
    const r = Math.hypot(pos[k * 3], pos[k * 3 + 2]);
    assert(r >= 0.42 * 0.72 - 1e-6 && r <= 0.42 + 1e-6, "radius out of band: " + r);
  }
  // a file of identical bytes must still draw a full strand (the collapse trap, again)
  const flat = v2mHelixStrand(new Uint8Array(500));
  const ys = new Set();
  for (let k = 0; k < flat.n; k++) ys.add(flat.pos[k * 3 + 1].toFixed(5));
  assert(ys.size > 480, "uniform bytes collapsed the strand: " + ys.size);
  assertEquals(v2mHelixStrand(new Uint8Array(0)).n, 0);
  // sub-sampled above the cap, still one strand
  assertEquals(v2mHelixStrand(v2mSeedBytes(50000), { max: 1000 }).n, 1000);
});

Deno.test("v2m helixAt — the read head follows the same curve, clamped", () => {
  const [x0, y0] = v2mHelixAt(0);
  assertEquals(y0.toFixed(4), (-1.2).toFixed(4));
  assertEquals(x0.toFixed(4), (0.42).toFixed(4), "t=0 starts at angle 0");
  assertEquals(v2mHelixAt(1)[1].toFixed(4), (1.2).toFixed(4));
  assertEquals(v2mHelixAt(-5)[1], v2mHelixAt(0)[1], "clamped low");
  assertEquals(v2mHelixAt(9)[1], v2mHelixAt(1)[1], "clamped high");
  assertEquals(v2mHelixAt(undefined)[1], v2mHelixAt(0)[1], "no progress yet → the start, not NaN");
});
