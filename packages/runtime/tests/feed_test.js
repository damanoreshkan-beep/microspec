import { assertEquals } from "jsr:@std/assert@1";
import { backendFor, feedBase, FARM_ORIGINS } from "../feed.js";
import { ORIGINS } from "../backend.js";

Deno.test("feedBase reads the product's origins from runtime/backend.js", () => {
  assertEquals(FARM_ORIGINS, ORIGINS);
  assertEquals(feedBase("https://example.test"), backendFor("https://example.test", ORIGINS));
});

Deno.test("backendFor: a product's page talks to its own origin's /feed, anything else to the canonical one", () => {
  const farm = ["https://app.example.com", "https://mirror.example.org"];
  assertEquals(backendFor("https://app.example.com", farm), "https://app.example.com/feed");
  assertEquals(backendFor("https://mirror.example.org", farm), "https://mirror.example.org/feed");
  assertEquals(backendFor("http://localhost:8123", farm), "https://app.example.com/feed");
  assertEquals(backendFor("", farm), "https://app.example.com/feed");
  assertEquals(backendFor("https://app.example.com.evil.example", farm), "https://app.example.com/feed");
});

Deno.test("backendFor: a product that names no origin talks to whatever origin serves the page", () => {
  assertEquals(backendFor("https://other.example.net", []), "https://other.example.net/feed");
  assertEquals(backendFor("http://localhost:8123", []), "http://localhost:8123/feed");
  assertEquals(backendFor("", []), "/feed");
});
