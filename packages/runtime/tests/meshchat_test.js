// microspec runtime — meshchat protocol unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals, assert, assertThrows } from "jsr:@std/assert@1";
import {
  MAGIC0, MAGIC1, VERSION, HEADER_LEN, MAX_CHUNK_PAYLOAD, FLAG_ENCRYPTED,
  roomId, newNodeId, encodeChunk, decodeChunk, fragment, encodeMessage,
  textBytes, bytesText, Deduper, Reassembler,
} from "../meshchat.js";

const bytes = (...n) => new Uint8Array(n);

// ================= chunk codec (meshchat.js) =================

Deno.test("encodeChunk -> decodeChunk round-trips every field", () => {
  const payload = bytes(1, 2, 3, 4, 5);
  const c = encodeChunk({ room: 0xbeef, src: 0x11223344, msgId: 0x0102, frag: 2, total: 5, flags: FLAG_ENCRYPTED, payload });
  assertEquals([c[0], c[1], c[2]], [MAGIC0, MAGIC1, VERSION]);
  assertEquals(c.length, HEADER_LEN + payload.length);
  const d = decodeChunk(c);
  assertEquals(d.room, 0xbeef);
  assertEquals(d.src, 0x11223344);
  assertEquals(d.msgId, 0x0102);
  assertEquals([d.frag, d.total], [2, 5]);
  assertEquals(d.flags, FLAG_ENCRYPTED);
  assertEquals([...d.payload], [...payload]);
});

Deno.test("decodeChunk rejects foreign / malformed bytes as null", () => {
  assertEquals(decodeChunk(null), null);
  assertEquals(decodeChunk(bytes(1, 2, 3)), null);                      // too short
  assertEquals(decodeChunk(bytes(0x00, 0x63, 1, 0, 0,0, 0,0,0,0, 0,0, 0, 1)), null); // bad magic0
  assertEquals(decodeChunk(bytes(MAGIC0, MAGIC1, 2, 0, 0,0, 0,0,0,0, 0,0, 0, 1)), null); // wrong version
  // frag >= total is nonsense
  const bad = encodeChunk({ frag: 0, total: 1, payload: bytes(9) }); bad[12] = 3; bad[13] = 2;
  assertEquals(decodeChunk(bad), null);
});

Deno.test("encodeChunk guards payload size and frag/total", () => {
  assertThrows(() => encodeChunk({ payload: new Uint8Array(MAX_CHUNK_PAYLOAD + 1) }));
  assertThrows(() => encodeChunk({ frag: 2, total: 2, payload: bytes(1) }));   // frag out of range
  assertThrows(() => encodeChunk({ frag: 0, total: 0, payload: bytes(1) }));   // total < 1
});

Deno.test("roomId is deterministic and fits 16 bits", () => {
  assertEquals(roomId("привіт-кімната"), roomId("привіт-кімната"));
  assert(roomId("a") !== roomId("b"));
  for (const n of ["", "room", "another one", "🔥"]) { const id = roomId(n); assert(id >= 0 && id <= 0xffff); }
});

Deno.test("newNodeId is 32-bit, never 0, deterministic under injected rand", () => {
  assertEquals(newNodeId(() => 0), 1);                                  // 0 is nudged to 1
  const v = newNodeId(() => 0.5);
  assert(v > 0 && v <= 0xffffffff);
  assertEquals(newNodeId(() => 0.5), v);
});

// ================= fragmentation + reassembly =================

Deno.test("fragment splits on the payload budget; empty -> one empty fragment", () => {
  assertEquals(fragment(new Uint8Array(0)).length, 1);
  assertEquals(fragment(new Uint8Array(0))[0].length, 0);
  const exact = new Uint8Array(MAX_CHUNK_PAYLOAD * 2);
  assertEquals(fragment(exact).length, 2);
  const odd = new Uint8Array(MAX_CHUNK_PAYLOAD * 2 + 7);
  const parts = fragment(odd);
  assertEquals(parts.length, 3);
  assertEquals(parts.reduce((n, p) => n + p.length, 0), odd.length);   // nothing lost
});

Deno.test("encodeMessage tags frag/total and reassembles to the exact blob (out of order)", () => {
  const blob = textBytes("а".repeat(300) + " кінець");                 // multi-byte, > one chunk
  const chunks = encodeMessage({ room: 7, src: 0xabc, msgId: 42, blob });
  assert(chunks.length > 1);
  const total = chunks.length;
  chunks.forEach((c, i) => { const d = decodeChunk(c); assertEquals(d.total, total); assertEquals(d.frag, i); });

  const ra = new Reassembler();
  const order = [...chunks.keys()].reverse();                          // deliver reversed
  let done = null;
  for (const i of order) done = ra.add(decodeChunk(chunks[i])) || done;
  assert(done);
  assertEquals(done.src, 0xabc); assertEquals(done.msgId, 42);
  assertEquals(bytesText(done.blob), bytesText(blob));
});

Deno.test("Reassembler: null until complete, ignores duplicate fragments, separates senders", () => {
  const mk = (src, msgId, blob) => encodeMessage({ src, msgId, blob }).map(decodeChunk);
  const A = mk(1, 5, textBytes("x".repeat(MAX_CHUNK_PAYLOAD + 10)));   // 2 frags
  const B = mk(2, 5, textBytes("y".repeat(MAX_CHUNK_PAYLOAD + 10)));   // same msgId, other sender
  assertEquals(A.length, 2);
  const ra = new Reassembler();
  assertEquals(ra.add(A[0]), null);                                    // incomplete
  assertEquals(ra.add(A[0]), null);                                    // duplicate frag -> still incomplete
  assertEquals(ra.add(B[0]), null);                                    // different sender, independent
  const finA = ra.add(A[1]); assert(finA); assertEquals(finA.src, 1);
  const finB = ra.add(B[1]); assert(finB); assertEquals(finB.src, 2);
  assert(bytesText(finA.blob).startsWith("x"));
  assert(bytesText(finB.blob).startsWith("y"));
});

Deno.test("Reassembler completes an empty (single empty fragment) message", () => {
  const [c] = encodeMessage({ src: 9, msgId: 1, blob: new Uint8Array(0) });
  const fin = new Reassembler().add(decodeChunk(c));
  assert(fin); assertEquals(fin.blob.length, 0);
});

// ================= dedup =================

Deno.test("Deduper collapses the carrier's repeats and evicts oldest past capacity", () => {
  const d = new Deduper(3);
  assertEquals(d.seen(1, 1, 0), false);
  assertEquals(d.seen(1, 1, 0), true);                                 // repeat
  d.seen(1, 1, 1); d.seen(1, 1, 2);                                    // now 3 keys held (1:1:0/1/2)
  d.seen(1, 1, 3);                                                     // evicts the oldest (1:1:0)
  assertEquals(d.seen(1, 1, 0), false);                                // seen again as new
});

// ================= end-to-end: repeated, shuffled, deduped, reassembled =================

Deno.test("full path: N-repeat + shuffle + dedup + reassemble == original message", () => {
  const msg = "тест off-grid чату: " + "🔥".repeat(40) + " " + "z".repeat(500);
  const src = newNodeId(() => 0.123), room = roomId("mesh");
  const chunks = encodeMessage({ room, src, msgId: 77, blob: textBytes(msg) });

  // the carrier repeats each chunk 3x; they arrive interleaved and shuffled
  const wire = [];
  for (let r = 0; r < 3; r++) for (const c of chunks) wire.push(c);
  for (let i = wire.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [wire[i], wire[j]] = [wire[j], wire[i]]; }

  const dedup = new Deduper(), ra = new Reassembler();
  let out = null;
  for (const c of wire) {
    const d = decodeChunk(c);
    if (!d || d.room !== room) continue;
    if (dedup.seen(d.src, d.msgId, d.frag)) continue;
    out = ra.add(d) || out;
  }
  assert(out);
  assertEquals(bytesText(out.blob), msg);
});
