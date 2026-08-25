// microspec runtime — the pure protocol behind an off-grid RF chat carried over raw 802.11.
//
// The adapter (RTL8852AU, driven no-root by the userspace driver rtl8852au-userspace) injects and sniffs raw
// frames; this module is the
// TRANSPORT-AGNOSTIC layer above that: how a text message becomes a set of small chunks that survive a
// lossy, ACK-less broadcast medium, and how a receiver turns a stream of chunks (out of order, duplicated,
// interleaved between senders) back into whole messages. No DOM, no clock, no crypto, no 802.11 — a chunk's
// bytes are exactly what a carrier (a beacon vendor-IE on wifi, or the loopback mock in a gate) hands across.
//
// Split like hackrf.js: this half is PURE and unit-tested; the carrier that wraps a chunk into a real frame
// + txdesc and the shell/usb.batch that radiates it live elsewhere (they need hardware and cannot be tested
// off-device). The round-trip is the gate, the way blesend.js gates its emitters: what encodeChunk() writes
// must decodeChunk() back to exactly what was intended, or a whole conversation corrupts silently.
//
// Reliability model (v1): broadcast to a room, no MAC ACK. The carrier repeats each chunk N times; the
// receiver DEDUPES on (src,msgId,frag) and REASSEMBLES per (src,msgId). Ordering and delivery are
// best-effort — a message arrives when all its fragments have been heard at least once. See
// docs/research/meshchat.md.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const MAGIC0 = 0x6d, MAGIC1 = 0x63;   // "mc"
export const VERSION = 1;
export const HEADER_LEN = 14;

// A wifi vendor-specific IE carries at most 255 bytes; 3 go to the OUI and 1 to a vendor sub-type, leaving
// 251 for us, of which HEADER_LEN is header. 224 is that budget rounded down with margin for the carrier,
// and it is the ONE place the wire limit lives — fragment() and the tests both read it from here.
export const MAX_CHUNK_PAYLOAD = 224;

// FLAGS bits. `encrypted` says the reassembled blob is an AEAD box (nonce||ciphertext||tag), not UTF-8 text;
// the crypto layer is a separate async step (WebCrypto AES-GCM) that owns that box — this module never sees a key.
export const FLAG_ENCRYPTED = 0x01;

// roomId(name) — a 16-bit label so a receiver can drop other rooms' traffic cheaply BEFORE reassembly. It is
// NOT a secret and NOT collision-proof: two rooms can share an id and are then separated by the AEAD key
// (wrong key -> decrypt fails -> dropped). FNV-1a/16, deterministic, so every peer computes the same id.
export function roomId(name) {
  let h = 0x811c9dc5;
  const b = enc.encode(String(name || ""));
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = (h * 0x01000193) >>> 0; }
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}

// newNodeId() — a per-session 32-bit sender id. `rand` is injectable so a test is deterministic; in the app
// it is crypto.getRandomValues. 0 is reserved (a decode of an all-zero header must read as "no sender"), so
// it is nudged to 1.
export function newNodeId(rand) {
  const r = typeof rand === "function" ? rand() : Math.random();
  const v = Math.floor(r * 0x100000000) >>> 0;
  return v === 0 ? 1 : v;
}

// encodeChunk({room,src,msgId,frag,total,flags,payload}) -> Uint8Array (HEADER_LEN + payload.length).
// Every multi-byte field is little-endian, matching how the wifi carrier reads the wire.
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

// decodeChunk(bytes) -> {room,src,msgId,frag,total,flags,payload} | null. Returns null for anything that is
// not one of ours (wrong magic/version, too short, or a nonsense frag/total) — the carrier feeds EVERY frame
// it hears through here, so a quiet null is the common case, not an error.
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

// fragment(blob, max) -> Uint8Array[] of chunk payloads. An empty blob is still one (empty) fragment, so an
// empty message is a real, delivered message rather than nothing.
export function fragment(blob, max = MAX_CHUNK_PAYLOAD) {
  const b = blob instanceof Uint8Array ? blob : enc.encode(String(blob ?? ""));
  if (b.length === 0) return [new Uint8Array(0)];
  const out = [];
  for (let o = 0; o < b.length; o += max) out.push(b.subarray(o, Math.min(o + max, b.length)));
  if (out.length > 255) throw new Error(`message needs ${out.length} fragments, max 255`);
  return out;
}

// encodeMessage({room,src,msgId,flags,blob}) -> Uint8Array[] ready-to-radiate chunks. `blob` is the opaque
// message body (UTF-8 text, or the AEAD box when flags has FLAG_ENCRYPTED) — this layer does not care which.
export function encodeMessage({ room = 0, src = 0, msgId = 0, flags = 0, blob } = {}) {
  const parts = fragment(blob);
  const total = parts.length;
  return parts.map((payload, frag) => encodeChunk({ room, src, msgId, frag, total, flags, payload }));
}

export const textBytes = (s) => enc.encode(String(s ?? ""));
export const bytesText = (b) => { try { return dec.decode(b); } catch { return ""; } };

// Deduper — a bounded set of (src,msgId,frag) keys. seen(k) marks and returns whether the key was ALREADY
// present, so the carrier's N repeats collapse to one delivered chunk. Bounded because the medium never
// stops: oldest keys evict FIFO past `capacity`.
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

// Reassembler — collects fragments per (src,msgId) until all `total` are present, then returns the whole
// blob once. Handles out-of-order and duplicate fragments; caps the number of partial messages so a flood of
// never-completed ids cannot grow without bound (oldest partial evicts FIFO).
export class Reassembler {
  constructor(maxPartials = 256) { this.maxPartials = maxPartials; this.parts = new Map(); this.order = []; }
  key(src, msgId) { return `${src >>> 0}:${msgId & 0xffff}`; }

  // add(chunk) where chunk is a decodeChunk() result -> { src, msgId, blob, flags } when this fragment
  // completes the message, else null.
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
    if (frag >= rec.total || rec.frags[frag]) return null;   // out of range, or a duplicate fragment
    rec.frags[frag] = payload instanceof Uint8Array ? payload : new Uint8Array(0);
    rec.have++;
    if (rec.have < rec.total) return null;
    this.parts.delete(k);
    const size = rec.frags.reduce((n, f) => n + f.length, 0);
    const blob = new Uint8Array(size);
    let o = 0; for (const f of rec.frags) { blob.set(f, o); o += f.length; }
    return { src, msgId, blob, flags: rec.flags };
  }
}
