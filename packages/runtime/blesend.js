// microspec runtime — the emit side: build the exact AD structures that raise each proximity-pairing popup.
//
// The inverse of blesig.js. Each encoder returns the `structures` array ble.advertiseRaw wants —
// { kind: "mfg"|"svc", id, data(hex) } — and the round-trip is a unit gate: what we EMIT must decode back,
// through signatures(), to what we INTENDED. That is the only honest check available off-device.
//
// This is the LAB transmitter, scoped to the owner's own devices behind a consent gate. The reliability
// tuning (which dynamic fields a modern iOS needs, MAC-rotation cadence) is UNKNOWN off-device
// (docs/research/ble-air.md §7) — these payloads are the plain, documented shapes; the owner tunes on the
// hardware. Pure — no DOM, no clock, no shell.

const enc = new TextEncoder();
const hx = (bytes) => Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
const mfg = (id, bytes) => ({ kind: "mfg", id, data: hx(bytes) });
const svc = (id, bytes) => ({ kind: "svc", id, data: hx(bytes) });

const APPLE = 0x004c, MICROSOFT = 0x0006;
const FAST_PAIR = 0xfe2c, EDDYSTONE = 0xfeaa;

/**
 * Apple Continuity Nearby Action — the setup/action sheet on a nearby iPhone/iPad. Paired with a Nearby
 * Info, which is what a real device always sends alongside and which makes the sheet fire more reliably.
 * `auth` is left at zeros: a documented, static payload that raises the sheet on older iOS (the owner's
 * test iPad); newer iOS wants the field varied, which is on-device tuning, not something to fake here.
 */
export function nearbyAction(actionType, auth = [0x00, 0x00, 0x00]) {
  const action = [0x0f, 0x05, 0xc0, actionType & 0xff, auth[0], auth[1], auth[2]];
  const info = [0x10, 0x05, 0x00, 0x00, auth[0], auth[1], auth[2]];
  return [mfg(APPLE, [...action, ...info])];
}

/** Apple Proximity Pairing — the AirPods-style pairing card. 25 state bytes after type+len (0x19). */
export function proximityPairing(model = 0x0e20) {
  const body = [
    0x01, (model >> 8) & 0xff, model & 0xff,   // prefix + device model
    0x55, 0x84, 0x84, 0x08, 0x00, 0x00, 0x84, 0x00, 0x00, 0x00,  // status, batteries, lid, colour
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // 16-byte "encrypted" tail
  ];
  return [mfg(APPLE, [0x07, body.length, ...body])];
}

/** Microsoft Swift Pair — "New <name> found" on a nearby Windows PC. The name is FREE-FORM: this is the one
 *  preset where the owner's own words ("тук тук") actually travel in the packet. */
export function swiftPair(name = "тук тук") {
  return [mfg(MICROSOFT, [0x03, 0x00, 0x80, ...enc.encode(String(name))])];
}

/** Google Fast Pair — "Tap to pair" on a nearby Android phone. 3-byte model id (a registered id shows a
 *  name+image from Google's DB; an arbitrary one still raises the sheet). */
export function fastPair(modelId = "cd8256") {
  const m = String(modelId).replace(/[^0-9a-f]/gi, "").padStart(6, "0").slice(0, 6).toLowerCase();
  return [svc(FAST_PAIR, [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)])];
}

const ED_SCHEME = ["http://www.", "https://www.", "http://", "https://"];
const ED_TLD = [".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
  ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"];

/** Eddystone-URL — a plain, standards-defined beacon carrying a web address. Harmless; the benign demo. */
export function eddystoneUrl(url = "https://example.com") {
  let s = String(url), scheme = 3, rest = s;
  for (let i = 0; i < ED_SCHEME.length; i++) if (s.startsWith(ED_SCHEME[i])) { scheme = i; rest = s.slice(ED_SCHEME[i].length); break; }
  const body = [0x10, 0xec, scheme];
  outer: for (let i = 0; i < rest.length;) {
    for (let t = 0; t < ED_TLD.length; t++) {
      if (rest.startsWith(ED_TLD[t], i)) { body.push(t); i += ED_TLD[t].length; continue outer; }
    }
    body.push(rest.charCodeAt(i) & 0x7f); i++;
  }
  return [svc(EDDYSTONE, body)];
}

/**
 * The presets the send grid offers, own-device lab. `custom` names a free-text field the UI collects
 * (Swift Pair's display name, Eddystone's URL); the rest are one-tap. Order mirrors the analyzer grid.
 */
export const PRESETS = [
  { id: "iosSetup", vendor: "apple", target: "ios", build: () => nearbyAction(0x09) },
  { id: "wifiPassword", vendor: "apple", target: "ios", build: () => nearbyAction(0x08) },
  { id: "airpods", vendor: "apple", target: "ios", build: () => proximityPairing(0x0e20) },
  { id: "swiftPair", vendor: "microsoft", target: "windows", custom: "name", build: (v) => swiftPair(v) },
  { id: "fastPair", vendor: "google", target: "android", build: () => fastPair() },
  { id: "eddystone", vendor: "eddystone", target: "any", custom: "url", build: (v) => eddystoneUrl(v) },
];

/** Assemble structures into the full on-air AD hex — the inverse of a scanner's raw frame, for round-trip
 *  tests and for showing the owner the exact bytes a preset puts in the air. */
export function assemble(structures) {
  let out = "";
  for (const s of structures) {
    const idLo = (s.id & 0xff).toString(16).padStart(2, "0");
    const idHi = ((s.id >> 8) & 0xff).toString(16).padStart(2, "0");
    const type = s.kind === "svc" ? "16" : "ff";
    const value = idLo + idHi + s.data;               // little-endian id, then the value
    const len = (1 + value.length / 2).toString(16).padStart(2, "0");   // AD length counts the type octet too
    out += len + type + value;
  }
  return out;
}
