// microspec runtime — meshcrypto unit tests. WebCrypto (SubtleCrypto) exists in Deno, so the seal/open
// round-trip is testable off-device.
//   deno test -A packages/runtime/runtime_test.js

import { assertEquals, assert } from "jsr:@std/assert@1";
import { deriveKey, seal, open, fingerprint, NONCE_LEN } from "../meshcrypto.js";

const enc = new TextEncoder(), dec = new TextDecoder();

Deno.test("seal -> open round-trips under a re-derived key (shared passphrase+room)", async () => {
  const k1 = await deriveKey("correct horse", "mesh");
  const box = await seal(k1, enc.encode("привіт off-grid"));
  assert(box.length > NONCE_LEN);
  const k2 = await deriveKey("correct horse", "mesh");        // a second peer derives independently
  const pt = await open(k2, box);
  assert(pt);
  assertEquals(dec.decode(pt), "привіт off-grid");
});

Deno.test("wrong passphrase or wrong room fails to open (null, no throw)", async () => {
  const box = await seal(await deriveKey("pw-A", "room"), enc.encode("secret"));
  assertEquals(await open(await deriveKey("pw-B", "room"), box), null);   // wrong passphrase
  assertEquals(await open(await deriveKey("pw-A", "other"), box), null);  // wrong room (salt)
});

Deno.test("a tampered or runt box does not open", async () => {
  const key = await deriveKey("pw", "r");
  const box = await seal(key, enc.encode("hello"));
  const bad = box.slice(); bad[bad.length - 1] ^= 0xff;                    // flip a tag bit
  assertEquals(await open(key, bad), null);
  assertEquals(await open(key, new Uint8Array(4)), null);                  // shorter than a nonce
  assertEquals(await open(key, null), null);
});

Deno.test("nonce is fresh per message: two seals of the same plaintext differ", async () => {
  const key = await deriveKey("pw", "r");
  const a = await seal(key, enc.encode("same")); const b = await seal(key, enc.encode("same"));
  assert(a.length === b.length);
  assert(!a.every((v, i) => v === b[i]));                                  // different nonce -> different bytes
});

Deno.test("fingerprint is deterministic across peers and room-specific", async () => {
  assertEquals(await fingerprint("pw", "mesh"), await fingerprint("pw", "mesh"));
  assert((await fingerprint("pw", "mesh")) !== (await fingerprint("pw", "other")));
  assert((await fingerprint("pw", "mesh")) !== (await fingerprint("pw2", "mesh")));
  assert((await fingerprint("pw", "mesh")).length === 12);                 // 6 bytes hex
});
