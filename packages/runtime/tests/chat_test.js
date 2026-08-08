// microspec runtime — chat unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { asked as chatAsked, answered as chatAnswered, foldThread as chatFold, askSignature as chatSig, groundBook as chatGround } from "../chat.js";

// ── chat.js — the pure logic behind a grounded CONVERSATION ──────────────────────────────────────────────
// Both rules here fail silently when wrong: a bad fold drops the grounding an answer depends on (or leaves
// the model replying to itself), and a bad signature serves one conversation's reply inside another.

Deno.test("foldThread keeps the tail, and the tail is what carries the pronouns", () => {
  // The reverse of foldPlot, on purpose: a plot needs its ending, a conversation needs its present. The book
  // is re-sent whole with every request, so forgetting the start of the thread loses nothing that matters.
  const turns = [];
  for (let i = 0; i < 20; i++) { turns.push(chatAsked("q" + i + " ".repeat(400))); turns.push(chatAnswered("a" + i)); }
  turns.push(chatAsked("а якби я йому це сказав?"));
  const kept = chatFold(turns, 2000, 12);
  assertEquals(kept.at(-1).t, "а якби я йому це сказав?", "the turn being ANSWERED was dropped");
  assertEquals(kept[0].r, "u", "the thread must open on the reader — the grounding is prepended to it");
  assert(kept.reduce((a, x) => a + x.t.length, 0) <= 2000 + 500, "the budget was not honoured");
});

Deno.test("foldThread: a thread that no longer ends on the reader is not sendable", () => {
  // Answering the model's own last reply would produce a turn nobody asked for, cached under a key that
  // claims someone did.
  assertEquals(chatFold([chatAnswered("a lone reply")]), []);
  assertEquals(chatFold([]), []);
  assertEquals(chatFold(null), []);
  // blank turns never reach the wire
  assertEquals(chatFold([chatAsked("  "), chatAsked("real")]).length, 1);
});

Deno.test("askSignature: the whole exchange is the key, not just the last thing said", () => {
  // The same words asked after a different conversation are a different question. A key built from the last
  // turn alone would hand back the earlier answer.
  const a = [chatAsked("хто такий Пол?"), chatAnswered("син герцога"), chatAsked("а далі?")];
  const b = [chatAsked("хто така Джессіка?"), chatAnswered("його мати"), chatAsked("а далі?")];
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "uk", b), "the prefix must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 3, false, "uk", a), "level must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, true, "uk", a), "the spoiler lock must vary the key");
  assert(chatSig(1, 2, false, "uk", a) !== chatSig(1, 2, false, "en", a), "locale must vary the key");
  assertEquals(chatSig(1, 2, false, "uk", a), chatSig(1, 2, false, "uk", a), "and it must be stable");
  // bounded: a key that embedded the thread verbatim would outgrow localStorage as a conversation ran on
  assert(chatSig(1, 2, false, "uk", a).length < 40, "the signature is not bounded");
});

Deno.test("groundBook puts the book above its plot", () => {
  const g = chatGround({ title: "Dune", byline: "Frank Herbert · 1965", plot: "  Sand.  " });
  assert(g.startsWith("КНИГА: Dune — Frank Herbert · 1965"), "the book header is missing");
  assert(g.trimEnd().endsWith("Sand."), "the plot is missing or untrimmed");
});
