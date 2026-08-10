
export function parseAd(hex) {
  const out = { structures: [], truncated: false, error: null };
  if (typeof hex !== "string" || !hex.length) return out;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) { out.error = "notHex"; return out; }
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let i = 0;
  while (i < b.length) {
    const len = b[i];
    if (len === 0) break;                       
    if (i + len >= b.length) { out.truncated = true; break; }
    out.structures.push({ type: b[i + 1], value: b.slice(i + 2, i + 1 + len) });
    i += 1 + len;
  }
  return out;
}

const u16le = (v, o) => v[o] | (v[o + 1] << 8);
const hexOf = (v) => Array.from(v, (x) => x.toString(16).padStart(2, "0")).join("");

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
      try { s.name = new TextDecoder().decode(value); } catch {  }
    } else if (type === AD.txPower && value.length) s.txPower = (value[0] << 24) >> 24;   
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

export function addrKind(addr) {
  if (typeof addr !== "string") return "unknown";
  const first = addr.split(":")[0];
  if (!/^[0-9a-fA-F]{2}$/.test(first)) return "unknown";
  switch (parseInt(first, 16) >>> 6) {
    case 0b01: return "resolvable";      
    case 0b00: return "nonResolvable";
    case 0b11: return "staticRandom";
    default: return "reserved";
  }
}

/** Does this address rotate? The one question the radar's trail logic actually asks. */
export const rotates = (addr) => addrKind(addr) === "resolvable";

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

/** 0..1 across the band ladder, clamped. Kept as runtime API for any view that wants a radius rather
 *  than a percentage; the hive itself uses signalPercent. */
export function bandFraction(rssi) {
  if (!Number.isFinite(rssi)) return 1;
  const hi = -40, lo = -100;
  return Math.min(1, Math.max(0, (hi - Math.max(lo, Math.min(hi, rssi))) / (hi - lo)));
}

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

export const COMPANY = { 0x004c: "Apple", 0x0075: "Samsung", 0x00e0: "Google", 0x0006: "Microsoft" };
export const SERVICE = {
  0xfcb2: "dult",        
  0xfeed: "tile",
  0xfd5a: "samsungFind",
  0xfe2c: "fastPair",    
  0xfeaa: "eddystone",   
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

export const GUARD = {
  minSightings: 5,          
  minSpanMs: 20 * 60_000,   
  minDisplacementM: 500,    
  minSegments: 2,           
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

export const SCALE = {
  ble: { floor: -100, ceil: -45 },
  wifi: { floor: -90, ceil: -35 },
  lte: { floor: -120, ceil: -70 },
};

export function signalPercent(rssi, kind = "ble") {
  const s = SCALE[kind] || SCALE.ble;
  if (!Number.isFinite(rssi)) return 0;
  const clamped = Math.max(s.floor, Math.min(s.ceil, rssi));
  return Math.round(((clamped - s.floor) / (s.ceil - s.floor)) * 100);
}

export const SORTS = ["seen", "signal", "kind"];
const KIND_ORDER = { ble: 0, wifi: 1, lte: 2 };
const bandRank = (d) => BANDS.findIndex((b) => (d.smooth ?? d.rssi) >= b.floor);

export function orderDevices(list, sort = "seen") {
  const byFirst = (a, b) => (a.first || 0) - (b.first || 0) || String(a.addr).localeCompare(String(b.addr));
  const arr = [...list];
  if (sort === "signal") return arr.sort((a, b) => bandRank(a) - bandRank(b) || byFirst(a, b));
  if (sort === "kind") {
    return arr.sort((a, b) =>
      (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || bandRank(a) - bandRank(b) || byFirst(a, b));
  }
  return arr.sort(byFirst);                     
}

const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexSpiral(n) {
  const out = [];
  if (n <= 0) return out;
  out.push({ q: 0, r: 0 });
  for (let ring = 1; out.length < n; ring++) {
    let q = -ring, r = ring;                                   
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < ring && out.length < n; step++) {
        out.push({ q, r });
        q += HEX_DIRS[side][0]; r += HEX_DIRS[side][1];
      }
    }
  }
  return out;
}

/** Rings from the centre — the honest reading of a cell's position, since only RANK is encoded. */
export const hexDistance = ({ q, r }) => (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;

/** Axial -> world, pointy-top. `size` is the hex circumradius. */
export function hexToXY({ q, r }, size = 1) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

/**
 * How many cells to DRAW for n devices: the next complete hexagonal ring.
 *
 * A spiral truncated mid-ring is lopsided — 8 cells is a full first ring plus one lone neighbour poking
 * into the second, and it reads as a rendering accident rather than a hive. Rounding up to 1, 7, 19, 37…
 * always yields a balanced hexagon; the surplus cells draw as empty comb, which is also the honest
 * picture of a field that has room in it.
 */
export function combSize(n) {
  let ring = 0;
  while (1 + 3 * ring * (ring + 1) < Math.max(0, n)) ring++;
  return 1 + 3 * ring * (ring + 1);
}

/**
 * Continuous rotation for a display that ANIMATES its angle: the next reading expressed as the nearest
 * full-circle equivalent of the previous one, so a CSS transition on rotate() takes the short arc —
 * 359° → 1° becomes +2°, never a −358° spin through the whole dial. The returned value is unbounded by
 * design; feed it back in as `prev` on the next reading.
 */
export function unwrapDeg(prev, next) {
  const d = (((next - prev) % 360) + 360) % 360;      
  return prev + (d > 180 ? d - 360 : d);              
}

/**
 * Hot/cold while walking toward a target: the median RSSI of the last `recentMs` against the median of
 * the window before it. Returns "up" (closer), "down" (farther) or null — and null is the honest default:
 * a stationary BLE trace wanders 5–15 dB on its own (apps/hive/RESEARCH.md §B), so anything under `minDb`
 * is noise, not movement, and too few samples in either window is no evidence at all. Medians, not means,
 * because a single body-shadow dropout would otherwise flip the verdict.
 */
export function sightTrend(sightings, now = Date.now(), { recentMs = 4000, priorMs = 16000, minDb = 6, minEach = 3 } = {}) {
  if (!Array.isArray(sightings)) return null;
  const rec = [], pri = [];
  for (const s of sightings) {
    if (!s || !Number.isFinite(s.rssi) || !Number.isFinite(s.at)) continue;
    const age = now - s.at;
    if (age < 0) continue;
    if (age <= recentMs) rec.push(s.rssi);
    else if (age <= priorMs) pri.push(s.rssi);
  }
  if (rec.length < minEach || pri.length < minEach) return null;
  const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const d = median(rec) - median(pri);
  return d >= minDb ? "up" : d <= -minDb ? "down" : null;
}
