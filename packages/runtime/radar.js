// microspec runtime — what a phone can honestly say about the radio around it.
//
// The whole module exists to refuse three tempting lies, each of which the app above it would otherwise
// invent (see apps/radar/RESEARCH.md for the sources):
//   · RSSI is NOT a distance. A ±10 dB reference-power error at n=2 is a ×3.16 distance error, while
//     doubling the true distance moves RSSI only 6.02 dB — the nuisance is larger than the signal. So
//     strength resolves to a BAND in dBm, and metres are available only behind explicit calibration.
//   · A BLE address is NOT an identity. DULT requires rotation every 15 min near-owner and every 24 h
//     separated, so a track ends at a rotation rather than being stitched across one.
//   · A vendor is NOT a device class. Apple 0x004C also covers phones, watches and earbuds; Fast Pair
//     and Eddystone are headphone/beacon protocols. Classifying on a company ID is a false-positive
//     machine.
//
// Bearing is not here on purpose: it lives in ./df.js, whose circular statistics already refuse to show a
// direction until concentration and coverage earn it.
//
// Pure — no DOM, no clock, no shell. Every time is passed in.

// ── Advertisement parsing ─────────────────────────────────────────────────────────────────────────────
// AD structures are [length][type][value...]; `length` counts the type octet but NOT itself, and a zero
// length terminates. Legacy payloads cap at 31 bytes and extended advertising can fragment, which is why
// a truncated frame must be reported rather than parsed as if it were whole.
// Contract: `hex` is what the shell's ble.scan sends as `raw` (lowercase hex, no separators).
export function parseAd(hex) {
  const out = { structures: [], truncated: false, error: null };
  if (typeof hex !== "string" || !hex.length) return out;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) { out.error = "notHex"; return out; }
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let i = 0;
  while (i < b.length) {
    const len = b[i];
    if (len === 0) break;                       // terminator / padding — the rest is zeros, not data
    // The structure's last byte is at i+len, so it fits only while i+len < length. Off by one here and
    // slice() silently clamps, handing the caller a value one byte short instead of saying "truncated".
    if (i + len >= b.length) { out.truncated = true; break; }
    out.structures.push({ type: b[i + 1], value: b.slice(i + 2, i + 1 + len) });
    i += 1 + len;
  }
  return out;
}

const u16le = (v, o) => v[o] | (v[o + 1] << 8);
const hexOf = (v) => Array.from(v, (x) => x.toString(16).padStart(2, "0")).join("");

// The AD types worth naming. Everything else stays in `structures` — a reduced view cannot classify a
// protocol invented after this file was written, which is why `raw` is the canonical field.
export const AD = {
  flags: 0x01, uuid16Partial: 0x02, uuid16: 0x03, uuid128Partial: 0x06, uuid128: 0x07,
  nameShort: 0x08, name: 0x09, txPower: 0x0a, serviceData16: 0x16, appearance: 0x19, mfg: 0xff,
};

/** A flat, convenient view of one parsed advertisement. */
export function adSummary(parsed) {
  const s = { flags: null, name: null, txPower: null, appearance: null, uuids16: [], serviceData: {}, mfg: {} };
  for (const { type, value } of parsed.structures) {
    if (type === AD.flags && value.length) s.flags = value[0];
    else if ((type === AD.name || type === AD.nameShort) && value.length) {
      try { s.name = new TextDecoder().decode(value); } catch { /* not UTF-8; the label is optional */ }
    } else if (type === AD.txPower && value.length) s.txPower = (value[0] << 24) >> 24;   // signed int8
    else if (type === AD.appearance && value.length >= 2) s.appearance = u16le(value, 0);
    else if ((type === AD.uuid16 || type === AD.uuid16Partial)) {
      for (let o = 0; o + 1 < value.length; o += 2) s.uuids16.push(u16le(value, o));
    } else if (type === AD.serviceData16 && value.length >= 2) {
      s.serviceData[u16le(value, 0)] = value.slice(2);
    } else if (type === AD.mfg && value.length >= 2) {
      s.mfg[u16le(value, 0)] = value.slice(2);
    }
  }
  return s;
}

// ── Address kind ──────────────────────────────────────────────────────────────────────────────────────
// The top two bits of the most significant octet, per Bluetooth Core Vol 6 Part B §1.3.2. Caveat worth
// keeping: Android never hands an app the over-air address TYPE, so this is inferred from bytes — a
// device using a public address is indistinguishable from a random one whose top bits happen to match.
export function addrKind(addr) {
  if (typeof addr !== "string") return "unknown";
  const first = addr.split(":")[0];
  if (!/^[0-9a-fA-F]{2}$/.test(first)) return "unknown";
  switch (parseInt(first, 16) >>> 6) {
    case 0b01: return "resolvable";      // rotates — a tracker protecting its owner's privacy
    case 0b00: return "nonResolvable";
    case 0b11: return "staticRandom";
    default: return "reserved";
  }
}

/** Does this address rotate? The one question the radar's trail logic actually asks. */
export const rotates = (addr) => addrKind(addr) === "resolvable";

// ── Strength ──────────────────────────────────────────────────────────────────────────────────────────
// Bands, never metres. The cut-offs are dBm — a number the radio actually measured — and they are
// deliberately coarse: published stationary BLE traces span 5-15 dB peak-to-peak, so a finer ladder would
// report fading as movement.
export const BANDS = [
  { id: "immediate", floor: -55 },
  { id: "near", floor: -70 },
  { id: "far", floor: -85 },
  { id: "faint", floor: -Infinity },
];

export function band(rssi) {
  if (!Number.isFinite(rssi)) return "unknown";
  return (BANDS.find((b) => rssi >= b.floor) || BANDS[BANDS.length - 1]).id;
}

/** 0..1 across the band ladder — what the dome uses as a radius. Clamped, so an absurd RSSI cannot
 *  place a ring outside the scene. */
export function bandFraction(rssi) {
  if (!Number.isFinite(rssi)) return 1;
  const hi = -40, lo = -100;
  return Math.min(1, Math.max(0, (hi - Math.max(lo, Math.min(hi, rssi))) / (hi - lo)));
}

// Time-based EWMA. A per-sample alpha silently changes meaning when the advertising rate changes, which
// is the trap a constant copied out of a paper walks into: the same 0.25 is a 1.5 s memory at 500 ms
// intervals and a 7.5 s memory at 2.5 s intervals.
export const TAU_MS = 1500;
export function smooth(prev, rssi, dtMs, tauMs = TAU_MS) {
  if (!Number.isFinite(rssi)) return prev;
  if (!Number.isFinite(prev)) return rssi;
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const alpha = 1 - Math.exp(-dt / (tauMs > 0 ? tauMs : TAU_MS));
  return prev + alpha * (rssi - prev);
}

/**
 * Metres — and only when the caller supplies BOTH calibration terms, because there is no defensible
 * default. `A = -59, n = 2` is a beacon profile's calibration, not a Bluetooth constant, and baking it in
 * is how an app starts printing fiction with a decimal point. Returns null rather than guessing.
 */
export function estimateDistance({ rssi, referenceRssi, pathLossExponent } = {}) {
  if (![rssi, referenceRssi, pathLossExponent].every(Number.isFinite)) return null;
  if (pathLossExponent <= 0) return null;
  return 10 ** ((referenceRssi - rssi) / (10 * pathLossExponent));
}

// ── Classification ────────────────────────────────────────────────────────────────────────────────────
// Registry values checked against the Bluetooth SIG member_uuids.yaml, not from memory. FE2C and FEAA are
// deliberately NOT tracker evidence: Fast Pair is how headphones pair and Eddystone is a generic beacon
// protocol, so treating either as a tracker marker manufactures alerts out of ordinary hardware.
export const COMPANY = { 0x004c: "Apple", 0x0075: "Samsung", 0x00e0: "Google", 0x0006: "Microsoft" };
export const SERVICE = {
  0xfcb2: "dult",        // registered to Apple; the DULT draft adopts it for the location-enabled payload
  0xfeed: "tile",
  0xfd5a: "samsungFind",
  0xfe2c: "fastPair",    // headphones and accessories — NOT a tracker marker
  0xfeaa: "eddystone",   // generic beacons — NOT a tracker marker
};

/**
 * The DULT location-enabled payload, read from the service data for 0xFCB2. Layout from the draft's
 * Table 1: after the 2-byte UUID come the Network ID, then a byte whose LEAST SIGNIFICANT BIT is the
 * near-owner bit, then optional proprietary data.
 *
 * This is the whole reason Guard can be more than a co-motion guess: a conforming accessory ANNOUNCES
 * that it is separated from its owner, which is precisely the state that justifies telling the user.
 */
export function dultState(summary) {
  const v = summary.serviceData[0xfcb2];
  if (!v || v.length < 2) return null;
  return { networkId: v[0], nearOwner: (v[1] & 0x01) === 1, separated: (v[1] & 0x01) === 0 };
}

/**
 * What we can say about one sighting. Returns EVIDENCE, never a verdict: `why` is the list a screen shows
 * so the user can disagree with us.
 */
export function classify(frame = {}) {
  const parsed = parseAd(frame.raw);
  const s = adSummary(parsed);
  const out = {
    vendor: null, protocols: [], tracker: "none", separated: false,
    why: [], rotates: rotates(frame.addr), parsed, summary: s,
    // No payload at all is a different statement from "advertised nothing" — classic discovery and a
    // pre-24 shell both produce it, and neither means the device is uninteresting.
    classifiable: typeof frame.raw === "string" && frame.raw.length > 0,
  };
  for (const id of Object.keys(s.mfg)) {
    const name = COMPANY[Number(id)];
    if (name && !out.vendor) out.vendor = name;
  }
  const seen = new Set([...s.uuids16, ...Object.keys(s.serviceData).map(Number)]);
  for (const u of seen) if (SERVICE[u]) out.protocols.push(SERVICE[u]);

  const dult = dultState(s);
  if (dult) {
    out.separated = dult.separated;
    out.tracker = dult.separated ? "separated" : "nearOwner";
    out.why.push(dult.separated ? "dultSeparated" : "dultNearOwner");
  } else if (out.protocols.includes("tile") || out.protocols.includes("samsungFind")) {
    out.tracker = "possible";
    out.why.push("trackerProtocol");
  }
  return out;
}

// ── Guard ─────────────────────────────────────────────────────────────────────────────────────────────
// THESE THRESHOLDS ARE OURS. The DULT draft's §6 "Platform Support for Unwanted Tracking" — the section
// that would carry detector requirements — reads "TODO", and neither Apple nor Google publish theirs. So
// nothing here may be presented as standards compliance, and the copy says so.
//
// The 30-minute figure in the draft is an ACCESSORY state transition, not an alert threshold; it is
// deliberately not reused as one.
export const GUARD = {
  minSightings: 5,          // one sighting is a passer-by
  minSpanMs: 20 * 60_000,   // seen across at least this much wall time
  minDisplacementM: 500,    // real travel, not GPS jitter — an accuracy radius is typically 5-30 m
  minSegments: 2,           // moving, then stopped, then moving again: a convoy passenger fails this
};

/** Great-circle metres. Guard's displacement test is the difference between "followed me" and "we were
 *  both standing still", so it has to be a real distance rather than a degree delta. */
export function haversine(a, b) {
  if (!a || !b) return 0;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const la1 = a.lat * rad, la2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Score one candidate. `track` is { sightings: [{at, rssi, fix?}], separated, classifiable }.
 *
 * Every criterion must pass — a confidence that can be reached by one strong signal alone is how a
 * fellow passenger becomes a stalker. `reasons` names what is still missing, so the screen can show why
 * it is NOT alerting rather than staying mysteriously quiet.
 */
export function guardScore(track = {}, policy = GUARD) {
  const s = Array.isArray(track.sightings) ? track.sightings : [];
  const reasons = [];
  const span = s.length ? s[s.length - 1].at - s[0].at : 0;
  const fixes = s.map((x) => x.fix).filter(Boolean);
  let displacement = 0;
  for (const f of fixes) for (const g of fixes) displacement = Math.max(displacement, haversine(f, g));
  // A "segment" is a gap in sighting — the device left and came back. Continuous presence in one place is
  // a neighbour's doorbell; disappearing and reappearing along a journey is what following looks like.
  let segments = 1;
  for (let i = 1; i < s.length; i++) if (s[i].at - s[i - 1].at > 5 * 60_000) segments++;

  if (!track.classifiable) reasons.push("noPayload");
  if (s.length < policy.minSightings) reasons.push("tooFewSightings");
  if (span < policy.minSpanMs) reasons.push("tooBrief");
  if (displacement < policy.minDisplacementM) reasons.push("noDisplacement");
  if (segments < policy.minSegments) reasons.push("oneSegment");
  if (!track.separated) reasons.push("notSeparated");

  const met = 6 - reasons.length;
  return { confidence: Math.max(0, met / 6), meets: reasons.length === 0, reasons, span, displacement, segments };
}
