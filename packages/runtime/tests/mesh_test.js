// microspec runtime — mesh SESSION end-to-end tests. Real meshcrypto (WebCrypto runs in Deno), a loopback
// bus for the carrier, a minimal atom. Proves the whole off-grid stack — encrypt, fragment, radiate, dedup,
// reassemble, decrypt — with no hardware.
//   deno test -A packages/runtime/runtime_test.js

import { assertEquals, assert } from "jsr:@std/assert@1";
import { createMeshSession, loopbackBus } from "../mesh.js";
import * as crypto from "../meshcrypto.js";

const atom = (v) => { let val = v; return { get: () => val, set: (x) => (val = x) }; };
const flush = () => new Promise((r) => setTimeout(r, 80));   // let async delivery + AES-GCM settle
// Controllable retransmit clock: hold every scheduled callback so a test can advance the ack backoff by hand
// (and prove no timer leaks). fireAll() runs and drops the callbacks pending at that moment.
function fakeTimers() {
  const pending = new Map(); let id = 0;
  return {
    set: (fn) => { const k = ++id; pending.set(k, fn); return k; },
    clear: (k) => pending.delete(k),
    fireAll: () => { const fns = [...pending.values()]; pending.clear(); for (const fn of fns) fn(); },
    get size() { return pending.size; },
  };
}
// wrap a bus carrier so a test can count how many chunks a session actually radiates
function countingCarrier(bus) {
  const c = bus.carrier(); let sends = 0; const send = c.send.bind(c);
  c.send = (b) => { sends++; return send(b); };
  return { carrier: c, sends: () => sends };
}

Deno.test("two peers sharing a passphrase exchange a message; a wrong key hears nothing", async () => {
  const bus = loopbackBus();
  const mk = (self, passphrase) => createMeshSession({ atom, carrier: bus.carrier(), crypto, room: "r", passphrase, self });
  const A = mk(1, "open-sesame"), B = mk(2, "open-sesame"), C = mk(3, "WRONG");
  await Promise.all([A.connect(), B.connect(), C.connect()]);

  await A.send("привіт, мешу");
  await flush();

  assertEquals(A.$messages.get().filter((m) => m.mine).map((m) => m.text), ["привіт, мешу"]); // own line
  const bIn = B.$messages.get().filter((m) => !m.mine);
  assertEquals(bIn.length, 1);
  assertEquals(bIn[0].text, "привіт, мешу");
  assertEquals(bIn[0].src, 1);
  assertEquals(B.$peers.get(), [1]);                                                          // peer discovered
  assertEquals(C.$messages.get().filter((m) => !m.mine).length, 0);                           // same room id, no key
});

Deno.test("a multi-fragment message survives the carrier's repeats + async delivery", async () => {
  const bus = loopbackBus();
  const A = createMeshSession({ atom, carrier: bus.carrier(), crypto, room: "r", passphrase: "k", self: 10, repeats: 3 });
  const B = createMeshSession({ atom, carrier: bus.carrier(), crypto, room: "r", passphrase: "k", self: 20 });
  await Promise.all([A.connect(), B.connect()]);

  const long = "z".repeat(700) + " кінець";                  // > one chunk even before the 28-byte box overhead
  await A.send(long);
  await flush();

  const got = B.$messages.get().filter((m) => !m.mine);
  assertEquals(got.length, 1);
  assertEquals(got[0].text, long);
});

Deno.test("empty/whitespace text is not sent", async () => {
  const bus = loopbackBus();
  const A = createMeshSession({ atom, carrier: bus.carrier(), crypto, room: "r", passphrase: "k", self: 1 });
  await A.connect();
  assertEquals(await A.send("   "), false);
  assertEquals(A.$messages.get().length, 0);
});

Deno.test("a confirmed message stops retransmitting — one decrypt-proven ack ends the loop", async () => {
  const bus = loopbackBus();
  const timers = fakeTimers();
  const a = countingCarrier(bus);
  const A = createMeshSession({ atom, carrier: a.carrier, crypto, room: "r", passphrase: "k", self: 1, setTimer: timers.set, clearTimer: timers.clear });
  const B = createMeshSession({ atom, carrier: bus.carrier(), crypto, room: "r", passphrase: "k", self: 2, setTimer: timers.set, clearTimer: timers.clear });
  await Promise.all([A.connect(), B.connect()]);

  await A.send("hi");                 // one data chunk radiated
  await flush();                      // B decrypts + acks; A applies the ack and clears its retransmit timer
  assertEquals(B.$messages.get().filter((m) => !m.mine).map((m) => m.text), ["hi"]);
  const before = a.sends();
  timers.fireAll();                   // any leftover backoff must be a no-op now
  await flush();
  assertEquals(a.sends(), before);    // ack ended the loop — no retransmit
  assertEquals(timers.size, 0);       // no leaked timer
  A.disconnect(); B.disconnect();
});

Deno.test("with no peer to confirm, the ack loop retransmits up to maxRounds then gives up", async () => {
  const bus = loopbackBus();
  const timers = fakeTimers();
  const a = countingCarrier(bus);
  const A = createMeshSession({ atom, carrier: a.carrier, crypto, room: "r", passphrase: "k", self: 1, maxRounds: 2, setTimer: timers.set, clearTimer: timers.clear });
  await A.connect();                  // nobody else in the room to ack

  await A.send("nobody home");        // initial pass
  await flush();
  assertEquals(a.sends(), 1);
  timers.fireAll(); await flush();    // round 1 retransmit
  assertEquals(a.sends(), 2);
  timers.fireAll(); await flush();    // round 2 retransmit
  assertEquals(a.sends(), 3);
  timers.fireAll(); await flush();    // maxRounds spent -> give up, no more sends, nothing rearmed
  assertEquals(a.sends(), 3);
  assertEquals(timers.size, 0);
  A.disconnect();
});
