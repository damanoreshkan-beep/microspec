import { assert, assertEquals } from "jsr:@std/assert@1";
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

Deno.test("sealedUrl: the route with the envelope in ?s= — and a raw (non-JSON) body POST to it passes through to that URL untouched", async () => {
  const { sealedUrl } = await import("../sealedfetch.js");
  const url = await sealedUrl("/library/get", { id: "abc" });
  assert(url.startsWith(`${VPS_PROXY}/library/get?s=`) && url.length > `${VPS_PROXY}/library/get?s=`.length + 60, url);
  let hit = null;
  const restore = installSealedFetch(async (u, init) => { hit = { u: String(typeof u === "string" ? u : u.url), body: init?.body }; return new Response("{}"); });
  try { await globalThis.fetch(await sealedUrl("/library/put", { n: "x.mp3" }), { method: "POST", body: new Uint8Array([1, 2]) }); } finally { restore(); }
  assert(hit.u.startsWith(`${VPS_PROXY}/library/put?s=`), "a file body is never re-expressed through the tunnel");
  assert(hit.body instanceof Uint8Array);
});
