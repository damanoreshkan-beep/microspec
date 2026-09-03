// translate.js — the SEND side (toEnglish) and the pair seeding behind suggestPrompt. English under the hood
// (2026-09-03): a prompt either becomes English or throws — the fixtures are the two wires (gtx, /feed/ai
// mode "english") mocked at fetch, so the cascade order and the fail-closed end are what is tested.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { toEnglish, isLatin, rememberEnglish } from "../translate.js";
import { suggestPrompt } from "../ai-text.js";

const gtx = (en) => JSON.stringify([[[en, "х"]]]);
// Deno's localStorage persists between runs and the module mirrors it — every source string carries a run
// token so a cached answer from the previous run cannot stand in for the wire.
const R = " #" + Date.now().toString(36);
// mock(wires) — fetch answering the gtx endpoint and the edge's /feed/ai from the given behaviours; counts calls
function mock({ gtxOut, aiOut }) {
  const calls = { gtx: 0, ai: 0 };
  const real = globalThis.fetch;
  globalThis.fetch = (url) => {
    const u = String(url);
    if (u.includes("/feed/ai")) { calls.ai++; return Promise.resolve(aiOut == null ? new Response("", { status: 502 }) : new Response(JSON.stringify({ text: aiOut }), { headers: { "content-type": "application/json" } })); }
    calls.gtx++;
    if (gtxOut == null) return Promise.reject(new Error("blocked"));
    return Promise.resolve(new Response(gtx(gtxOut)));
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

Deno.test("isLatin: Latin-script text passes, a single letter of another script does not", () => {
  assert(isLatin("a château at dusk, 35mm, f/1.4 — cinematic"));
  assert(isLatin("") && isLatin("1234 !?"));
  assert(!isLatin("a cat, кіт") && !isLatin("猫") && !isLatin("قط"));
});

Deno.test("toEnglish: Latin-script input never touches the wire", async () => {
  const m = mock({ gtxOut: "never", aiOut: "never" });
  try { assertEquals(await toEnglish("a fox in fog, cinematic"), "a fox in fog, cinematic"); assertEquals(m.calls, { gtx: 0, ai: 0 }); }
  finally { m.restore(); }
});

Deno.test("toEnglish: gtx answers first and the answer is cached", async () => {
  const m = mock({ gtxOut: "a cat on a windowsill", aiOut: "unused" });
  try {
    assertEquals(await toEnglish("кіт на підвіконні" + R), "a cat on a windowsill");
    assertEquals(await toEnglish("кіт на підвіконні" + R), "a cat on a windowsill");
    assertEquals(m.calls, { gtx: 1, ai: 0 }, "the second call is the cache");
  } finally { m.restore(); }
});

Deno.test("toEnglish: gtx down → the edge's english mode; gtx still Cyrillic → the edge too", async () => {
  let m = mock({ gtxOut: null, aiOut: "a dog in the rain" });
  try { assertEquals(await toEnglish("пес під дощем" + R), "a dog in the rain"); assert(m.calls.gtx >= 1); assertEquals(m.calls.ai, 1); }
  finally { m.restore(); }
  m = mock({ gtxOut: "пес під дощем", aiOut: "a dog in the rain" });
  try { assertEquals(await toEnglish("пес у дощ" + R), "a dog in the rain"); assertEquals(m.calls.ai, 1, "a non-Latin gtx answer is not English"); }
  finally { m.restore(); }
});

Deno.test("toEnglish: no English anywhere → throws eTranslate, nothing cached", async () => {
  const m = mock({ gtxOut: "все ще кирилиця", aiOut: "і тут кирилиця" });
  try {
    const e = await assertRejects(() => toEnglish("зорі над морем" + R));
    assertEquals(e.code, "eTranslate");
    await assertRejects(() => toEnglish("зорі над морем" + R), "a failure is not remembered");
    assertEquals(m.calls, { gtx: 2, ai: 2 });
  } finally { m.restore(); }
});

Deno.test("rememberEnglish: a seeded pair answers without the wire; suggestPrompt seeds it from the envelope", async () => {
  rememberEnglish("лисиця в тумані" + R, "a fox in fog, cinematic");
  let m = mock({ gtxOut: "never", aiOut: "never" });
  try { assertEquals(await toEnglish("лисиця в тумані" + R), "a fox in fog, cinematic"); assertEquals(m.calls, { gtx: 0, ai: 0 }); }
  finally { m.restore(); }

  m = mock({ gtxOut: "never", aiOut: '```json\n{"en":"a lone lighthouse at dawn, macro dew","local":"самотній маяк на світанку, макро роса' + R + '"}\n```' });
  try {
    const p = await suggestPrompt("dream", "a lighthouse", "uk");
    assertEquals(p, { en: "a lone lighthouse at dawn, macro dew", local: "самотній маяк на світанку, макро роса" + R });
    assertEquals(m.calls.ai, 1);
    assertEquals(await toEnglish(p.local), p.en, "the send is the model's own English, not a round-trip");
    assertEquals(m.calls, { gtx: 0, ai: 1 });
  } finally { m.restore(); }

  m = mock({ gtxOut: "never", aiOut: '{"en":"a harbour at night"}' });
  try { assertEquals(await suggestPrompt("dream", "x", "en"), { en: "a harbour at night", local: "a harbour at night" }, "en: local is the English itself"); }
  finally { m.restore(); }
  m = mock({ gtxOut: "never", aiOut: "Самотній маяк на світанку." });
  try { assertEquals(await suggestPrompt("dream", "x", "uk"), null, "prose instead of the envelope is a miss"); }
  finally { m.restore(); }
});
