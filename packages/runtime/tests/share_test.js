import { assertEquals } from "jsr:@std/assert@1";
import { firstLink, takeShared } from "../share.js";

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
