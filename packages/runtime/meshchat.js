
const enc = new TextEncoder();
const dec = new TextDecoder();

export const MAGIC0 = 0x6d, MAGIC1 = 0x63;   
export const VERSION = 1;
export const HEADER_LEN = 14;

export const MAX_CHUNK_PAYLOAD = 224;

export const FLAG_ENCRYPTED = 0x01;
export const FLAG_ACK = 0x02;

export function roomId(name) {
  let h = 0x811c9dc5;
  const b = enc.encode(String(name || ""));
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = (h * 0x01000193) >>> 0; }
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}

export function newNodeId(rand) {
  const r = typeof rand === "function" ? rand() : Math.random();
  const v = Math.floor(r * 0x100000000) >>> 0;
  return v === 0 ? 1 : v;
}

export function encodeChunk({ room = 0, src = 0, msgId = 0, frag = 0, total = 1, flags = 0, payload } = {}) {
  const p = payload instanceof Uint8Array ? payload : new Uint8Array(0);
  if (p.length > MAX_CHUNK_PAYLOAD) throw new Error(`chunk payload ${p.length} > ${MAX_CHUNK_PAYLOAD}`);
  if (total < 1 || total > 255 || frag < 0 || frag >= total) throw new Error(`bad frag ${frag}/${total}`);
  const out = new Uint8Array(HEADER_LEN + p.length);
  out[0] = MAGIC0; out[1] = MAGIC1; out[2] = VERSION; out[3] = flags & 0xff;
  out[4] = room & 0xff; out[5] = (room >>> 8) & 0xff;
  out[6] = src & 0xff; out[7] = (src >>> 8) & 0xff; out[8] = (src >>> 16) & 0xff; out[9] = (src >>> 24) & 0xff;
  out[10] = msgId & 0xff; out[11] = (msgId >>> 8) & 0xff;
  out[12] = frag & 0xff; out[13] = total & 0xff;
  out.set(p, HEADER_LEN);
  return out;
}

export function decodeChunk(b) {
  if (!b || b.length < HEADER_LEN) return null;
  if (b[0] !== MAGIC0 || b[1] !== MAGIC1 || b[2] !== VERSION) return null;
  const total = b[13], frag = b[12];
  if (total < 1 || frag >= total) return null;
  return {
    flags: b[3],
    room: b[4] | (b[5] << 8),
    src: (b[6] | (b[7] << 8) | (b[8] << 16) | (b[9] << 24)) >>> 0,
    msgId: b[10] | (b[11] << 8),
    frag, total,
    payload: b.subarray(HEADER_LEN),
  };
}

export function fragment(blob, max = MAX_CHUNK_PAYLOAD) {
  const b = blob instanceof Uint8Array ? blob : enc.encode(String(blob ?? ""));
  if (b.length === 0) return [new Uint8Array(0)];
  const out = [];
  for (let o = 0; o < b.length; o += max) out.push(b.subarray(o, Math.min(o + max, b.length)));
  if (out.length > 255) throw new Error(`message needs ${out.length} fragments, max 255`);
  return out;
}

export function encodeMessage({ room = 0, src = 0, msgId = 0, flags = 0, blob } = {}) {
  const parts = fragment(blob);
  const total = parts.length;
  return parts.map((payload, frag) => encodeChunk({ room, src, msgId, frag, total, flags, payload }));
}

export const textBytes = (s) => enc.encode(String(s ?? ""));
export const bytesText = (b) => { try { return dec.decode(b); } catch { return ""; } };

export function encodeAckPayload({ targetSrc = 0, targetMsgId = 0, total = 1, have = [] } = {}) {
  const nb = Math.ceil(total / 8);
  const out = new Uint8Array(7 + nb);
  out[0] = targetSrc & 0xff; out[1] = (targetSrc >>> 8) & 0xff; out[2] = (targetSrc >>> 16) & 0xff; out[3] = (targetSrc >>> 24) & 0xff;
  out[4] = targetMsgId & 0xff; out[5] = (targetMsgId >>> 8) & 0xff;
  out[6] = total & 0xff;
  for (const f of have) if (f >= 0 && f < total) out[7 + (f >> 3)] |= 1 << (f & 7);
  return out;
}

export function decodeAckPayload(b) {
  if (!b || b.length < 7) return null;
  const total = b[6];
  if (total < 1) return null;
  const nb = Math.ceil(total / 8);
  if (b.length < 7 + nb) return null;
  const have = new Set();
  for (let f = 0; f < total; f++) if (b[7 + (f >> 3)] & (1 << (f & 7))) have.add(f);
  return {
    targetSrc: (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0,
    targetMsgId: b[4] | (b[5] << 8),
    total,
    have,
  };
}

export class Deduper {
  constructor(capacity = 1024) { this.capacity = capacity; this.set = new Set(); this.order = []; }
  key(src, msgId, frag) { return `${src >>> 0}:${msgId & 0xffff}:${frag & 0xff}`; }
  seen(src, msgId, frag) {
    const k = this.key(src, msgId, frag);
    if (this.set.has(k)) return true;
    this.set.add(k); this.order.push(k);
    if (this.order.length > this.capacity) { const old = this.order.shift(); this.set.delete(old); }
    return false;
  }
}

export class Reassembler {
  constructor(maxPartials = 256) { this.maxPartials = maxPartials; this.parts = new Map(); this.order = []; }
  key(src, msgId) { return `${src >>> 0}:${msgId & 0xffff}`; }

  add(chunk) {
    if (!chunk) return null;
    const { src, msgId, frag, total, flags, payload } = chunk;
    const k = this.key(src, msgId);
    let rec = this.parts.get(k);
    if (!rec) {
      rec = { total, flags, frags: new Array(total), have: 0 };
      this.parts.set(k, rec); this.order.push(k);
      if (this.order.length > this.maxPartials) { const old = this.order.shift(); this.parts.delete(old); }
    }
    if (frag >= rec.total || rec.frags[frag]) return null;   
    rec.frags[frag] = payload instanceof Uint8Array ? payload : new Uint8Array(0);
    rec.have++;
    if (rec.have < rec.total) return null;
    this.parts.delete(k);
    const size = rec.frags.reduce((n, f) => n + f.length, 0);
    const blob = new Uint8Array(size);
    let o = 0; for (const f of rec.frags) { blob.set(f, o); o += f.length; }
    return { src, msgId, blob, flags: rec.flags };
  }

  progress(src, msgId) {
    const rec = this.parts.get(this.key(src, msgId));
    if (!rec) return null;
    const have = [];
    for (let i = 0; i < rec.total; i++) if (rec.frags[i]) have.push(i);
    return { total: rec.total, have };
  }
}
