
import { parseAd, adSummary } from "./radar.js";

const APPLE = 0x004c, MICROSOFT = 0x0006, SAMSUNG = 0x0075;
const FAST_PAIR = 0xfe2c, EDDYSTONE = 0xfeaa;

const dec = new TextDecoder("utf-8", { fatal: false });
const hex = (v) => Array.from(v, (x) => x.toString(16).padStart(2, "0")).join("");

export const CONTINUITY = {
  0x05: "airdrop", 0x07: "proximityPairing", 0x08: "heySiri", 0x09: "airplayTarget",
  0x0a: "airplaySource", 0x0b: "magicSwitch", 0x0c: "handoff", 0x0d: "tetheringTarget",
  0x0e: "tetheringSource", 0x0f: "nearbyAction", 0x10: "nearbyInfo", 0x12: "findMy",
};

export const NEARBY_ACTION = {
  0x01: "appleTvSetup", 0x04: "mobileBackup", 0x05: "watchSetup", 0x06: "appleTvPair",
  0x07: "internetRelay", 0x08: "wifiPassword", 0x09: "iosSetup", 0x0a: "repair",
  0x0b: "speakerSetup", 0x0c: "applePay", 0x0d: "homeAudioSetup",
};
export const NEARBY_ACTION_POPUP = new Set([0x01, 0x06, 0x08, 0x09, 0x0b, 0x0d]);

export const APPLE_MODELS = {
  0x0220: "airpods1", 0x0f20: "airpods2", 0x1320: "airpods3", 0x0e20: "airpodsPro",
  0x1420: "airpodsPro2", 0x0a20: "airpodsMax", 0x0520: "beatsX", 0x1020: "beatsFlex",
};

export const EDDYSTONE_FRAME = { 0x00: "uid", 0x10: "url", 0x20: "tlm", 0x30: "eid" };
const EDDYSTONE_SCHEME = ["http://www.", "https://www.", "http://", "https://"];
const EDDYSTONE_TLD = [".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
  ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"];

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
    if (payload.length < len) break;               
    out.push(decodeContinuityMsg(type, payload));
    i += 2 + len;
    if (len === 0) break;
  }
  return out;
}

function decodeContinuityMsg(type, p) {
  const msg = CONTINUITY[type] || "unknown";
  const base = { vendor: "apple", protocol: "continuity", msg, type, raw: hex(p), text: null, detail: {} };
  if (type === 0x0f) {                             
    const actionType = p.length >= 2 ? p[1] : null;
    const action = actionType != null ? (NEARBY_ACTION[actionType] || "unknown") : null;
    return {
      ...base,
      detail: { actionType, action, popup: actionType != null && NEARBY_ACTION_POPUP.has(actionType) },
      text: action ? FIXED(`na_${action}`) : null,
    };
  }
  if (type === 0x07) {                             
    const model = p.length >= 3 ? (p[1] << 8) | p[2] : null;   
    return { ...base, detail: { model, modelName: model != null ? (APPLE_MODELS[model] || null) : null } };
  }
  if (type === 0x10) {                             
    const status = p.length ? (p[0] >> 4) & 0x0f : null;
    const activity = p.length ? p[0] & 0x0f : null;
    return { ...base, detail: { status, activity } };
  }
  return base;                                     
}

/** Microsoft Swift Pair: beaconId · subScenario · reservedRSSI(0x80) · Display Name (free-form UTF-8). */
export function decodeSwiftPair(v) {
  if (v.length < 3) return null;
  const sub = v[1];
  const name = v.length > 3 ? dec.decode(v.slice(3)) : "";
  return {
    vendor: "microsoft", protocol: "swiftPair", msg: "swiftPair", raw: hex(v),
    detail: { beaconId: v[0], subScenario: sub, reserved: v[2], name },
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
      text: DB(id),                                
    };
  }
  return {
    vendor: "google", protocol: "fastPair", msg: "fastPairAccount", raw: hex(v),
    detail: { mode: "account" }, text: null,       
  };
}

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
  if (v[0] === 0x10 && v.length >= 3) {            
    let url = EDDYSTONE_SCHEME[v[2]] ?? "";
    for (let i = 3; i < v.length; i++) url += v[i] < EDDYSTONE_TLD.length ? EDDYSTONE_TLD[v[i]] : String.fromCharCode(v[i]);
    return { ...base, detail: { frame, url }, text: FREE(url) };
  }
  if (v[0] === 0x00 && v.length >= 18) {           
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
