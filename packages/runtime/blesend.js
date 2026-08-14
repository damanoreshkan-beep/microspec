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

// The one thing that makes Apple's cards actually fire from an Android AdvertiseData.Builder path (VERIFIED
// against simondankelmann/Bluetooth-LE-Spam, docs/research/ble-apple-emit.md): the dynamic tail must be
// NON-ZERO. Android's AdvertiseDataParser.removeTrailingZeros strips trailing 0x00 from every legacy
// advertisement (Peripherals.java:246), so a payload that ends in a zero-filled "encrypted" tail arrives on
// air TRUNCATED — its inner TLV length byte then overruns the shortened data and iOS discards the message.
// The working apps fill that tail with Random.nextBytes(n): non-zero, so it survives the strip, AND fresh
// each cycle, which is what a current iOS wants before it re-raises a card for a "new" device.
//
// `rnd` is that entropy source — a function (n) => bytes the caller supplies (the app hands it
// crypto.getRandomValues). Omitted, it falls back to a FIXED non-zero pattern so this pure module stays
// deterministic for the round-trip gate: a static packet still survives the strip and raises the FIRST card,
// but re-firing on a modern iOS wants the real per-cycle entropy — so the app passes `rnd`.
const FILL = 0xba;                                   // any non-zero byte; the point is only that it is not 0x00
function noise(rnd, n) {
  if (typeof rnd === "function") return Array.from(rnd(n), (b) => b & 0xff);
  return new Array(n).fill(FILL);
}
// The last byte on air must never be 0x00, or Android strips it and the inner length byte overruns. Random
// entropy can land a zero there ~1 cycle in 256, so the terminator is forced non-zero (this byte is opaque
// auth/encrypted state, so setting bit 0 is immaterial).
function nz(bytes) { bytes[bytes.length - 1] |= 0x01; return bytes; }

const APPLE = 0x004c, MICROSOFT = 0x0006, SAMSUNG = 0x0075;
const FAST_PAIR = 0xfe2c, EDDYSTONE = 0xfeaa;

/**
 * Apple Continuity Nearby Action — the setup/action sheet on a nearby iPhone/iPad. Paired with a Nearby
 * Info, which is what a real device always sends alongside and which makes the sheet fire more reliably.
 * `auth` is left at zeros: a documented, static payload that raises the sheet on older iOS (the owner's
 * test iPad); newer iOS wants the field varied, which is on-device tuning, not something to fake here.
 */
export function nearbyAction(actionType, rnd) {
  // The 3-byte auth tag is NON-ZERO (random per cycle in the working apps) — a zero tag would be the last
  // bytes on air and get stripped, corrupting both messages. The Nearby Info that rides along ends in its
  // own non-zero auth for the same reason.
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
    0x07, (model >> 8) & 0xff, model & 0xff,   // prefix + device model (big-endian)
    0x55, ...noise(rnd, 1), ...noise(rnd, 1),  // status + pods battery + charging/case battery
    ...noise(rnd, 1),                          // lid-open counter — must vary for a re-fire
    0x00, 0x00,                                // colour + reserved
    ...nz(noise(rnd, 16)),                     // 16-byte "encrypted" tail — random on air, never ends in zero
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

// Samsung EasySetup — the Galaxy Watch "pair" card on a nearby Samsung phone. VERIFIED byte layout
// (docs/research/ble-air.md §9): a fixed 10-byte prefix + a 1-byte watch model id. The shown text is NOT
// free-form — it is Samsung's own device string, chosen by the id — so this is a `none` text kind, and
// whether One UI 7/8 still raises the card is UNKNOWN, so it ships experimental.
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
// `build(value, rnd)` — the app hands `rnd = (n) => crypto.getRandomValues(new Uint8Array(n))`. Apple presets
// are `dynamic`: their payload must be re-randomised each cycle for a modern iOS to re-raise the card, so the
// app re-emits them on an interval. The static-text presets need no entropy and no re-emit.
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
