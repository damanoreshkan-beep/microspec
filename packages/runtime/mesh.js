
import { roomId, newNodeId, encodeMessage, encodeChunk, decodeChunk, textBytes, bytesText, FLAG_ENCRYPTED, FLAG_ACK, encodeAckPayload, decodeAckPayload, Deduper, Reassembler } from "./meshchat.js";

export function createMeshSession({
  atom, carrier, crypto,
  room = "mesh", passphrase = "",
  self, repeats = 1,
  ackTimeoutMs = 1500, maxRounds = 2,
  now = () => Date.now(),
  rand,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const $messages = atom([]);      
  const $ready = atom(false);
  const $peers = atom([]);         
  const src = self ?? newNodeId(rand);
  const rid = roomId(room);
  const dedup = new Deduper(), rasm = new Reassembler();
  const peers = new Set();
  const outbox = new Map();        
  let key = null, msgSeq = 0, ackSeq = 0;

  async function connect() {
    key = await crypto.deriveKey(passphrase, room);
    carrier.onFrame(onFrame);
    await carrier.start?.();
    $ready.set(true);
    return true;
  }

  function disconnect() {
    $ready.set(false);
    for (const e of outbox.values()) if (e.timer != null) clearTimer(e.timer);
    outbox.clear();
    try { carrier.stop?.(); } catch {  }
  }

  function radiate(entry) {
    for (let f = 0; f < entry.total; f++) if (!entry.acked.has(f)) carrier.send(entry.chunks[f]);
  }

  function armRetransmit(msgId) {
    const entry = outbox.get(msgId);
    if (!entry) return;
    entry.timer = setTimer(() => {
      entry.timer = null;
      if (entry.acked.size >= entry.total || entry.round >= maxRounds) { outbox.delete(msgId); return; }
      entry.round++;
      radiate(entry);
      armRetransmit(msgId);
    }, ackTimeoutMs);
  }

  async function send(text) {
    const t = String(text ?? "").trim();
    if (!key || !t) return false;
    const box = await crypto.seal(key, textBytes(t));
    const msgId = msgSeq++ & 0xffff;
    const chunks = encodeMessage({ room: rid, src, msgId, flags: FLAG_ENCRYPTED, blob: box });
    const entry = { chunks, total: chunks.length, acked: new Set(), round: 0, timer: null };
    outbox.set(msgId, entry);
    for (let r = 0; r < repeats; r++) radiate(entry);
    armRetransmit(msgId);
    push({ src, text: t, ts: now(), mine: true });
    return true;
  }

  function sendFullAck(targetSrc, targetMsgId, total) {
    const have = []; for (let f = 0; f < total; f++) have.push(f);
    const payload = encodeAckPayload({ targetSrc, targetMsgId, total, have });
    carrier.send(encodeChunk({ room: rid, src, msgId: ackSeq++ & 0xffff, frag: 0, total: 1, flags: FLAG_ACK, payload }));
  }

  function handleAck(payload) {
    const a = decodeAckPayload(payload);
    if (!a || a.targetSrc !== src) return;                 
    const entry = outbox.get(a.targetMsgId);
    if (!entry) return;
    for (const f of a.have) entry.acked.add(f);
    if (entry.acked.size >= entry.total) { if (entry.timer != null) clearTimer(entry.timer); outbox.delete(a.targetMsgId); }
  }

  async function onFrame(bytes) {
    const d = decodeChunk(bytes);
    if (!d || d.room !== rid || d.src === src) return;
    if (dedup.seen(d.src, d.msgId, d.frag)) return;
    if (d.flags & FLAG_ACK) { handleAck(d.payload); return; }
    const done = rasm.add(d);
    if (!done) return;
    const pt = (done.flags & FLAG_ENCRYPTED) ? await crypto.open(key, done.blob) : done.blob;
    if (!pt) return;
    sendFullAck(done.src, done.msgId, d.total);            
    if (!peers.has(done.src)) { peers.add(done.src); $peers.set([...peers]); }
    push({ src: done.src, text: bytesText(pt), ts: now(), mine: false });
  }

  function push(m) {
    const list = $messages.get();
    $messages.set([...list, { id: `${m.src >>> 0}:${m.ts}:${list.length}`, ...m }]);
  }

  return { $messages, $ready, $peers, src, roomId: rid, connect, disconnect, send, ingest: onFrame };
}

export function loopbackBus() {
  const listeners = new Set();     
  return {
    carrier() {
      let cb = null;
      function recv(bytes) { if (cb) cb(bytes); }
      return {
        onFrame(fn) { cb = fn; listeners.add(recv); },
        send(bytes) { const copy = bytes.slice(); for (const l of listeners) if (l !== recv) queueMicrotask(() => l(copy)); },
        start() {},
        stop() { listeners.delete(recv); cb = null; },
      };
    },
  };
}
