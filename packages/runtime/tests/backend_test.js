import { assert, assertEquals } from "jsr:@std/assert@1";
import { APK, BOT, ORIGINS, SEALED_KEY, SIGNIN, STARS } from "../backend.js";

Deno.test("backend: the APK, Stars and sign-in flags default to everything, so older product files keep it all", () => {
  assert(APK === true && STARS === true);
  assertEquals(SIGNIN, ["google", "github", "telegram"]);
});

Deno.test("backend: every origin is a bare https origin — no path, no trailing slash", () => {
  for (const o of ORIGINS) assert(new URL(o).origin === o && o.startsWith("https://"), `not a bare https origin: ${o}`);
});

Deno.test("backend: the bot is a Telegram username without @, or empty for a product without a bot", () => {
  assert(BOT === "" || /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(BOT), `not a bot username: ${BOT}`);
});

Deno.test("backend: the sealed key is base64url (a raw P-256 point) or empty for a backend without the tunnel", () => {
  assert(SEALED_KEY === "" || /^[A-Za-z0-9_-]{80,100}$/.test(SEALED_KEY), "SEALED_KEY is neither empty nor base64url");
});
