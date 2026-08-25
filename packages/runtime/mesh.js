// microspec runtime — the off-grid mesh chat SESSION: it turns typed text into encrypted 802.11 chunks over
// an injected CARRIER, and turns heard chunks back into messages. Like usbsession.js, the transport is a
// parameter, not a global: the real carrier (beacon inject + RX parse over the shell usb.batch bridge) needs
// hardware and cannot be tested, so it is injected — and loopbackBus() is the in-memory carrier the gate and
// the integration test run against. Protocol lives in meshchat.js, encryption in meshcrypto.js; this wires
// them to a carrier and to the app's atoms.

import { roomId, newNodeId, encodeMessage, decodeChunk, textBytes, bytesText, FLAG_ENCRYPTED, Deduper, Reassembler } from "./meshchat.js";

// createMeshSession — one room membership.
//
// @param atom       the app's nanostores atom (injected; this module has no test if it imports the bare
//                   specifier — see usbsession.js).
// @param carrier    { send(chunkBytes), onFrame(cb), start?(), stop?() } — the radio, injected.
// @param crypto     { deriveKey(pass,room), seal(key,bytes), open(key,box) } — meshcrypto, injected so a test
//                   can stub the slow KDF.
// @param repeats    how many times the carrier re-sends each chunk (the only reliability the medium has).
export function createMeshSession({
  atom, carrier, crypto,
  room = "mesh", passphrase = "",
  self, repeats = 3,
  now = () => Date.now(),
  rand,
} = {}) {
  const $messages = atom([]);      // [{ id, src, text, ts, mine }]
  const $ready = atom(false);
  const $peers = atom([]);         // node ids we have heard from
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

  function disconnect() { $ready.set(false); try { carrier.stop?.(); } catch { /* */ } }

  async function send(text) {
    const t = String(text ?? "").trim();
    if (!key || !t) return false;
    const box = await crypto.seal(key, textBytes(t));
    const chunks = encodeMessage({ room: rid, src, msgId: msgSeq++ & 0xffff, flags: FLAG_ENCRYPTED, blob: box });
    for (const c of chunks) for (let r = 0; r < repeats; r++) carrier.send(c);
    push({ src, text: t, ts: now(), mine: true });
    return true;
  }

  // Every frame the carrier hears passes here. Foreign frames, other rooms and our own echo fall out quietly;
  // a decode failure (wrong key / tamper) is dropped, never shown. Only a fully reassembled, opened message
  // becomes a line on screen.
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

// loopbackBus() — an in-memory broadcast medium. Every carrier() it hands out delivers a sent chunk to every
// OTHER carrier's listener, asynchronously (a real medium is never synchronous, and the async delivery is
// what makes the gate/test resemble the wire). This is the mock behind isGate||MOCK and the driver of the
// end-to-end unit test; the real carrier replaces it 1:1 without the session knowing.
export function loopbackBus() {
  const listeners = new Set();     // recv functions of live carriers
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
