// microspec runtime — pwned unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assertEquals } from "jsr:@std/assert@1";
import { sha1hex, splitHash, parseRange, lookup, checkPassword } from "../pwned.js";

// ---- pwned: k-anonymity breach check ----

Deno.test("pwned: SHA-1 matches known vectors", async () => {
  assertEquals(await sha1hex(""), "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709");
  assertEquals(await sha1hex("secret123"), "F2B14F68EB995FACB3A1C35287B778D5BD785511");
});

Deno.test("pwned: splitHash → 5-char prefix + 35-char suffix", () => {
  const { prefix, suffix } = splitHash("F2B14F68EB995FACB3A1C35287B778D5BD785511");
  assertEquals(prefix, "F2B14");
  assertEquals(suffix, "F68EB995FACB3A1C35287B778D5BD785511");
  assertEquals(prefix.length, 5);
  assertEquals(suffix.length, 35);
});

Deno.test("pwned: parseRange + lookup (case-insensitive, tolerant)", () => {
  const text = "AAAA:5\r\nF68EB995FACB3A1C35287B778D5BD785511:42\n\nBBBB:0";
  assertEquals(lookup("F68EB995FACB3A1C35287B778D5BD785511", text), 42);
  assertEquals(lookup("f68eb995facb3a1c35287b778d5bd785511", text), 42);   // case-insensitive
  assertEquals(lookup("DEADBEEF", text), 0);                               // absent → 0
  assertEquals(parseRange(text).size, 3);
});

Deno.test("pwned: checkPassword — breached and clean, only the prefix is queried", async () => {
  let asked = null;
  const range = "F68EB995FACB3A1C35287B778D5BD785511:2400000\nAAAA:1";
  const hit = await checkPassword("secret123", (p) => { asked = p; return Promise.resolve(range); });
  assertEquals(asked, "F2B14", "must query ONLY the 5-char prefix");
  assertEquals(hit.pwned, true);
  assertEquals(hit.count, 2400000);
  assertEquals(hit.hex, "F2B14F68EB995FACB3A1C35287B778D5BD785511");

  const clean = await checkPassword("secret123", () => Promise.resolve("AAAA:1\nBBBB:2"));
  assertEquals(clean.pwned, false);
  assertEquals(clean.count, 0);
});
