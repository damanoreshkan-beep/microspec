
import { assert, assertEquals } from "jsr:@std/assert@1";
import { asked as chatAsked, answered as chatAnswered, foldThread as chatFold, askSignature as chatSig, groundBook as chatGround } from "../chat.js";


Deno.test("foldThread keeps the tail, and the tail is what carries the pronouns", () => {
  const turns = [];
  for (let i = 0; i < 20; i++) { turns.push(chatAsked("q" + i + " ".repeat(400))); turns.push(chatAnswered("a" + i)); }
  turns.push(chatAsked("а якби я йому це сказав?"));
  const kept = chatFold(turns, 2000, 12);
  assertEquals(kept.at(-1).t, "а якби я йому це сказав?", "the turn being ANSWERED was dropped");
  assertEquals(kept[0].r, "u", "the thread must open on the reader — the grounding is prepended to it");
  assert(kept.reduce((a, x) => a + x.t.length, 0) <= 2000 + 500, "the budget was not honoured");
});

Deno.test("foldThread: a thread that no longer ends on the reader is not sendable", () => {
  assertEquals(chatFold([chatAnswered("a lone reply")]), []);
  assertEquals(chatFold([]), []);
  assertEquals(chatFold(null), []);
  assertEquals(chatFold([chatAsked("  "), chatAsked("real")]).length, 1);
});

Deno.test("askSignature: the whole exchange is the key, not just the last thing said", () => {
  const a = [chatAsked("хто такий Пол?"), chatAnswered("син герцога"), chatAsked("а далі?")];
  const b = [chatAsked("хто така Джессіка?"), chatAnswered("його мати"), chatAsked("а далі?")];
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "uk", b), "the prefix must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 3, false, "uk", a), "level must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, true, "uk", a), "the spoiler lock must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "en", a), "locale must vary the key");
  assertEquals(chatSig(1, 2, false, "uk", a), chatSig(1, 2, false, "uk", a), "and it must be stable");
  assert(chatSig(1, 2, false, "uk", a).length < 40, "the signature is not bounded");
});

Deno.test("groundBook puts the book above its plot", () => {
  const g = chatGround({ title: "Dune", byline: "Frank Herbert · 1965", plot: "  Sand.  " });
  assert(g.startsWith("КНИГА: Dune — Frank Herbert · 1965"), "the book header is missing");
  assert(g.trimEnd().endsWith("Sand."), "the plot is missing or untrimmed");
});
