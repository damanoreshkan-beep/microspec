// microspec runtime — radar unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseAd as rdParseAd, classify as rdClassify, addrKind as rdAddrKind, rotates as rdRotates, band as rdBand, bandFraction as rdBandFraction, smooth as rdSmooth, estimateDistance as rdEstimateDistance, guardScore as rdGuardScore, GUARD as rdGUARD, signalPercent as rdSignalPercent, orderDevices as rdOrderDevices, hexSpiral as rdHexSpiral, hexToXY as rdHexToXY, hexDistance as rdHexDistance, combSize as rdCombSize } from "../radar.js";

Deno.test("radar: an AD walk stops at a structure that would read past the end", () => {
  // The catalogue's own gate mock: flags, complete 16-bit UUID 0xFCB2, service data for 0xFCB2.
  const ok = rdParseAd("0201060303b2fc0716b2fc41424344");
  assertEquals(ok.truncated, false);
  assertEquals(ok.error, null);
  assertEquals(ok.structures.length, 3);
  assertEquals(ok.structures[0].type, 0x01);
  assertEquals(ok.structures[2].value.length, 6, "service data keeps its UUID plus 4 payload bytes");

  // The off-by-one that silently shortens a value instead of reporting it: the last structure claims one
  // more byte than the frame holds. slice() would clamp and hand back a short value with no complaint.
  const short = rdParseAd("0201060303b2fc0816b2fc41424344");
  assertEquals(short.truncated, true, "a structure running past the end is truncated, never quietly clipped");
  assertEquals(short.structures.length, 2, "the overrunning structure is dropped, not half-parsed");

  assertEquals(rdParseAd("0201060").error, "notHex", "an odd-length string is not a frame");
  assertEquals(rdParseAd("").structures.length, 0);
  assertEquals(rdParseAd(undefined).structures.length, 0);
});

Deno.test("radar: a DULT accessory announces that it is separated from its owner", () => {
  // Draft Table 1: after the 2-byte service UUID come the Network ID, then a byte whose LEAST significant
  // bit is the near-owner bit. 0 means separated — the state that justifies telling the user anything.
  const sep = rdClassify({ addr: "4C:11:22:33:44:55", raw: "0201060516b2fc0700" });
  assertEquals(sep.tracker, "separated");
  assertEquals(sep.separated, true);
  assert(sep.why.includes("dultSeparated"));

  const near = rdClassify({ addr: "4C:11:22:33:44:55", raw: "0201060516b2fc0701" });
  assertEquals(near.tracker, "nearOwner");
  assertEquals(near.separated, false, "its owner is right there — this is the commonest false positive");
});

Deno.test("radar: a vendor is not a device class, and a pairing protocol is not a tracker", () => {
  // Apple company data covers phones, watches and earbuds. Classifying on it is a false-positive machine.
  const airpods = rdClassify({ addr: "5A:00:00:00:00:01", raw: "05ff4c00070f" });
  assertEquals(airpods.vendor, "Apple");
  assertEquals(airpods.tracker, "none", "a company ID alone must never read as a tracker");

  // Fast Pair is how headphones pair; Eddystone is a generic beacon protocol. Neither is evidence.
  for (const uuid of ["03032cfe", "0303aafe"]) {
    const c = rdClassify({ addr: "5A:00:00:00:00:02", raw: "020106" + uuid });
    assertEquals(c.tracker, "none", `${uuid} is an ordinary accessory protocol, not a tracker marker`);
  }

  const tile = rdClassify({ addr: "5A:00:00:00:00:03", raw: "0201060303edfe" });
  assertEquals(tile.tracker, "possible");
  assert(tile.protocols.includes("tile"));
});

Deno.test("radar: an address says whether it can be followed at all", () => {
  assertEquals(rdAddrKind("4C:11:22:33:44:55"), "resolvable");   // 0x4C -> 0b01
  assertEquals(rdAddrKind("0A:11:22:33:44:55"), "nonResolvable"); // 0x0A -> 0b00
  assertEquals(rdAddrKind("C3:11:22:33:44:55"), "staticRandom");  // 0xC3 -> 0b11
  assertEquals(rdAddrKind("8F:11:22:33:44:55"), "reserved");
  assertEquals(rdAddrKind("zz"), "unknown");
  assert(rdRotates("4C:11:22:33:44:55"), "a resolvable private address rotates, so a trail must end at it");
});

Deno.test("radar: strength is a band in dBm, and metres need calibration the caller must supply", () => {
  assertEquals(rdBand(-40), "immediate");
  assertEquals(rdBand(-60), "near");
  assertEquals(rdBand(-80), "far");
  assertEquals(rdBand(-95), "faint");
  assertEquals(rdBand(NaN), "unknown");

  // The whole point: no default calibration exists, so an uncalibrated call returns null rather than a
  // confident number. -59/2 is a beacon profile, not a Bluetooth constant.
  assertEquals(rdEstimateDistance({ rssi: -70 }), null);
  assertEquals(rdEstimateDistance({ rssi: -70, referenceRssi: -59 }), null);
  const d = rdEstimateDistance({ rssi: -70, referenceRssi: -59, pathLossExponent: 2 });
  assert(Math.abs(d - 10 ** (11 / 20)) < 1e-9);

  // A 10 dB reference error at n=2 is a x3.16 distance error — the number that makes metres indefensible.
  const off = rdEstimateDistance({ rssi: -70, referenceRssi: -49, pathLossExponent: 2 });
  assert(Math.abs(off / d - 3.1622776) < 1e-4, "10 dB of reference error is a 3.16x distance error");

  assert(rdBandFraction(-40) < rdBandFraction(-100), "a stronger signal sits nearer the centre");
  assertEquals(rdBandFraction(-20), 0, "clamped, so an absurd reading cannot leave the scene");
  assertEquals(rdBandFraction(-140), 1);
});

Deno.test("radar: smoothing is time-based, because advertising intervals are not constant", () => {
  assertEquals(rdSmooth(NaN, -60, 500), -60, "the first sample IS the estimate");
  // The same alpha applied to a slower stream would mean a different memory. Twice the gap must move the
  // estimate further, which a fixed per-sample alpha cannot express.
  const fast = rdSmooth(-60, -80, 500);
  const slow = rdSmooth(-60, -80, 3000);
  assert(slow < fast, "a longer gap trusts the new sample more");
  assert(fast > -80 && fast < -60);
  assertEquals(rdSmooth(-60, NaN, 500), -60, "a missing reading leaves the estimate alone");
});

Deno.test("radar: guard needs every criterion, and says which one is missing", () => {
  const near = { lat: 50.45, lon: 30.52 };
  const far = { lat: 50.47, lon: 30.52 };          // ~2.2 km north
  const t0 = 1_700_000_000_000;
  const sightings = [
    { at: t0, rssi: -60, fix: near },
    { at: t0 + 6 * 60_000, rssi: -62, fix: near },
    { at: t0 + 14 * 60_000, rssi: -58, fix: far },
    { at: t0 + 21 * 60_000, rssi: -61, fix: far },
    { at: t0 + 26 * 60_000, rssi: -59, fix: far },
  ];
  const good = rdGuardScore({ sightings, separated: true, classifiable: true });
  assertEquals(good.reasons, []);
  assertEquals(good.meets, true);
  assertEquals(good.confidence, 1);
  assert(good.displacement > 1500, "displacement is real metres, not a degree delta");
  assert(good.segments >= 2);

  // A device whose owner is nearby is the commonest false positive of all — it must never alert.
  const owned = rdGuardScore({ sightings, separated: false, classifiable: true });
  assertEquals(owned.meets, false);
  assert(owned.reasons.includes("notSeparated"));

  // Standing still with a neighbour's beacon: plenty of sightings, no journey.
  const still = rdGuardScore({
    sightings: sightings.map((s) => ({ ...s, fix: near })), separated: true, classifiable: true,
  });
  assertEquals(still.meets, false);
  assert(still.reasons.includes("noDisplacement"));

  // A pre-24 shell sends no payload, so nothing is classifiable and Guard must stay silent rather than
  // guess from co-motion alone.
  const blind = rdGuardScore({ sightings, separated: true, classifiable: false });
  assertEquals(blind.meets, false);
  assert(blind.reasons.includes("noPayload"));

  assertEquals(rdGuardScore({}).meets, false, "an empty track alerts nobody");
});

Deno.test("radar: the guard thresholds are ours, and are not DULT's accessory constants", () => {
  // The draft's 30 minutes is when an ACCESSORY switches to separated mode. Reusing it as an alert
  // threshold would be inventing standards compliance the draft explicitly does not provide: its §6
  // "Platform Support for Unwanted Tracking" reads "TODO".
  assert(rdGUARD.minSpanMs !== 30 * 60_000, "do not borrow the accessory's state constant as a policy");
  assert(rdGUARD.minDisplacementM >= 100, "a GPS accuracy radius is 5-30 m; the floor must clear jitter");
  assert(rdGUARD.minSegments >= 2);
});

Deno.test("radar: a percentage is per-RADIO, because the three are not one quantity", () => {
  // RSRP runs ~40 dB below a BLE advertisement. One shared scale pins every cell at 0% and pretends -104
  // and -120 are the same place — the mistake apps/os documents for its radius function.
  assertEquals(rdSignalPercent(-120, "lte"), 0);
  assertEquals(rdSignalPercent(-70, "lte"), 100);
  assert(rdSignalPercent(-95, "lte") > rdSignalPercent(-95, "ble"), "a cell at -95 is healthy where a beacon is nearly gone");
  assertEquals(rdSignalPercent(-100, "ble"), 0);
  assertEquals(rdSignalPercent(-45, "ble"), 100);
  assertEquals(rdSignalPercent(-90, "wifi"), 0);
  assertEquals(rdSignalPercent(-35, "wifi"), 100);
  // Clamped at both ends, and monotonic in between — a percentage that can exceed 100 is not a percentage.
  for (const kind of ["ble", "wifi", "lte"]) {
    assertEquals(rdSignalPercent(0, kind), 100);
    assertEquals(rdSignalPercent(-200, kind), 0);
    assertEquals(rdSignalPercent(NaN, kind), 0);
    let prev = -1;
    for (let r = -130; r <= -20; r += 5) {
      const p = rdSignalPercent(r, kind);
      assert(p >= prev, `${kind} went backwards at ${r} dBm`);
      assert(p >= 0 && p <= 100, `${kind} left 0..100 at ${r} dBm`);
      prev = p;
    }
  }
});

Deno.test("radar: ordering does not move a row unless something changed that means something", () => {
  const mk = (addr, rssi, kind, first) => ({ addr, smooth: rssi, kind, first });
  const list = [
    mk("a", -80, "ble", 100), mk("b", -50, "wifi", 200), mk("c", -52, "ble", 300), mk("d", -95, "lte", 400),
  ];
  // First-seen is the only order that cannot move at all.
  assertEquals(rdOrderDevices(list, "seen").map((d) => d.addr), ["a", "b", "c", "d"]);

  // By signal: sorted on the BAND, so ordinary fading does not reshuffle the screen. -50 and -52 are both
  // "immediate", so they keep their first-seen order even though b is stronger than c.
  assertEquals(rdOrderDevices(list, "signal").map((d) => d.addr), ["b", "c", "a", "d"]);
  const faded = list.map((d) => (d.addr === "b" ? { ...d, smooth: -54 } : d));
  assertEquals(rdOrderDevices(faded, "signal").map((d) => d.addr), ["b", "c", "a", "d"],
    "4 dB of ordinary fading must not move a row");
  // Crossing a band boundary is a real change and IS allowed to move it. b falls out of "immediate" into
  // the same band as a, so the tie resolves on first-seen and b lands AFTER a — the stability holding even
  // as the row moves.
  const dropped = list.map((d) => (d.addr === "b" ? { ...d, smooth: -72 } : d));
  assertEquals(rdOrderDevices(dropped, "signal").map((d) => d.addr), ["c", "a", "b", "d"]);

  assertEquals(rdOrderDevices(list, "kind").map((d) => d.addr), ["c", "a", "b", "d"]);
  // Pure: the caller's array is never sorted in place, or the atom mutates behind preact's back.
  assertEquals(list.map((d) => d.addr), ["a", "b", "c", "d"]);
});

Deno.test("radar: the hex spiral tiles without a gap or a collision", () => {
  // A duplicate coordinate stacks two devices in one cell and reads as a rendering glitch, not a maths
  // bug — so uniqueness is asserted rather than eyeballed.
  for (const n of [1, 7, 19, 37, 61]) {
    const s = rdHexSpiral(n);
    assertEquals(s.length, n);
    assertEquals(new Set(s.map((c) => `${c.q},${c.r}`)).size, n, `duplicate cell at n=${n}`);
  }
  // Ring k holds exactly 6k cells, which is what makes rank read as distance from the centre.
  const rings = {};
  for (const c of rdHexSpiral(61)) rings[rdHexDistance(c)] = (rings[rdHexDistance(c)] || 0) + 1;
  assertEquals(rings, { 0: 1, 1: 6, 2: 12, 3: 18, 4: 24 });
  assertEquals(rdHexSpiral(0).length, 0);

  const { x, y } = rdHexToXY({ q: 0, r: 0 }, 1);
  assertEquals([x, y], [0, 0]);
});

Deno.test("radar: the comb rounds up to a COMPLETE ring, never a lopsided spiral", () => {
  assertEquals(rdCombSize(0), 1);
  assertEquals(rdCombSize(1), 1);
  for (const n of [2, 5, 7]) assertEquals(rdCombSize(n), 7, `${n} should fill the first ring`);
  for (const n of [8, 12, 19]) assertEquals(rdCombSize(n), 19, `${n} should fill the second ring`);
  assertEquals(rdCombSize(20), 37);
  // Every answer is a real centred-hexagonal number, so the drawn shape is always symmetric.
  for (let n = 0; n <= 60; n++) {
    const s = rdCombSize(n);
    assert(s >= Math.max(1, n), `comb ${s} cannot hold ${n}`);
    const rings = rdHexSpiral(s).map(rdHexDistance);
    const outer = Math.max(...rings);
    assertEquals(rings.filter((r) => r === outer).length, outer === 0 ? 1 : 6 * outer,
      `n=${n} left the outer ring incomplete`);
  }
});
