import { assertEquals } from "jsr:@std/assert@1";
import { startTarget, outsideHref, launchInitData } from "../tma.js";

Deno.test("launchInitData: the signed initData comes from the launch URL, before the SDK loads", () => {
  const initData = new URLSearchParams({ query_id: "AAE", user: JSON.stringify({ id: 1, first_name: "A" }), auth_date: "1700000000", hash: "abc" }).toString();
  const launch = "tgWebAppData=" + encodeURIComponent(initData) + "&tgWebAppVersion=8.0&tgWebAppPlatform=android";
  assertEquals(launchInitData(launch), initData, "exactly the string the bot signed, decoded once");
  assertEquals(launchInitData("#" + launch), initData, "a leading # is fine");
  assertEquals(launchInitData("&locale=en"), "", "outside Telegram there is none");
  assertEquals(launchInitData(""), "");
});

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
