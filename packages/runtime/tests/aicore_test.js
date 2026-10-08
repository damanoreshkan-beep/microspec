import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { askAI } from "../ai-core.js";
import { authWall } from "../authwall.js";

// The AI is an edge task (ai-core.js): a start that answers an id, then a long-polled stream. Faked here the way a
// dead zone hits a phone: the first poll dies on the network, the next one reads the answer.
function edge(events, { dropFirstPoll = false, startStatus = 200 } = {}) {
  const seen = { starts: [], polls: 0 };
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    const u = String(url);
    if (u.endsWith("/feed/task")) {
      seen.starts.push(JSON.parse(init.body));
      return Promise.resolve(startStatus === 200 ? new Response(JSON.stringify({ id: "a1" })) : new Response('{"error":"sign in"}', { status: startStatus }));
    }
    if (u.includes("/feed/task/a1")) {
      seen.polls++;
      if (dropFirstPoll && seen.polls === 1) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(new Response(JSON.stringify(events), { headers: { "stream-next-offset": "0000000000000002", "stream-closed": "true" } }));
    }
    return Promise.reject(new Error("unexpected " + u));
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}

Deno.test("askAI: started as a /feed/ai task with a tap key; a poll lost to the network is retried, the answer read", async () => {
  const e = edge([{ t: "stage", s: "thinking" }, { t: "result", status: 200, body: { text: "  a fox  ", truncated: false } }], { dropFirstPoll: true });
  try {
    assertEquals(await askAI("лис", "uk", "polish"), { text: "a fox", truncated: false, ungrounded: false });
    assertEquals(e.seen.starts[0].route, "/feed/ai");
    assertEquals(e.seen.starts[0].body, { mode: "polish", text: "лис", locale: "uk" });
    assertEquals(e.seen.polls, 2, "the dropped poll, then the one that read the result");
  } finally { e.restore(); }
});

Deno.test("askAI: a fail event throws `status N`; a 401 refusal at the start bumps the auth wall", async () => {
  let e = edge([{ t: "fail", status: 429, error: "rate limited" }]);
  try { await assertRejects(() => askAI("x", "en", "polish"), Error, "status 429"); } finally { e.restore(); }
  const before = authWall.get();
  e = edge([], { startStatus: 401 });
  try { await assertRejects(() => askAI("x", "en", "polish"), Error, "status 401"); assertEquals(authWall.get(), before + 1); } finally { e.restore(); }
});
