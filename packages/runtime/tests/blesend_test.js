// microspec runtime — emit-side tests. The round-trip is the whole point: build a preset's structures,
// assemble them into an on-air frame, decode with signatures(), and assert we get back what we intended.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { nearbyAction, proximityPairing, swiftPair, fastPair, samsungWatch, eddystoneUrl, assemble, PRESETS } from "../blesend.js";
import { signatures } from "../blesig.js";

const decode = (structures) => signatures(assemble(structures));

Deno.test("blesend: Nearby Action round-trips to the intended action, paired with a Nearby Info", () => {
  const sigs = decode(nearbyAction(0x08));   // Wi-Fi Password
  const na = sigs.find((s) => s.msg === "nearbyAction");
  assertEquals(na.detail.action, "wifiPassword");
  assertEquals(na.detail.popup, true);
  assert(sigs.some((s) => s.msg === "nearbyInfo"), "a real Nearby Action rides with a Nearby Info");
});

Deno.test("blesend: Proximity Pairing round-trips to the intended model and fits the 31-byte frame", () => {
  const structures = proximityPairing(0x0e20);
  const [pp] = decode(structures);
  assertEquals(pp.msg, "proximityPairing");
  assertEquals(pp.detail.model, 0x0e20);
  // 07 + len + 25 body = 27 mfg bytes; + 2 company + 2 AD header = 31, the legacy ceiling exactly.
  assertEquals(assemble(structures).length / 2, 31);
});

Deno.test("blesend: Swift Pair carries the owner's own words, Cyrillic and all, back out", () => {
  const [sp] = decode(swiftPair("тук тук"));
  assertEquals(sp.protocol, "swiftPair");
  assertEquals(sp.detail.name, "тук тук");
  assertEquals(sp.text.free, "тук тук");
});

Deno.test("blesend: Fast Pair normalises a model id to three bytes and round-trips", () => {
  const [fp] = decode(fastPair("cd8256"));
  assertEquals(fp.detail.mode, "discoverable");
  assertEquals(fp.detail.modelId, "cd8256");
});

Deno.test("blesend: Samsung Galaxy Watch round-trips to the intended model id and fits the frame", () => {
  const structures = samsungWatch(0x1a);
  const [sig] = decode(structures);
  assertEquals(sig.protocol, "easySetup");
  assertEquals(sig.msg, "easySetupWatch");
  assertEquals(sig.detail.family, "watch");
  assertEquals(sig.detail.watchId, 0x1a);
  // 10-byte prefix + 1 id = 11 mfg bytes; + 2 company + 2 AD header = 15, well inside the 31 budget.
  assertEquals(assemble(structures).length / 2, 15);
});

Deno.test("blesend: Fast Pair is the one preset asking for a connectable advert (real providers are ADV_IND)", () => {
  const fp = PRESETS.find((p) => p.id === "fastPair");
  assert(fp.connectable === true, "Fast Pair should advertise connectable");
  assert(!PRESETS.filter((p) => p.id !== "fastPair").some((p) => p.connectable), "only Fast Pair is connectable");
});

Deno.test("blesend: Eddystone-URL encodes scheme + TLD compression and decodes to the same URL", () => {
  const [ed] = decode(eddystoneUrl("https://example.com"));
  assertEquals(ed.msg, "eddystone_url");
  assertEquals(ed.detail.url, "https://example.com");
});

Deno.test("blesend: every preset builds a non-empty, in-budget frame that decodes to a signature", () => {
  for (const p of PRESETS) {
    const structures = p.build(p.custom ? "тест" : undefined);
    const raw = assemble(structures);
    assert(raw.length > 0, `${p.id} built nothing`);
    assert(raw.length / 2 <= 31, `${p.id} is ${raw.length / 2} bytes, over the legacy budget`);
    assert(decode(structures).length >= 1, `${p.id} did not decode back to a signature`);
  }
});
