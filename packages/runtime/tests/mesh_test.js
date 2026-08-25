// microspec runtime — mesh SESSION end-to-end tests. Real meshcrypto (WebCrypto runs in Deno), a loopback
// bus for the carrier, a minimal atom. Proves the whole off-grid stack — encrypt, fragment, radiate, dedup,
// reassemble, decrypt — with no hardware.
//   deno test -A packages/runtime/runtime_test.js

import { assertEquals, assert } from "jsr:@std/assert@1";
import { createMeshSession, loopbackBus } from "../mesh.js";
import * as crypto from "../meshcrypto.js";

const atom = (v) => { let val = v; return { get: () => val, set: (x) => (val = x) }; };
const flush = () => new Promise((r) => setTimeout(r, 80));   // let async delivery + AES-GCM settle

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
