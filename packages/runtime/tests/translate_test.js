import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { toEnglish, isLatin, rememberEnglish } from "../translate.js";
import { suggestPrompt } from "../ai-text.js";

const gtx = (en) => JSON.stringify([[[en, "х"]]]);
const R = " #" + Date.now().toString(36);
function mock({ gtxOut, aiOut }) {
  const calls = { gtx: 0, ai: 0 };
  const real = globalThis.fetch;
  globalThis.fetch = (url) => {
    const u = String(url);
    // the AI is a task now (ai-core.js): the start answers an id, the stream answers the result or a fail, then EOF
    if (u.endsWith("/feed/task")) { calls.ai++; return Promise.resolve(new Response(JSON.stringify({ id: "t1" }), { headers: { "content-type": "application/json" } })); }
    if (u.includes("/feed/task/t1")) {
      const ev = aiOut == null ? { t: "fail", status: 502, error: "no model" } : { t: "result", status: 200, body: { text: aiOut } };
      return Promise.resolve(new Response(JSON.stringify([ev]), { headers: { "content-type": "application/json", "stream-next-offset": "0000000000000001", "stream-closed": "true" } }));
    }
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
  m = mock({ gtxOut: "never", aiOut: '{"en":"a red umbrella on wet stone","ua":"червона парасолька на мокрому камені' + R + '"}' });
  try { assertEquals((await suggestPrompt("dream", "x", "uk")).local, "червона парасолька на мокрому камені" + R); }
  finally { m.restore(); }
  m = mock({ gtxOut: "маяк у бурю, кінематографічно", aiOut: '{"en":"a lighthouse in a storm, cinematic' + R + '","uk":"маяк, що гisinює у бурі, chyjarosсuro"}' });
  try {
    const p = await suggestPrompt("dream", "x", "uk");
    assertEquals(p.local, "маяк у бурю, кінематографічно", "the broken Ukrainian never reaches the field");
    assertEquals(m.calls.gtx, 1, "one gtx call renders the English");
    assertEquals(await toEnglish(p.local), p.en, "and the pair still sends the model's own English");
  } finally { m.restore(); }
  m = mock({ gtxOut: "never", aiOut: "Самотній маяк на світанку." });
  try { assertEquals(await suggestPrompt("dream", "x", "uk"), null, "prose instead of the envelope is a miss"); }
  finally { m.restore(); }
});
