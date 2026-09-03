// intake.js — the browser-free half: the gate's stand-in picture is deterministic, the extension follows the
// blob type, the copy has en/uk parity. The chooser and the viewfinder are exercised by their consumers' e2e.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { mockArt, extOf, MAX_SIDE, sizeOf } from "../intake.js";

Deno.test("mockArt: the same seed is the same frame, a different seed is not, scale sets the intrinsic size", () => {
  assertEquals(mockArt(13), mockArt(13));
  assert(mockArt(13) !== mockArt(14));
  assert(mockArt(13).startsWith("data:image/svg+xml;utf8,"));
  assert(decodeURIComponent(mockArt(7, 4)).includes('width="384" height="512"'), "scale 4 → 384×512");
});

Deno.test("extOf: webp · png · jpg from the blob type; MAX_SIDE is the 1024 cap the Spaces and the proxy share", () => {
  assertEquals(extOf(new Blob([], { type: "image/webp" })), "webp");
  assertEquals(extOf(new Blob([], { type: "image/png" })), "png");
  assertEquals(extOf(new Blob([], { type: "image/jpeg" })), "jpg");
  assertEquals(extOf(new Blob([], { type: "" })), "jpg");
  assertEquals(MAX_SIDE, 1024);
});

Deno.test("sizeOf: bytes that do not decode answer null, never throw", async () => {
  assertEquals(await sizeOf(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })), null);
});
