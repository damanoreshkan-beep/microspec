import { assertEquals } from "jsr:@std/assert@1";
import { installSealedFetch } from "../sealedfetch.js";
import { VPS_PROXY } from "../feed.js";

const tunnelInit = async (body, keepalive) => {
  let seen = null;
  const restore = installSealedFetch(async (_url, init) => { seen = init; return new Response("x"); });
  try { await globalThis.fetch(`${VPS_PROXY}/log`, { method: "POST", body: JSON.stringify(body), keepalive }).catch(() => {}); }
  finally { restore(); }
  return seen;
};

Deno.test("sealedfetch keeps keepalive for a small body, so a pagehide flush survives", async () => {
  assertEquals((await tunnelInit({ events: [{ event: "use" }] }, true)).keepalive, true);
});

Deno.test("sealedfetch drops keepalive past the browser's 64 KB cap instead of failing the send", async () => {
  assertEquals((await tunnelInit({ blob: "x".repeat(70000) }, true)).keepalive, false);
});

Deno.test("sealedfetch never adds keepalive the caller did not ask for", async () => {
  assertEquals((await tunnelInit({ events: [] }, undefined)).keepalive, false);
});
