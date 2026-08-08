// microspec runtime — acts unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { isBook as actsIsBook, findPlotSection as actsFindPlot, cleanPlotText as actsClean, foldPlot as actsFold, parseActs as actsParse, countSentences as actsCount, actSignature as actsSig, plotUpToClimax as actsUpToClimax } from "../acts.js";

// ── acts.js — the pure logic behind `arc` ────────────────────────────────────────────────────────────────
// Every table here came from a measurement (apps/arc/RESEARCH.md); these tests pin the measurements, so a
// well-meaning tidy-up of a "redundant" QID cannot silently drop a genre.

Deno.test("isBook: the type allowlist covers what the P31 census actually found", () => {
  assert(actsIsBook({ p31: ["Q7725634"] }), "literary work is the common case (34/39)");
  // The regression this exists for: a bare literary-work allowlist drops ALL non-fiction.
  assert(actsIsBook({ p31: ["Q47461344"] }), "written work — Sapiens, Educated, A Room of One's Own");
  assert(actsIsBook({ p31: ["Q1667921", "Q13593966"] }), "The Hunger Games is typed as its series");
  assert(actsIsBook({ p31: ["Q7725634", "Q49100005"] }), "banned book only ever co-occurs");
});

Deno.test("isBook: a film adaptation shares the title and must never win", () => {
  // uk `Там, де співають раки` resolves to the film, whose plot summarises the wrong work entirely.
  assert(!actsIsBook({ p31: ["Q11424"], hasAuthor: true, hasDate: true }), "film");
  assert(!actsIsBook({ p31: ["Q5"] }), "the author is not the book");
  assert(!actsIsBook({ p31: ["Q4167410"] }), "disambiguation page");
  assert(!actsIsBook({ p31: ["Q482994"] }), "soundtrack album");
  // a denied type wins even when the work signals are present
  assert(!actsIsBook({ p31: ["Q11424", "Q7725634"] }), "typed as both → the film reading must lose");
});

Deno.test("isBook: untyped works fall back to author+date, which films do not have", () => {
  assert(actsIsBook({ p31: [], hasAuthor: true, hasDate: true }), "P50+P577 are on 38/39 books");
  assert(!actsIsBook({ p31: [], hasAuthor: true }), "author alone is not enough");
  assert(!actsIsBook({ p31: [], hasDate: true }), "a date alone is nothing");
  assert(!actsIsBook({}), "no signal at all");
});

Deno.test("findPlotSection: resolves by NAME, never by a remembered number", () => {
  // The index moved 2 → 3 on Dune (novel) between revisions 4 minutes apart.
  assertEquals(actsFindPlot([{ index: 1, line: "Origins" }, { index: 3, line: "Plot" }]).index, "3");
  assertEquals(actsFindPlot([{ index: 2, line: "Plot summary" }]).index, "2");
  assertEquals(actsFindPlot([{ index: 5, line: "Synopsis" }]).index, "5");
  assertEquals(actsFindPlot([{ index: 4, line: "Storylines" }]).index, "4");
  // preference order: an article carrying both takes the summary
  assertEquals(actsFindPlot([{ index: 7, line: "Synopsis" }, { index: 2, line: "Plot summary" }]).index, "2");
  // headings arrive with markup and case variation
  assertEquals(actsFindPlot([{ index: 9, line: "PLOT  SUMMARY" }]).index, "9");
  assertEquals(actsFindPlot([{ index: 6, line: "Synopsis of Part One" }]).index, "6", "prefix match");
  assertEquals(actsFindPlot([{ index: 1, line: "Reception" }]), null, "no plot section at all");
  assertEquals(actsFindPlot([]), null);
  assertEquals(actsFindPlot(null), null);
});

Deno.test("cleanPlotText strips what textContent leaves behind", () => {
  assertEquals(actsClean("Plot [ edit ] Duke Leto[1] rules Caladan.[12]", "Plot"),
    "Duke Leto rules Caladan.");
  assertEquals(actsClean("He waits[citation needed] there.", null), "He waits there.");
  assertEquals(actsClean("a b   c", null), "a b c", "nbsp is not matched by \\s everywhere");
  assertEquals(actsClean("", null), "");
});

Deno.test("foldPlot keeps the ENDING — act 3 is grounded in it", () => {
  const head = "A".repeat(400) + ". ";
  const mid = "B".repeat(400) + ". ";
  const tail = "C".repeat(300) + " THE FINALE.";
  const folded = actsFold(head + mid + tail, 800);
  assert(folded.length <= 800 + 8, `fold overshot: ${folded.length}`);
  assert(folded.includes("THE FINALE"), "a plain slice() would have cut the ending off");
  assert(folded.startsWith("A"), "the opening survives too");
  assert(folded.includes("[…]"), "the drop is marked");
  // short input is returned untouched
  assertEquals(actsFold("short plot.", 800), "short plot.");
});

Deno.test("parseActs: the happy path splits on the markers", () => {
  const r = actsParse("[1]\nBeginning here.\n\n[2]\nMiddle here.\n\n[3]\nEnd here.");
  assertEquals(r.acts, ["Beginning here.", "Middle here.", "End here."]);
  assert(r.ok);
  assert(!r.truncated);
});

Deno.test("parseActs: a repeated marker mid-prose must not split the act", () => {
  const r = actsParse("[1] He counts [1] again and stops. [2] Then this. [3] Finally this.");
  assertEquals(r.acts[0], "He counts [1] again and stops.");
  assert(r.ok);
});

Deno.test("parseActs: a missing marker is NOT a partial success", () => {
  // This is the one that matters: a two-act answer must never be cached or shown as complete.
  const r = actsParse("[1] Only this. [2] And this.");
  assertEquals(r.ok, false);
  const empty = actsParse("");
  assertEquals(empty.ok, false);
});

Deno.test("parseActs: detects an answer cut mid-word by the token ceiling", () => {
  // Measured for real: level 3 ended "...джихад фременів, оскільки" and stopped.
  const cut = actsParse("[1] One. [2] Two. [3] It ends because he cannot stop the jihad, oskilky");
  assert(cut.truncated, "an unterminated final act is a stump, not a short answer");
  const whole = actsParse("[1] One. [2] Two. [3] It ends here.");
  assert(!whole.truncated);
  assert(!actsParse("[1] One. [2] Two. [3] He asks why?").truncated, "? terminates");
  assert(!actsParse("[1] One. [2] Two. [3] «Кінець»").truncated, "a closing quote terminates");
});

Deno.test("countSentences counts what the length budget is measured in", () => {
  assertEquals(actsCount("One. Two. Three."), 3);
  assertEquals(actsCount("One! Two? Three…"), 3);
  assertEquals(actsCount(""), 0);
});

Deno.test("actSignature: the level is part of the cache key", () => {
  // Without this the first level a book is opened at gets served for all three.
  assert(actsSig(190192, 1, "uk") !== actsSig(190192, 3, "uk"), "level must vary the key");
  assert(actsSig(190192, 1, "uk") !== actsSig(190192, 1, "en"), "locale must vary the key");
  assertEquals(actsSig(190192, 2, "uk"), actsSig(190192, 2, "uk"), "and it must be stable");
});

Deno.test("plotUpToClimax withholds the ending — a prompt alone did not", () => {
  // Measured leak this exists to close: told the ending was hidden, the model still answered indirect
  // questions with the climax. If it never receives the last quarter, it cannot leak it.
  const body = Array.from({ length: 60 }, (_, i) => `Event ${i} happens.`).join(" ");
  const full = body + " AND THEN THE HERO DIES AT THE END.";
  const cut = actsUpToClimax(full);
  assert(!cut.includes("THE HERO DIES"), "the ending survived the cut");
  assert(cut.length < full.length, "nothing was cut at all");
  assert(cut.length > full.length * 0.5, `cut far too aggressive: ${cut.length}/${full.length}`);
  assert(/\.$/.test(cut), "the cut left a half sentence");
  // a plot too short to have a separable third act is returned whole rather than mangled
  assertEquals(actsUpToClimax("A short plot."), "A short plot.");
  assertEquals(actsUpToClimax(""), "");
});
