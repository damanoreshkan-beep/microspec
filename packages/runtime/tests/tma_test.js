import { assertEquals } from "jsr:@std/assert@1";
import { startTarget, outsideHref } from "../tma.js";

Deno.test("outsideHref: the APK gets an intent:// for ACTION_VIEW, Telegram and a page keep the url", () => {
  const u = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y";
  assertEquals(outsideHref(u, "apk"), "intent://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y#Intent;scheme=https;action=android.intent.action.VIEW;end");
  assertEquals(outsideHref(u, "telegram"), u);
  assertEquals(outsideHref(u, "page"), u);
});

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
