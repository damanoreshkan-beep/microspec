// microspec runtime — the off-grid mesh chat SESSION: it turns typed text into encrypted 802.11 chunks over
// an injected CARRIER, and turns heard chunks back into messages. Like usbsession.js, the transport is a
// parameter, not a global: the real carrier (beacon inject + RX parse over the shell usb.batch bridge) needs
// hardware and cannot be tested, so it is injected — and loopbackBus() is the in-memory carrier the gate and
// the integration test run against. Protocol lives in meshchat.js, encryption in meshcrypto.js; this wires
// them to a carrier and to the app's atoms.

import { roomId, newNodeId, encodeMessage, encodeChunk, decodeChunk, textBytes, bytesText, FLAG_ENCRYPTED, FLAG_ACK, encodeAckPayload, decodeAckPayload, Deduper, Reassembler } from "./meshchat.js";

// createMeshSession — one room membership.
//
// @param atom       the app's nanostores atom (injected; this module has no test if it imports the bare
//                   specifier — see usbsession.js).
// @param carrier    { send(chunkBytes), onFrame(cb), start?(), stop?() } — the radio, injected.
// @param crypto     { deriveKey(pass,room), seal(key,bytes), open(key,box) } — meshcrypto, injected so a test
//                   can stub the slow KDF.
// @param repeats    initial blind sends per fragment before the ack loop takes over (default 1 — the ack does the
//                   reliability now; leave >1 only for a very lossy channel).
// @param ackTimeoutMs / maxRounds   the ACK-driven retransmit backoff: if a message is not confirmed within
//                   ackTimeoutMs, resend the unconfirmed fragments, up to maxRounds times, then give up. With a
//                   confirming peer this collapses to one pass + one ack; with none it degrades to (1+maxRounds)
//                   bounded repeats — the old blind-3× behaviour at the defaults.
export function createMeshSession({
  atom, carrier, crypto,
  room = "mesh", passphrase = "",
  self, repeats = 1,
  ackTimeoutMs = 1500, maxRounds = 2,
  now = () => Date.now(),
  rand,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const $messages = atom([]);      // [{ id, src, text, ts, mine }]
  const $ready = atom(false);
  const $peers = atom([]);         // node ids we have heard from
  const src = self ?? newNodeId(rand);
  const rid = roomId(room);
  const dedup = new Deduper(), rasm = new Reassembler();
  const peers = new Set();
  const outbox = new Map();        // msgId -> { chunks, total, acked:Set<frag>, round, timer } awaiting confirmation
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
    try { carrier.stop?.(); } catch { /* */ }
  }

  // Radiate the fragments of a message that no peer has confirmed yet (all of them on the first pass).
  function radiate(entry) {
    for (let f = 0; f < entry.total; f++) if (!entry.acked.has(f)) carrier.send(entry.chunks[f]);
  }

  // The mesh has no MAC ACK, so the SESSION owns redundancy: after the initial send, resend the unconfirmed
  // fragments on an ackTimeoutMs backoff until a FLAG_ACK confirms receipt or maxRounds is spent. One confirmed
  // ack ends the retransmit — that is the airtime win over a blind fixed-N burst.
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

  // A member that has just DECRYPTED a whole message confirms it to the sender with a FULL ack. Only a successful
  // decrypt sends one, so a wrong-key / foreign node cannot forge delivery — which is exactly why a per-fragment
  // (partial) ack, sent before decryption is possible, is deferred until it can be authenticated.
  function sendFullAck(targetSrc, targetMsgId, total) {
    const have = []; for (let f = 0; f < total; f++) have.push(f);
    const payload = encodeAckPayload({ targetSrc, targetMsgId, total, have });
    carrier.send(encodeChunk({ room: rid, src, msgId: ackSeq++ & 0xffff, frag: 0, total: 1, flags: FLAG_ACK, payload }));
  }

  function handleAck(payload) {
    const a = decodeAckPayload(payload);
    if (!a || a.targetSrc !== src) return;                 // not an ack for a message of ours
    const entry = outbox.get(a.targetMsgId);
    if (!entry) return;
    for (const f of a.have) entry.acked.add(f);
    if (entry.acked.size >= entry.total) { if (entry.timer != null) clearTimer(entry.timer); outbox.delete(a.targetMsgId); }
  }

  // Every frame the carrier hears passes here. Foreign frames, other rooms and our own echo fall out quietly; an
  // ack updates our outbox and stops there; a decode failure (wrong key / tamper) is dropped, never shown. Only a
  // fully reassembled, opened message becomes a line on screen — and, being proof of membership, sends the ack.
  async function onFrame(bytes) {
    const d = decodeChunk(bytes);
    if (!d || d.room !== rid || d.src === src) return;
    if (dedup.seen(d.src, d.msgId, d.frag)) return;
    if (d.flags & FLAG_ACK) { handleAck(d.payload); return; }
    const done = rasm.add(d);
    if (!done) return;
    const pt = (done.flags & FLAG_ENCRYPTED) ? await crypto.open(key, done.blob) : done.blob;
    if (!pt) return;
    sendFullAck(done.src, done.msgId, d.total);            // membership proven by the decrypt above
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
