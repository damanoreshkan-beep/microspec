import { assertEquals } from "jsr:@std/assert@1";
import { firstLink, takeShared, takeFiles } from "../share.js";

Deno.test("firstLink: url, then text, then title; trailing punctuation dropped; none → empty", () => {
  assertEquals(firstLink({ url: "https://a.io/x", text: "https://b.io" }), "https://a.io/x");
  assertEquals(firstLink({ text: "look: https://music.youtube.com/watch?v=dQw4w9WgXcQ." }), "https://music.youtube.com/watch?v=dQw4w9WgXcQ");
  assertEquals(firstLink({ title: "Song", text: "no link here" }), "");
  assertEquals(firstLink(null), "");
});

Deno.test("takeShared: a handler registered later still receives nothing when nothing was shared", () => {
  let got = null;
  takeShared((s) => { got = s; });
  assertEquals(got, null);
});

Deno.test("takeFiles: the parked files come back as File[] in order, named and typed, and the cache is cleared", async () => {
  const scope = "https://dreamstudio.example/fonoteka/";
  const parked = new Map([[`${scope}share-target/0`, new Response(new Uint8Array([7, 8]), { headers: { "content-type": "audio/mpeg", "x-ms-name": encodeURIComponent("Пісня.mp3") } })]]);
  const caches = { open: () => Promise.resolve({ match: (k) => Promise.resolve(parked.get(k)), delete: (k) => Promise.resolve(parked.delete(k)) }) };
  const files = await takeFiles(caches, scope, 2);
  assertEquals(files.length, 1, "a missing index is skipped, not an error");
  assertEquals([files[0].name, files[0].type, files[0].size], ["Пісня.mp3", "audio/mpeg", 2]);
  assertEquals(parked.size, 0, "read once");
  assertEquals(await takeFiles({ open: () => Promise.reject(new Error("no caches")) }, scope, 1), []);
});
