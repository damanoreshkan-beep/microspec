// microspec runtime — BLE proximity-pairing signatures: what a nearby advertisement is ASKING a phone to do.
//
// radar.js answers "is this a tracker, how strong, whose vendor". This module answers a different question:
// which PROXIMITY-PAIRING protocol an advertisement carries, decoded field by field, and — the one fact the
// whole thing exists to state honestly — whether the text a target phone would SHOW is free-form, fixed by a
// code, or pulled from a vendor database. That distinction is not cosmetic: it is the difference between a
// prank you can name ("тук тук") and a popup whose words you can never choose.
//
// Sources, each re-checked against the primary (docs/research/ble-air.md):
//   · Apple Continuity  — furiousMAC/continuity RE dissector (messages/*.md); RE-CONSISTENT with
//     Celosia & Cunche, PoPETs 2020. Message text is FIXED by a type/action code — the packet carries only
//     codes and hashes, never a string.
//   · Google Fast Pair  — developers.google.com/nearby/fast-pair (SPEC). The shown name comes from Google's
//     hosted model-id database, keyed by the 24-bit id — NOT from the advertisement.
//   · Microsoft Swift Pair — learn.microsoft.com bluetooth-swift-pair (SPEC). Carries an uncapped, free-form
//     "Display Name"; Windows renders "New <name> found". THE ONLY free-form-text path.
//   · Eddystone — SIG-open beacon format; frame type in the first service-data byte.
//   · Samsung EasySetup (0x0075) — Galaxy Watch shape VERIFIED from source (ble-air.md §9): a fixed 10-byte
//     prefix + a 1-byte model id, no free text. Other Samsung 0x0075 payloads stay vendor-level only.
//
// Pure — no DOM, no clock, no shell. Operates on the raw ScanRecord hex the shell's ble.scan sends as `raw`.

import { parseAd, adSummary } from "./radar.js";

const APPLE = 0x004c, MICROSOFT = 0x0006, SAMSUNG = 0x0075;
const FAST_PAIR = 0xfe2c, EDDYSTONE = 0xfeaa;

const dec = new TextDecoder("utf-8", { fatal: false });
const hex = (v) => Array.from(v, (x) => x.toString(16).padStart(2, "0")).join("");

// ── Apple Continuity message types ──────────────────────────────────────────────────────────────────────
// The first byte of each TLV message inside Apple's manufacturer data. Naming is RE-derived (furiousMAC);
// the analyzer classifies on it, it never claims to be a spec.
export const CONTINUITY = {
  0x05: "airdrop", 0x07: "proximityPairing", 0x08: "heySiri", 0x09: "airplayTarget",
  0x0a: "airplaySource", 0x0b: "magicSwitch", 0x0c: "handoff", 0x0d: "tetheringTarget",
  0x0e: "tetheringSource", 0x0f: "nearbyAction", 0x10: "nearbyInfo", 0x12: "findMy",
};

// Nearby Action (type 0x0F) action-type codes. The subset marked in POPUP is what raises a visible sheet on
// iOS (docs/research/ble-air.md §3, furiousMAC nearby_action.md). 0x08 is the Wi-Fi Password share sheet.
export const NEARBY_ACTION = {
  0x01: "appleTvSetup", 0x04: "mobileBackup", 0x05: "watchSetup", 0x06: "appleTvPair",
  0x07: "internetRelay", 0x08: "wifiPassword", 0x09: "iosSetup", 0x0a: "repair",
  0x0b: "speakerSetup", 0x0c: "applePay", 0x0d: "homeAudioSetup",
};
export const NEARBY_ACTION_POPUP = new Set([0x01, 0x06, 0x08, 0x09, 0x0b, 0x0d]);

// A handful of well-known Proximity Pairing device-model codes (big-endian u16 after the 0x01 prefix). The
// raw code is always reported; these only add a friendly name where we are confident (RE-CONSISTENT).
export const APPLE_MODELS = {
  0x0220: "airpods1", 0x0f20: "airpods2", 0x1320: "airpods3", 0x0e20: "airpodsPro",
  0x1420: "airpodsPro2", 0x0a20: "airpodsMax", 0x0520: "beatsX", 0x1020: "beatsFlex",
};

export const EDDYSTONE_FRAME = { 0x00: "uid", 0x10: "url", 0x20: "tlm", 0x30: "eid" };
const EDDYSTONE_SCHEME = ["http://www.", "https://www.", "http://", "https://"];
const EDDYSTONE_TLD = [".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
  ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"];

// text kinds — the payload the UI reads to answer "can you choose the words?":
//   null                 → this protocol shows no free text at all
//   { free }             → free-form, and here it is (Swift Pair)
//   { fixed }            → a fixed system string, named by key; you cannot change it (Continuity)
//   { db }               → chosen by a remote database keyed by this id; not in the packet (Fast Pair)
const FREE = (value) => ({ free: value });
const FIXED = (key) => ({ fixed: key });
const DB = (id) => ({ db: id });

/** Parse the TLV chain inside Apple manufacturer data → one entry per Continuity message. */
export function decodeContinuity(v) {
  const out = [];
  let i = 0;
  while (i + 1 < v.length) {
    const type = v[i], len = v[i + 1];
    const payload = v.slice(i + 2, i + 2 + len);
    if (payload.length < len) break;               // truncated message — report what completed, not a guess
    out.push(decodeContinuityMsg(type, payload));
    i += 2 + len;
    if (len === 0) break;
  }
  return out;
}

function decodeContinuityMsg(type, p) {
  const msg = CONTINUITY[type] || "unknown";
  const base = { vendor: "apple", protocol: "continuity", msg, type, raw: hex(p), text: null, detail: {} };
  if (type === 0x0f) {                             // Nearby Action
    const actionType = p.length >= 2 ? p[1] : null;
    const action = actionType != null ? (NEARBY_ACTION[actionType] || "unknown") : null;
    return {
      ...base,
      detail: { actionType, action, popup: actionType != null && NEARBY_ACTION_POPUP.has(actionType) },
      // The words are Apple's, chosen by the action code — never a string we can set.
      text: action ? FIXED(`na_${action}`) : null,
    };
  }
  if (type === 0x07) {                             // Proximity Pairing
    const model = p.length >= 3 ? (p[1] << 8) | p[2] : null;   // p[0] is the 0x01 prefix
    return { ...base, detail: { model, modelName: model != null ? (APPLE_MODELS[model] || null) : null } };
  }
  if (type === 0x10) {                             // Nearby Info — device usage state
    const status = p.length ? (p[0] >> 4) & 0x0f : null;
    const activity = p.length ? p[0] & 0x0f : null;
    return { ...base, detail: { status, activity } };
  }
  return base;                                     // named, not decoded (findMy/airdrop/handoff/…)
}

/** Microsoft Swift Pair: beaconId · subScenario · reservedRSSI(0x80) · Display Name (free-form UTF-8). */
export function decodeSwiftPair(v) {
  if (v.length < 3) return null;
  const sub = v[1];
  const name = v.length > 3 ? dec.decode(v.slice(3)) : "";
  return {
    vendor: "microsoft", protocol: "swiftPair", msg: "swiftPair", raw: hex(v),
    detail: { beaconId: v[0], subScenario: sub, reserved: v[2], name },
    // The one place a chosen string travels in the packet.
    text: name ? FREE(name) : null,
  };
}

/** Google Fast Pair: 3-byte model id when discoverable, else 0x00 + account-key filter. */
export function decodeFastPair(v) {
  if (v.length === 3) {
    const id = hex(v);
    return {
      vendor: "google", protocol: "fastPair", msg: "fastPairModel", raw: id,
      detail: { mode: "discoverable", modelId: id },
      text: DB(id),                                // the name is Google's, looked up by this id — not here
    };
  }
  return {
    vendor: "google", protocol: "fastPair", msg: "fastPairAccount", raw: hex(v),
    detail: { mode: "account" }, text: null,       // non-discoverable: a rotating filter, no name
  };
}

// Samsung EasySetup Galaxy Watch: a fixed 10-byte prefix then a 1-byte model id (docs/research/ble-air.md §9,
// VERIFIED bytes). Only the Watch shape is decoded to fields; any other Samsung 0x0075 payload is named
// honestly and left opaque (Buds ride a scan-response the shell does not surface).
const SAMSUNG_WATCH_PREFIX = [0x01, 0x00, 0x02, 0x00, 0x01, 0x01, 0xff, 0x00, 0x00, 0x43];
export function decodeSamsung(v) {
  const isWatch = v.length >= SAMSUNG_WATCH_PREFIX.length + 1 &&
    SAMSUNG_WATCH_PREFIX.every((b, i) => v[i] === b);
  if (isWatch) {
    return {
      vendor: "samsung", protocol: "easySetup", msg: "easySetupWatch", raw: hex(v),
      detail: { family: "watch", watchId: v[SAMSUNG_WATCH_PREFIX.length] }, text: null,
    };
  }
  return { vendor: "samsung", protocol: "easySetup", msg: "easySetup", raw: hex(v), detail: {}, text: null };
}

/** Eddystone: first byte is the frame type; URL frames decode to a readable URL. */
export function decodeEddystone(v) {
  if (!v.length) return null;
  const frame = EDDYSTONE_FRAME[v[0]] || "unknown";
  const base = { vendor: "eddystone", protocol: "eddystone", msg: `eddystone_${frame}`, raw: hex(v), detail: { frame }, text: null };
  if (v[0] === 0x10 && v.length >= 3) {            // URL frame: type · tx · scheme · encoded
    let url = EDDYSTONE_SCHEME[v[2]] ?? "";
    for (let i = 3; i < v.length; i++) url += v[i] < EDDYSTONE_TLD.length ? EDDYSTONE_TLD[v[i]] : String.fromCharCode(v[i]);
    return { ...base, detail: { frame, url }, text: FREE(url) };
  }
  if (v[0] === 0x00 && v.length >= 18) {           // UID frame: namespace(10) · instance(6)
    return { ...base, detail: { frame, namespace: hex(v.slice(2, 12)), instance: hex(v.slice(12, 18)) } };
  }
  return base;
}

/**
 * Every proximity-pairing signature in one advertisement. Returns an ARRAY — a single advertisement often
 * carries several (Continuity pairs Nearby Action with Nearby Info), and the grid shows each as its own card.
 */
export function signatures(raw) {
  const s = adSummary(parseAd(raw));
  const out = [];
  const apple = s.mfg[APPLE];
  if (apple) out.push(...decodeContinuity(apple));
  const swift = s.mfg[MICROSOFT];
  if (swift) { const d = decodeSwiftPair(swift); if (d) out.push(d); }
  const samsung = s.mfg[SAMSUNG];
  if (samsung) out.push(decodeSamsung(samsung));
  const fp = s.serviceData[FAST_PAIR];
  if (fp) out.push(decodeFastPair(fp));
  const ed = s.serviceData[EDDYSTONE];
  if (ed) { const d = decodeEddystone(ed); if (d) out.push(d); }
  return out;
}

/** The complete taxonomy, so the grid can show every card with its explanation even when the air is quiet. */
export const CATALOG = [
  { protocol: "continuity", msg: "nearbyAction", vendor: "apple", target: "ios", textKind: "fixed" },
  { protocol: "continuity", msg: "proximityPairing", vendor: "apple", target: "ios", textKind: "none" },
  { protocol: "continuity", msg: "nearbyInfo", vendor: "apple", target: "ios", textKind: "none" },
  { protocol: "continuity", msg: "findMy", vendor: "apple", target: "ios", textKind: "none" },
  { protocol: "fastPair", msg: "fastPairModel", vendor: "google", target: "android", textKind: "db" },
  { protocol: "swiftPair", msg: "swiftPair", vendor: "microsoft", target: "windows", textKind: "free" },
  { protocol: "easySetup", msg: "easySetup", vendor: "samsung", target: "android", textKind: "none" },
  { protocol: "eddystone", msg: "eddystone_url", vendor: "eddystone", target: "any", textKind: "free" },
];
