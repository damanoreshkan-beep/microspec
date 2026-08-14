
const enc = new TextEncoder();
const hx = (bytes) => Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
const mfg = (id, bytes) => ({ kind: "mfg", id, data: hx(bytes) });
const svc = (id, bytes) => ({ kind: "svc", id, data: hx(bytes) });

const FILL = 0xba;                                   
function noise(rnd, n) {
  if (typeof rnd === "function") return Array.from(rnd(n), (b) => b & 0xff);
  return new Array(n).fill(FILL);
}
function nz(bytes) { bytes[bytes.length - 1] |= 0x01; return bytes; }

const APPLE = 0x004c, MICROSOFT = 0x0006, SAMSUNG = 0x0075;
const FAST_PAIR = 0xfe2c, EDDYSTONE = 0xfeaa;

/**
 * Apple Continuity Nearby Action — the setup/action sheet on a nearby iPhone/iPad. Paired with a Nearby
 * Info, which is what a real device always sends alongside and which makes the sheet fire more reliably.
 * `auth` is left at zeros:
 * test iPad); newer iOS wants the field varied, which is on-device tuning, not something to fake here.
 */
export function nearbyAction(actionType, rnd) {
  const action = [0x0f, 0x05, 0xc0, actionType & 0xff, ...noise(rnd, 3)];
  const info = [0x10, 0x05, 0x00, 0x00, ...noise(rnd, 3)];
  return [mfg(APPLE, nz([...action, ...info]))];
}

/** Apple Proximity Pairing — the AirPods-style pairing card. 25 state bytes after type+len (0x19). The
 *  battery/charging/lid fields and the 16-byte "encrypted" tail are dynamic NON-ZERO bytes: static zeros are
 *  what a modern iOS ignores AND what Android's trailing-zero strip eats (see `noise` above). `prefix` is
 *  0x07, matching the working Android emitter (furiousMAC documents 0x01; the prefix does not gate the card,
 *  the model code does, and 0x07 is the proven-on-air value). */
export function proximityPairing(model = 0x0e20, rnd) {
  const body = [
    0x07, (model >> 8) & 0xff, model & 0xff,   
    0x55, ...noise(rnd, 1), ...noise(rnd, 1),  
    ...noise(rnd, 1),                          
    0x00, 0x00,                                
    ...nz(noise(rnd, 16)),                     
  ];
  return [mfg(APPLE, [0x07, body.length, ...body])];
}

/** Microsoft Swift Pair — "New <name> found" on a nearby Windows PC. The name is FREE-FORM: this is the one
 */
export function swiftPair(name = "тук тук") {
  return [mfg(MICROSOFT, [0x03, 0x00, 0x80, ...enc.encode(String(name))])];
}

/** Google Fast Pair — "Tap to pair" on a nearby Android phone. 3-byte model id (a registered id shows a
 *  name+image from Google's DB; an arbitrary one still raises the sheet). */
export function fastPair(modelId = "cd8256") {
  const m = String(modelId).replace(/[^0-9a-f]/gi, "").padStart(6, "0").slice(0, 6).toLowerCase();
  return [svc(FAST_PAIR, [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)])];
}

const SAMSUNG_WATCH_PREFIX = [0x01, 0x00, 0x02, 0x00, 0x01, 0x01, 0xff, 0x00, 0x00, 0x43];
export function samsungWatch(watchId = 0x1a) {
  return [mfg(SAMSUNG, [...SAMSUNG_WATCH_PREFIX, watchId & 0xff])];
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
 * (Swift Pair's display name, Eddystone's URL, Fast Pair's 6-hex model id); `connectable` asks the shell for
 * an ADV_IND advertisement (a real Fast Pair provider is connectable — the seeker connects to its GATT). The
 * rest are one-tap. Order mirrors the analyzer grid: the two vectors that reliably raise UI on a current
 * stock device (Swift Pair on Windows 11, Fast Pair on Android) lead; Apple/Samsung stay experimental.
 */
export const PRESETS = [
  { id: "swiftPair", vendor: "microsoft", target: "windows", custom: "name", build: (v) => swiftPair(v) },
  { id: "fastPair", vendor: "google", target: "android", custom: "model", connectable: true, build: (v) => fastPair(v) },
  { id: "samsungWatch", vendor: "samsung", target: "android", build: () => samsungWatch(0x1a) },
  { id: "iosSetup", vendor: "apple", target: "ios", dynamic: true, build: (v, rnd) => nearbyAction(0x09, rnd) },
  { id: "wifiPassword", vendor: "apple", target: "ios", dynamic: true, build: (v, rnd) => nearbyAction(0x08, rnd) },
  { id: "airpods", vendor: "apple", target: "ios", dynamic: true, build: (v, rnd) => proximityPairing(0x0e20, rnd) },
  { id: "eddystone", vendor: "eddystone", target: "any", custom: "url", build: (v) => eddystoneUrl(v) },
];

/** Assemble structures into the full on-air AD hex — the inverse of a scanner's raw frame, for round-trip
 */
export function assemble(structures) {
  let out = "";
  for (const s of structures) {
    const idLo = (s.id & 0xff).toString(16).padStart(2, "0");
    const idHi = ((s.id >> 8) & 0xff).toString(16).padStart(2, "0");
    const type = s.kind === "svc" ? "16" : "ff";
    const value = idLo + idHi + s.data;               
    const len = (1 + value.length / 2).toString(16).padStart(2, "0");   
    out += len + type + value;
  }
  return out;
}
