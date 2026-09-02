// imagejob.js — the one-result follower: bytes end it, an error names capacity, a superseded run lands nothing.
// fetch is stubbed per test; one poll costs EVERY (1.5 s), so each case answers on its first poll.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { followOne, startJob } from "../imagejob.js";

const withFetch = async (fn, body) => {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try { return await body(); } finally { globalThis.fetch = real; }
};
const jsonRes = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

Deno.test("followOne: a non-JSON answer IS the result — blob, object URL and the by-header", async () => {
  const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
  const calls = [];
  const got = await withFetch((u) => { calls.push(String(u)); return Promise.resolve(new Response(wav, { headers: { "content-type": "audio/wav", "x-audio-by": "k2-fsa/OmniVoice" } })); },
    () => followOne({ base: "http://x/feed/voice", job: "j1" }));
  assertEquals(got.status, "done");
  assertEquals(got.by, "k2-fsa/OmniVoice");
  assertEquals(got.blob.type, "audio/wav");
  assertEquals(got.blob.size, 8);
  assert(got.url.startsWith("blob:"), "an object URL is minted for the player");
  assertEquals(calls, ["http://x/feed/voice/get?job=j1"]);
});

Deno.test("followOne: progress is mirrored; error 'busy' is capacity, any other error is words", async () => {
  const seen = [];
  const busy = await withFetch(() => Promise.resolve(jsonRes({ status: "error", error: "busy" })),
    () => followOne({ base: "http://x/feed/voice", job: "j2", onLive: (m) => seen.push(m) }));
  assertEquals(busy.status, "busy");
  const err = await withFetch(() => Promise.resolve(jsonRes({ status: "error", error: null })),
    () => followOne({ base: "http://x/feed/voice", job: "j3" }));
  assertEquals(err.status, "error");
});

Deno.test("followOne: a superseded run resolves stale before it reads anything", async () => {
  let polled = 0;
  const got = await withFetch(() => { polled++; return Promise.resolve(jsonRes({ status: "pending", stage: "cloning" })); },
    () => followOne({ base: "http://x/feed/voice", job: "j4", alive: () => false }));
  assertEquals(got.status, "stale");
  assertEquals(polled, 0, "a stale follower must not spend a request");
});

Deno.test("startJob: the status maps to the i18n code the view shows", async () => {
  for (const [status, code] of [[401, "eSignIn"], [429, "eRate"], [413, "eBig"], [500, "eFailed"]]) {
    const e = await withFetch(() => Promise.resolve(jsonRes({}, status)), () => startJob("http://x/feed/voice", {}).catch((x) => x));
    assertEquals(e.code, code, String(status));
  }
  const id = await withFetch(() => Promise.resolve(jsonRes({ job: "abc" })), () => startJob("http://x/feed/voice", { text: "hi" }));
  assertEquals(id, "abc");
});
