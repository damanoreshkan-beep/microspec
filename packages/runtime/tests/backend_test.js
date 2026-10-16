import { assert } from "jsr:@std/assert@1";
import { ORIGINS, SEALED_KEY } from "../backend.js";

Deno.test("backend: every origin is a bare https origin — no path, no trailing slash", () => {
  for (const o of ORIGINS) assert(new URL(o).origin === o && o.startsWith("https://"), `not a bare https origin: ${o}`);
});

Deno.test("backend: the sealed key is base64url (a raw P-256 point) or empty for a backend without the tunnel", () => {
  assert(SEALED_KEY === "" || /^[A-Za-z0-9_-]{80,100}$/.test(SEALED_KEY), "SEALED_KEY is neither empty nor base64url");
});
