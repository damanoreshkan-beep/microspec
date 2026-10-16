import { assertEquals } from "jsr:@std/assert@1";
import { backendFor, feedBase, FARM_ORIGINS } from "../feed.js";
import { ORIGINS } from "../backend.js";

Deno.test("feedBase reads the product's origins from runtime/backend.js", () => {
  assertEquals(FARM_ORIGINS, ORIGINS);
  assertEquals(feedBase("https://example.test"), backendFor("https://example.test", ORIGINS));
});

Deno.test("backendFor: a product's page talks to its own origin's /feed, anything else to the canonical one", () => {
  const farm = ["https://mriia.si", "https://dreamstudio.mooo.com"];
  assertEquals(backendFor("https://mriia.si", farm), "https://mriia.si/feed");
  assertEquals(backendFor("https://dreamstudio.mooo.com", farm), "https://dreamstudio.mooo.com/feed");
  assertEquals(backendFor("http://localhost:8123", farm), "https://mriia.si/feed");
  assertEquals(backendFor("", farm), "https://mriia.si/feed");
  assertEquals(backendFor("https://mriia.si.evil.example", farm), "https://mriia.si/feed");
});

Deno.test("backendFor: a product that names no origin talks to whatever origin serves the page", () => {
  assertEquals(backendFor("https://pokermon.mooo.com", []), "https://pokermon.mooo.com/feed");
  assertEquals(backendFor("http://localhost:8123", []), "http://localhost:8123/feed");
  assertEquals(backendFor("", []), "/feed");
});
