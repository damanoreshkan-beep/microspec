import { assertEquals } from "jsr:@std/assert@1";
import { startTarget } from "../tma.js";

Deno.test("startTarget: a startapp link routes from the root and the store, nowhere else, never to the store", () => {
  assertEquals(startTarget("/", "muzak"), "/muzak/");
  assertEquals(startTarget("/index.html", "muzak"), "/muzak/");
  assertEquals(startTarget("/store/", "muzak"), "/muzak/");
  assertEquals(startTarget("/store/index.html", "muzak"), "/muzak/");
  assertEquals(startTarget("/muzak/", "muzak"), "");
  assertEquals(startTarget("/fonoteka/", "muzak"), "");
  assertEquals(startTarget("/store/", "store"), "");
  assertEquals(startTarget("/store/", ""), "");
});
