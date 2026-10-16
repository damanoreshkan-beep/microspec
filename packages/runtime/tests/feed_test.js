import { assertEquals } from "jsr:@std/assert@1";
import { backendFor, feedBase, FARM_ORIGINS } from "../feed.js";
import { ORIGINS } from "../backend.js";

Deno.test("feedBase: a farm page talks to its own origin's /feed, anything else to the canonical one", () => {
  assertEquals(feedBase("https://mriia.si"), "https://mriia.si/feed");
  assertEquals(feedBase("https://dreamstudio.mooo.com"), "https://dreamstudio.mooo.com/feed");
  assertEquals(feedBase("http://localhost:8123"), `${FARM_ORIGINS[0]}/feed`);
  assertEquals(feedBase(""), `${FARM_ORIGINS[0]}/feed`);
  assertEquals(feedBase("https://mriia.si.evil.example"), `${FARM_ORIGINS[0]}/feed`);
});

Deno.test("feedBase reads the product's origins from runtime/backend.js", () => {
  assertEquals(FARM_ORIGINS, ORIGINS);
});

Deno.test("backendFor: a product's page talks to its own origin when it is one of the product's", () => {
  const product = ["https://pokermon.mooo.com"];
  assertEquals(backendFor("https://pokermon.mooo.com", product), "https://pokermon.mooo.com/feed");
  assertEquals(backendFor("http://localhost:8123", product), "https://pokermon.mooo.com/feed");
  assertEquals(backendFor("https://pokermon.mooo.com.evil.example", product), "https://pokermon.mooo.com/feed");
});

Deno.test("backendFor: a product that names no origin talks to whatever origin serves the page", () => {
  assertEquals(backendFor("https://pokermon.mooo.com", []), "https://pokermon.mooo.com/feed");
  assertEquals(backendFor("http://localhost:8123", []), "http://localhost:8123/feed");
  assertEquals(backendFor("", []), "/feed");
});
