
import { isolateFrame, framesEqual } from "./ook.js";

export function ppmBits(timings, { pulseUs = 500, shortGapUs = 1000, longGapUs = 2000, tol = 0.4 } = {}) {
  const bits = [];
  for (let i = 0; i + 1 < timings.length; i++) {
    const p = timings[i], g = timings[i + 1];
    if (p <= 0 || g >= 0) continue;                                   
    if (Math.abs(Math.abs(p) - pulseUs) > tol * pulseUs + 60) { continue; }  
    const gap = -g;
    const d0 = Math.abs(gap - shortGapUs), d1 = Math.abs(gap - longGapUs);
    bits.push(d1 < d0 ? 1 : 0);
    i++;                                                              
  }
  return bits;
}

export function pwmBits(timings, { shortUs = 500, longUs = 1500, tol = 0.4 } = {}) {
  const bits = [];
  const mid = (shortUs + longUs) / 2;
  for (const t of timings) {
    if (t <= 0) continue;                                            
    if (t > longUs * (1 + tol) + 60) continue;                       
    bits.push(t <= mid ? 1 : 0);
  }
  return bits;
}

export function bitsToBytes(bits, { msbFirst = true } = {}) {
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    const n = Math.min(8, bits.length - i);
    let byte = 0;
    for (let j = 0; j < n; j++) {
      const bit = bits[i + j] & 1;
      if (msbFirst) byte = (byte << 1) | bit; else byte |= bit << j;
    }
    if (msbFirst && n < 8) byte <<= (8 - n);                         
    out.push(byte & 0xff);
  }
  return out;
}

export function findSync(bits, syncBits) {
  outer: for (let i = 0; i + syncBits.length <= bits.length; i++) {
    for (let j = 0; j < syncBits.length; j++) if ((bits[i + j] & 1) !== (syncBits[j] & 1)) continue outer;
    return i + syncBits.length;
  }
  return -1;
}

export function crc8(bytes, len, poly, init) {
  let crc = init & 0xff;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i] & 0xff;
    for (let b = 0; b < 8; b++) crc = (crc & 0x80) ? ((crc << 1) ^ poly) & 0xff : (crc << 1) & 0xff;
  }
  return crc & 0xff;
}

export const PROTO_NAMES = {
  nexus: "Nexus / Sencor sensor",
  wh2: "Fine Offset WH2 sensor",
  remote: "Doorbell / remote",
};

export function matchNexus(bytes) {
  if (bytes.length < 5) return null;
  const b = bytes;
  if ((b[3] & 0xf0) !== 0xf0) return null;                           
  if ((b[1] & 0x30) === 0x30) return null;                           
  if ((b[0] === 0 && b[2] === 0 && b[3] === 0) ||
      (b[0] === 0xff && b[2] === 0xff && b[3] === 0xff)) return null; 
  const humidity = ((b[3] & 0x0f) << 4) | (b[4] >> 4);
  if (humidity !== 0 && humidity > 100) return null;                 
  let temp = ((b[1] & 0x0f) << 8) | b[2];                            
  if (temp & 0x800) temp -= 0x1000;
  return {
    kind: "sensor", proto: "nexus", name: PROTO_NAMES.nexus, id: b[0],
    fields: {
      tempC: Math.round(temp) * 0.1,
      humidity,
      channel: ((b[1] & 0x30) >> 4) + 1,
      battery: (b[1] & 0x80) ? 1 : 0,
    },
  };
}

export function matchFineOffsetWH2(bytes) {
  if (bytes.length < 5) return null;
  const b = bytes;
  if (crc8(b, 4, 0x31, 0x00) !== b[4]) return null;                 
  const id = ((b[0] & 0x0f) << 4) | ((b[1] & 0xf0) >> 4);
  let temp = ((b[1] & 0x0f) << 8) | b[2];                           
  if (temp & 0x800) { temp &= 0x7ff; temp = -temp; }
  return {
    kind: "sensor", proto: "wh2", name: PROTO_NAMES.wh2, id,
    fields: { tempC: Math.round(temp) * 0.1, humidity: b[3] },
  };
}

function frameHash(frame) {
  let h = 2166136261 >>> 0;
  for (const t of frame) {
    h ^= (Math.round(t / 4) & 0xffff);                              
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

export function matchRemote(frameTimings, prevFrameTimings) {
  if (!frameTimings || frameTimings.length < 4) return null;
  if (!prevFrameTimings || !framesEqual(frameTimings, prevFrameTimings, 0.3)) return null; 
  return { kind: "remote", proto: "remote", name: PROTO_NAMES.remote, id: frameHash(frameTimings), fired: true };
}

export function decodeOOK(timings, { ts = Date.now(), rssi = null } = {}) {
  const out = [];
  const iso = isolateFrame(timings, { gapUs: 3000 });
  const frame = iso.frame;
  if (!frame || !frame.length) return out;

  const nb = bitsToBytes(ppmBits(frame, { pulseUs: 500, shortGapUs: 1000, longGapUs: 2000, tol: 0.4 }), { msbFirst: true });
  const rn = matchNexus(nb);
  if (rn) out.push({ ...rn, ts, rssi, bytes: Array.from(nb.slice(0, 5)) });   

  const wbits = pwmBits(frame, { shortUs: 500, longUs: 1500, tol: 0.4 });
  const ds = findSync(wbits, [1, 1, 1, 1, 1, 1, 1, 1]);
  if (ds >= 0) {
    const wb = bitsToBytes(wbits.slice(ds, ds + 40), { msbFirst: true });
    const rw = matchFineOffsetWH2(wb);
    if (rw) out.push({ ...rw, ts, rssi, bytes: Array.from(wb.slice(0, 5)) });
  }

  if (!out.length && iso.repeats >= 2) {
    const groups = splitFrames(timings, 3000).filter((f) => f.length === frame.length);
    if (groups.length >= 2) {
      const rr = matchRemote(groups[0], groups[1]);
      if (rr) out.push({ ...rr, ts, rssi });
    }
  }
  return out;
}

function splitFrames(timings, gapUs) {
  const frames = []; let cur = [];
  for (const t of timings) { if (t < 0 && -t > gapUs) { if (cur.length) { frames.push(cur); cur = []; } } else cur.push(t); }
  if (cur.length) frames.push(cur);
  return frames;
}
