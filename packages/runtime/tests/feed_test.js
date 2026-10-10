import { assertEquals } from "jsr:@std/assert@1";
import { feedBase, FARM_ORIGINS } from "../feed.js";

Deno.test("feedBase: a farm page talks to its own origin's /feed, anything else to the canonical one", () => {
  assertEquals(feedBase("https://mriia.si"), "https://mriia.si/feed");
  assertEquals(feedBase("https://dreamstudio.mooo.com"), "https://dreamstudio.mooo.com/feed");
  assertEquals(feedBase("http://localhost:8123"), `${FARM_ORIGINS[0]}/feed`);
  assertEquals(feedBase(""), `${FARM_ORIGINS[0]}/feed`);
  assertEquals(feedBase("https://mriia.si.evil.example"), `${FARM_ORIGINS[0]}/feed`);
});
