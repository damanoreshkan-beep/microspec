// microspec runtime — BLE proximity-pairing signature tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)
//
// Fixtures are assembled from the byte layouts verified in docs/research/ble-air.md, so a change to the
// decoder that drifts from the reverse-engineered format fails here rather than on the owner's phone.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { signatures, decodeContinuity, CATALOG } from "../blesig.js";

const enc = new TextEncoder();
const H = (s) => s.replace(/\s/g, "");
const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const byte = (n) => (n & 0xff).toString(16).padStart(2, "0");
const le16 = (u) => byte(u) + byte(u >> 8);

// One AD structure: [length][type][value]; length counts the type octet but not itself.
const adStruct = (type, valueHex) => byte(1 + H(valueHex).length / 2) + byte(type) + H(valueHex);
const mfg = (company, payloadHex) => adStruct(0xff, le16(company) + H(payloadHex));
const svc = (uuid, payloadHex) => adStruct(0x16, le16(uuid) + H(payloadHex));
// One Continuity TLV message: [type][len][payload], len = payload byte count.
const cont = (type, payloadHex) => byte(type) + byte(H(payloadHex).length / 2) + H(payloadHex);
const FLAGS = "020106";

Deno.test("blesig: Nearby Action Wi-Fi Password + Nearby Info decode from one Apple advertisement", () => {
  // Nearby Action: flags · action-type 0x08 (Wi-Fi Password) · 3-byte auth. Paired with a Nearby Info.
  const apple = cont(0x0f, "c0 08 11 22 33") + cont(0x10, "37 00 83 90 96");
  const raw = FLAGS + mfg(0x004c, apple);
  const sigs = signatures(raw);

  const na = sigs.find((x) => x.msg === "nearbyAction");
  assert(na, "nearby action present");
  assertEquals(na.detail.action, "wifiPassword");
  assertEquals(na.detail.popup, true);                 // 0x08 is a popup-raising action
  assertEquals(na.text.fixed, "na_wifiPassword");      // the words are Apple's, chosen by the code
  assert(!("free" in na.text), "no free-form text on Continuity");

  const ni = sigs.find((x) => x.msg === "nearbyInfo");
  assert(ni, "nearby info present");
  assertEquals(ni.detail.status, 3);                   // high nibble
  assertEquals(ni.detail.activity, 7);                 // low nibble
});

Deno.test("blesig: Proximity Pairing names a known AirPods model and always reports the raw code", () => {
  // type 0x07 · prefix 0x01 · device model 0x0e20 (AirPods Pro, big-endian) · 22 bytes of state.
  const payload = "01 0e 20 55" + " 42".repeat(21);
  const raw = FLAGS + mfg(0x004c, cont(0x07, payload));
  const [pp] = signatures(raw);
  assertEquals(pp.msg, "proximityPairing");
  assertEquals(pp.detail.model, 0x0e20);
  assertEquals(pp.detail.modelName, "airpodsPro");
});

Deno.test("blesig: Swift Pair is the ONE protocol that carries a free-form name — even Cyrillic", () => {
  // 0x0006 Microsoft · beaconId 0x03 · subScenario 0x00 (LE only) · reserved 0x80 · Display Name UTF-8.
  const name = "тук тук";
  const raw = FLAGS + mfg(0x0006, "03 00 80" + toHex(enc.encode(name)));
  const [sp] = signatures(raw);
  assertEquals(sp.protocol, "swiftPair");
  assertEquals(sp.detail.subScenario, 0x00);
  assertEquals(sp.detail.name, name);
  assertEquals(sp.text.free, name);                    // the whole point: a chosen string, decoded back out
});

Deno.test("blesig: Fast Pair discoverable reports a model id whose NAME lives in Google's DB, not the packet", () => {
  const raw = FLAGS + svc(0xfe2c, "aa bb cc");         // 3 bytes = discoverable / pairing mode
  const [fp] = signatures(raw);
  assertEquals(fp.protocol, "fastPair");
  assertEquals(fp.detail.mode, "discoverable");
  assertEquals(fp.detail.modelId, "aabbcc");
  assertEquals(fp.text.db, "aabbcc");                  // DB-driven, not free-form
  // Non-discoverable (account-key filter): a name-less rotating frame.
  const acct = signatures(FLAGS + svc(0xfe2c, "00 11 22 33 44"));
  assertEquals(acct[0].detail.mode, "account");
  assertEquals(acct[0].text, null);
});

Deno.test("blesig: Eddystone URL frame decodes to a readable URL", () => {
  // frame 0x10 (URL) · tx 0xec · scheme 0x01 (https://www.) · "example" · 0x00 (.com/)
  const raw = FLAGS + svc(0xfeaa, "10 ec 01" + toHex(enc.encode("example")) + "00");
  const [ed] = signatures(raw);
  assertEquals(ed.msg, "eddystone_url");
  assertEquals(ed.detail.url, "https://www.example.com/");
  assertEquals(ed.text.free, "https://www.example.com/");
});

Deno.test("blesig: ordinary and own-transmitter advertisements produce no signatures", () => {
  assertEquals(signatures(FLAGS), []);                                  // flags only
  assertEquals(signatures(FLAGS + mfg(0xffff, "e1 00000155")), []);     // earshot's own 0xFFFF payload
  assertEquals(signatures(""), []);                                     // empty
  assertEquals(signatures("zz"), []);                                   // non-hex never throws
});

Deno.test("blesig: the Continuity TLV parser stops cleanly at a truncated trailing message", () => {
  // A complete Nearby Info followed by a message claiming 9 bytes but carrying 2 — the good one survives.
  const v = new Uint8Array([...hexToBytes(cont(0x10, "37 00 83 90 96")), 0x0f, 0x09, 0xc0, 0x08]);
  const msgs = decodeContinuity(v);
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].msg, "nearbyInfo");
});

Deno.test("blesig: the catalog spans every popular Apple + Android + desktop protocol with an honest text-kind", () => {
  const kinds = Object.fromEntries(CATALOG.map((c) => [c.msg, c.textKind]));
  assertEquals(kinds.nearbyAction, "fixed");
  assertEquals(kinds.swiftPair, "free");
  assertEquals(kinds.fastPairModel, "db");
  assertEquals(kinds.easySetup, "none");
  assert(CATALOG.some((c) => c.target === "ios") && CATALOG.some((c) => c.target === "android") && CATALOG.some((c) => c.target === "windows"));
});

function hexToBytes(hex) {
  const h = H(hex);
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}
