
import { assert, assertEquals } from "jsr:@std/assert@1";
import { signatures, decodeContinuity, CATALOG } from "../blesig.js";

const enc = new TextEncoder();
const H = (s) => s.replace(/\s/g, "");
const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const byte = (n) => (n & 0xff).toString(16).padStart(2, "0");
const le16 = (u) => byte(u) + byte(u >> 8);

const adStruct = (type, valueHex) => byte(1 + H(valueHex).length / 2) + byte(type) + H(valueHex);
const mfg = (company, payloadHex) => adStruct(0xff, le16(company) + H(payloadHex));
const svc = (uuid, payloadHex) => adStruct(0x16, le16(uuid) + H(payloadHex));
const cont = (type, payloadHex) => byte(type) + byte(H(payloadHex).length / 2) + H(payloadHex);
const FLAGS = "020106";

Deno.test("blesig: Nearby Action Wi-Fi Password + Nearby Info decode from one Apple advertisement", () => {
  const apple = cont(0x0f, "c0 08 11 22 33") + cont(0x10, "37 00 83 90 96");
  const raw = FLAGS + mfg(0x004c, apple);
  const sigs = signatures(raw);

  const na = sigs.find((x) => x.msg === "nearbyAction");
  assert(na, "nearby action present");
  assertEquals(na.detail.action, "wifiPassword");
  assertEquals(na.detail.popup, true);                 
  assertEquals(na.text.fixed, "na_wifiPassword");      
  assert(!("free" in na.text), "no free-form text on Continuity");

  const ni = sigs.find((x) => x.msg === "nearbyInfo");
  assert(ni, "nearby info present");
  assertEquals(ni.detail.status, 3);                   
  assertEquals(ni.detail.activity, 7);                 
});

Deno.test("blesig: Proximity Pairing names a known AirPods model and always reports the raw code", () => {
  const payload = "01 0e 20 55" + " 42".repeat(21);
  const raw = FLAGS + mfg(0x004c, cont(0x07, payload));
  const [pp] = signatures(raw);
  assertEquals(pp.msg, "proximityPairing");
  assertEquals(pp.detail.model, 0x0e20);
  assertEquals(pp.detail.modelName, "airpodsPro");
});

Deno.test("blesig: Swift Pair is the ONE protocol that carries a free-form name — even Cyrillic", () => {
  const name = "тук тук";
  const raw = FLAGS + mfg(0x0006, "03 00 80" + toHex(enc.encode(name)));
  const [sp] = signatures(raw);
  assertEquals(sp.protocol, "swiftPair");
  assertEquals(sp.detail.subScenario, 0x00);
  assertEquals(sp.detail.name, name);
  assertEquals(sp.text.free, name);                    
});

Deno.test("blesig: Fast Pair discoverable reports a model id whose NAME lives in Google's DB, not the packet", () => {
  const raw = FLAGS + svc(0xfe2c, "aa bb cc");         
  const [fp] = signatures(raw);
  assertEquals(fp.protocol, "fastPair");
  assertEquals(fp.detail.mode, "discoverable");
  assertEquals(fp.detail.modelId, "aabbcc");
  assertEquals(fp.text.db, "aabbcc");                  
  const acct = signatures(FLAGS + svc(0xfe2c, "00 11 22 33 44"));
  assertEquals(acct[0].detail.mode, "account");
  assertEquals(acct[0].text, null);
});

Deno.test("blesig: Eddystone URL frame decodes to a readable URL", () => {
  const raw = FLAGS + svc(0xfeaa, "10 ec 01" + toHex(enc.encode("example")) + "00");
  const [ed] = signatures(raw);
  assertEquals(ed.msg, "eddystone_url");
  assertEquals(ed.detail.url, "https://www.example.com/");
  assertEquals(ed.text.free, "https://www.example.com/");
});

Deno.test("blesig: ordinary and own-transmitter advertisements produce no signatures", () => {
  assertEquals(signatures(FLAGS), []);                                  
  assertEquals(signatures(FLAGS + mfg(0xffff, "e1 00000155")), []);     
  assertEquals(signatures(""), []);                                     
  assertEquals(signatures("zz"), []);                                   
});

Deno.test("blesig: the Continuity TLV parser stops cleanly at a truncated trailing message", () => {
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

Deno.test("blesig: a Samsung EasySetup Watch advert decodes to its model id, an unknown 0x0075 stays vendor-level", () => {
  const [watch] = signatures(H("0e ff 7500 010002000101ff0000431a"));
  assertEquals(watch.vendor, "samsung");
  assertEquals(watch.protocol, "easySetup");
  assertEquals(watch.msg, "easySetupWatch");
  assertEquals(watch.detail.family, "watch");
  assertEquals(watch.detail.watchId, 0x1a);
  const [other] = signatures(H("05 ff 7500 abcd"));
  assertEquals(other.msg, "easySetup");
  assertEquals(Object.keys(other.detail).length, 0);
});

function hexToBytes(hex) {
  const h = H(hex);
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}
