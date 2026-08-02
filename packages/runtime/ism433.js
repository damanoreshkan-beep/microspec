// microspec runtime — 433.92 MHz ISM OOK device decoder. PURE (no DOM/USB), unit-tested by a synthetic
// round-trip (renderOOK → capture → isolateFrame → decodeOOK recovers the sensor record). Reuses the OOK
// front-end in ook.js: capture() turns HackRF int8 IQ into a signed-µs timing array (+ON/−OFF), isolateFrame()
// picks the modal repeated frame, framesEqual() compares two frames. This module adds bit recovery (PPM/PWM),
// byte packing, a MSB-first CRC-8, and per-protocol matchers, all gated by CRC / fixed-field validity so noise
// and bit corruption never mint a false record.
//
// Protocol facts VERIFIED against github.com/merbanan/rtl_433 (src/devices/{nexus,fineoffset}.c, src/util.c):
//   • Nexus/Sencor (nexus.c): OOK_PULSE_PPM, short 1000 / long 2000, gap_limit 3000, reset_limit 5000, 36 bits.
//   • Fine Offset WH2 (fineoffset.c): OOK_PULSE_PWM, short 500 / long 1500, reset_limit 1200, 48 bits,
//     preamble 0xFF then 5 bytes (bitbuffer_extract_bytes(bb,0,8,b,40)); CRC `b[4] == crc8(&b[0],4,0x31,0)`.
//   • crc8 (util.c): MSB-first, no reflection, init xored in first.

import { isolateFrame, framesEqual } from "./ook.js";

// ---- bit recovery from ook.js signed-µs timings -----------------------------------------------------------
// PPM (Nexus): a fixed ~pulseUs ON pulse, then an OFF gap whose length is the bit — short gap → 0, long gap → 1.
// The isolated frame ends on a terminating pulse, so every data pulse is followed by its gap.
export function ppmBits(timings, { pulseUs = 500, shortGapUs = 1000, longGapUs = 2000, tol = 0.4 } = {}) {
  const bits = [];
  for (let i = 0; i + 1 < timings.length; i++) {
    const p = timings[i], g = timings[i + 1];
    if (p <= 0 || g >= 0) continue;                                   // want an ON pulse followed by an OFF gap
    if (Math.abs(Math.abs(p) - pulseUs) > tol * pulseUs + 60) { continue; }  // stray pulse — skip
    const gap = -g;
    const d0 = Math.abs(gap - shortGapUs), d1 = Math.abs(gap - longGapUs);
    bits.push(d1 < d0 ? 1 : 0);
    i++;                                                              // consume the gap we just read
  }
  return bits;
}

// PWM (WH2): each bit is one ON pulse whose WIDTH is the bit — short pulse → 1, long pulse → 0 (rtl_433
// pulse_slicer_pwm direction). Gaps are fixed spacers and are ignored.
export function pwmBits(timings, { shortUs = 500, longUs = 1500, tol = 0.4 } = {}) {
  const bits = [];
  const mid = (shortUs + longUs) / 2;
  for (const t of timings) {
    if (t <= 0) continue;                                            // only mark (ON) pulses carry bits
    if (t > longUs * (1 + tol) + 60) continue;                       // absurdly long — not a bit
    bits.push(t <= mid ? 1 : 0);
  }
  return bits;
}

// pack a bit array MSB-first into bytes; a trailing partial group is LEFT-aligned (rtl_433 bitbuffer semantics,
// so e.g. Nexus' final 4 bits land in the high nibble of the last byte).
export function bitsToBytes(bits, { msbFirst = true } = {}) {
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    const n = Math.min(8, bits.length - i);
    let byte = 0;
    for (let j = 0; j < n; j++) {
      const bit = bits[i + j] & 1;
      if (msbFirst) byte = (byte << 1) | bit; else byte |= bit << j;
    }
    if (msbFirst && n < 8) byte <<= (8 - n);                         // left-align the partial byte
    out.push(byte & 0xff);
  }
  return out;
}

// find a sync/preamble bit pattern; returns the index of the first DATA bit after it, or −1.
export function findSync(bits, syncBits) {
  outer: for (let i = 0; i + syncBits.length <= bits.length; i++) {
    for (let j = 0; j < syncBits.length; j++) if ((bits[i + j] & 1) !== (syncBits[j] & 1)) continue outer;
    return i + syncBits.length;
  }
  return -1;
}

// ---- integrity: CRC-8, MSB-first, no reflection (rtl_433 util.c crc8) --------------------------------------
export function crc8(bytes, len, poly, init) {
  let crc = init & 0xff;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i] & 0xff;
    for (let b = 0; b < 8; b++) crc = (crc & 0x80) ? ((crc << 1) ^ poly) & 0xff : (crc << 1) & 0xff;
  }
  return crc & 0xff;
}

// ---- human names ------------------------------------------------------------------------------------------
export const PROTO_NAMES = {
  nexus: "Nexus / Sencor sensor",
  wh2: "Fine Offset WH2 sensor",
  remote: "Doorbell / remote",
};

// ---- matchers (CRC / validity-gated) → a record or null ---------------------------------------------------
// Nexus / Sencor thermo-hygrometer: 36 bits → 4.5 bytes. Fixed high nibble b[3]&0xf0 == 0xf0.
export function matchNexus(bytes) {
  if (bytes.length < 5) return null;
  const b = bytes;
  if ((b[3] & 0xf0) !== 0xf0) return null;                           // fixed-nibble guard (nexus.c)
  if ((b[1] & 0x30) === 0x30) return null;                           // impossible channel (nexus.c)
  if ((b[0] === 0 && b[2] === 0 && b[3] === 0) ||
      (b[0] === 0xff && b[2] === 0xff && b[3] === 0xff)) return null; // all-zero / all-one false positive
  const humidity = ((b[3] & 0x0f) << 4) | (b[4] >> 4);
  if (humidity !== 0 && humidity > 100) return null;                 // humidity plausibility
  let temp = ((b[1] & 0x0f) << 8) | b[2];                            // 12-bit, sign-extended
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

// Fine Offset WH2: `bytes` are the 5 payload bytes AFTER the 0xFF preamble (b[0..4]). CRC-gated.
export function matchFineOffsetWH2(bytes) {
  if (bytes.length < 5) return null;
  const b = bytes;
  if (crc8(b, 4, 0x31, 0x00) !== b[4]) return null;                 // CRC-8 poly 0x31 (fineoffset.c)
  const id = ((b[0] & 0x0f) << 4) | ((b[1] & 0xf0) >> 4);
  let temp = ((b[1] & 0x0f) << 8) | b[2];                           // 12-bit sign-magnitude
  if (temp & 0x800) { temp &= 0x7ff; temp = -temp; }
  return {
    kind: "sensor", proto: "wh2", name: PROTO_NAMES.wh2, id,
    fields: { tempC: Math.round(temp) * 0.1, humidity: b[3] },
  };
}

// FNV-1a-ish short hash of a frame's timing shape (for a fixed-code remote's identity).
function frameHash(frame) {
  let h = 2166136261 >>> 0;
  for (const t of frame) {
    h ^= (Math.round(t / 4) & 0xffff);                              // quantise to ~capture resolution
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

// Generic fixed-code remote / doorbell (PT2262/EV1527 class): a frame that repeats IDENTICALLY = it "fired".
export function matchRemote(frameTimings, prevFrameTimings) {
  if (!frameTimings || frameTimings.length < 4) return null;
  if (!prevFrameTimings || !framesEqual(frameTimings, prevFrameTimings, 0.3)) return null; // need a repeat
  return { kind: "remote", proto: "remote", name: PROTO_NAMES.remote, id: frameHash(frameTimings), fired: true };
}

// ---- dispatch: signed-µs timings → array of records ------------------------------------------------------
// The app calls ook.capture(iqBytes, {fs, decim}) first (HackRF fixed-tune @ 2 Msps, capture default decim 8),
// then hands the timing array here. Runs isolateFrame + all matchers.
export function decodeOOK(timings, { ts = Date.now(), rssi = null } = {}) {
  const out = [];
  const iso = isolateFrame(timings, { gapUs: 3000 });
  const frame = iso.frame;
  if (!frame || !frame.length) return out;

  // Nexus (PPM)
  const nb = bitsToBytes(ppmBits(frame, { pulseUs: 500, shortGapUs: 1000, longGapUs: 2000, tol: 0.4 }), { msbFirst: true });
  const rn = matchNexus(nb);
  if (rn) out.push({ ...rn, ts, rssi, bytes: Array.from(nb.slice(0, 5)) });   // raw bytes for the caller's "matrix"

  // Fine Offset WH2 (PWM): recover bits, drop the 0xFF preamble, take the 5 payload bytes.
  const wbits = pwmBits(frame, { shortUs: 500, longUs: 1500, tol: 0.4 });
  const ds = findSync(wbits, [1, 1, 1, 1, 1, 1, 1, 1]);
  if (ds >= 0) {
    const wb = bitsToBytes(wbits.slice(ds, ds + 40), { msbFirst: true });
    const rw = matchFineOffsetWH2(wb);
    if (rw) out.push({ ...rw, ts, rssi, bytes: Array.from(wb.slice(0, 5)) });
  }

  // Fixed-code remote: only if no sensor decoded and the frame repeated identically.
  if (!out.length && iso.repeats >= 2) {
    const groups = splitFrames(timings, 3000).filter((f) => f.length === frame.length);
    if (groups.length >= 2) {
      const rr = matchRemote(groups[0], groups[1]);
      if (rr) out.push({ ...rr, ts, rssi });
    }
  }
  return out;
}

// split a timing stream into frames on long OFF gaps (same rule isolateFrame uses internally).
function splitFrames(timings, gapUs) {
  const frames = []; let cur = [];
  for (const t of timings) { if (t < 0 && -t > gapUs) { if (cur.length) { frames.push(cur); cur = []; } } else cur.push(t); }
  if (cur.length) frames.push(cur);
  return frames;
}
