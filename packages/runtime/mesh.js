
import { roomId, newNodeId, encodeMessage, decodeChunk, textBytes, bytesText, FLAG_ENCRYPTED, Deduper, Reassembler } from "./meshchat.js";

export function createMeshSession({
  atom, carrier, crypto,
  room = "mesh", passphrase = "",
  self, repeats = 3,
  now = () => Date.now(),
  rand,
} = {}) {
  const $messages = atom([]);      
  const $ready = atom(false);
  const $peers = atom([]);         
  const src = self ?? newNodeId(rand);
  const rid = roomId(room);
  const dedup = new Deduper(), rasm = new Reassembler();
  const peers = new Set();
  let key = null, msgSeq = 0;

  async function connect() {
    key = await crypto.deriveKey(passphrase, room);
    carrier.onFrame(onFrame);
    await carrier.start?.();
    $ready.set(true);
    return true;
  }

  function disconnect() { $ready.set(false); try { carrier.stop?.(); } catch {  } }

  async function send(text) {
    const t = String(text ?? "").trim();
    if (!key || !t) return false;
    const box = await crypto.seal(key, textBytes(t));
    const chunks = encodeMessage({ room: rid, src, msgId: msgSeq++ & 0xffff, flags: FLAG_ENCRYPTED, blob: box });
    for (const c of chunks) for (let r = 0; r < repeats; r++) carrier.send(c);
    push({ src, text: t, ts: now(), mine: true });
    return true;
  }

  async function onFrame(bytes) {
    const d = decodeChunk(bytes);
    if (!d || d.room !== rid || d.src === src) return;
    if (dedup.seen(d.src, d.msgId, d.frag)) return;
    const done = rasm.add(d);
    if (!done) return;
    const pt = (done.flags & FLAG_ENCRYPTED) ? await crypto.open(key, done.blob) : done.blob;
    if (!pt) return;
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
