import { assert, assertEquals } from "jsr:@std/assert@1";
import { hookOf, flushUsage, installUsage, CENSUS_MS, MAX_KEYS, bumpOpen, rankOpens, frequent, OPENS_KEY, HALF_LIFE_DAYS, REOPEN_MS } from "../usage.js";

/** The smallest thing that behaves like the DOM nodes hookOf walks: tag, attributes, parentElement. */
const node = (attrs, parent = null, tagName = "DIV") => ({
  tagName,
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  parentElement: parent,
  getAttribute: (n) => attrs[n] ?? null,
});
const button = (attrs, parent = null) => node(attrs, parent, "BUTTON");

Deno.test("hookOf: the data-* name of the control, without the prefix and without the value", () => {
  assertEquals(hookOf(button({ "data-montage": "" })), "montage");
  assertEquals(hookOf(button({ "data-chunk": "7" })), "chunk", "the NAME is the census key; the value never is");
});

Deno.test("hookOf: walks up from the icon inside the button to the element that carries the hook", () => {
  const btn = button({ "data-generate": "", class: "btn" });
  const icon = node({ class: "icon" }, btn);
  assertEquals(hookOf(icon), "generate");
});

Deno.test("hookOf: the app's hook on the button beats the kit's own attribute on the span inside it", () => {
  const pill = button({ "data-length": "15" });
  const label = node({ "data-seg-label": "" }, pill);
  assertEquals(hookOf(label), "length");
});

Deno.test("hookOf: role=tab and role=button count as controls, not just real buttons", () => {
  const tab = node({ "data-tab-clips": "", role: "tab" });
  assertEquals(hookOf(node({ class: "inner" }, tab)), "tab-clips");
});

Deno.test("hookOf: with no interactive ancestor the nearest hook is still better than nothing", () => {
  const card = node({ "data-row": "" });
  assertEquals(hookOf(node({ class: "text" }, card)), "row");
});

Deno.test("hookOf: the runtime's own machinery attributes are not controls", () => {
  assertEquals(hookOf(node({ "data-haptic": "bump" })), "", "haptics are how a control feels, not what it is");
  assertEquals(hookOf(node({ "data-theme": "dark" })), "");
  const both = node({ "data-haptic": "bump", "data-share": "" });
  assertEquals(hookOf(both), "share");
});

Deno.test("hookOf: nothing to name, and a node with no attributes at all", () => {
  assertEquals(hookOf(node({ class: "wrap" })), "");
  assertEquals(hookOf(null), "");
  assertEquals(hookOf({}), "");
});

Deno.test("hookOf: the walk is bounded, so a deep tree cannot cost a tap its frame", () => {
  let el = node({ "data-root": "" });
  for (let i = 0; i < 20; i++) el = node({ class: "x" }, el);
  assertEquals(hookOf(el), "", "beyond the hop limit the tap is simply uncounted");
});

Deno.test("flushUsage + installUsage: inert without a document, and silent with nothing to say", () => {
  let fetched = 0; const real = globalThis.fetch;
  globalThis.fetch = () => { fetched++; return Promise.resolve(new Response("")); };
  try { installUsage(null); flushUsage(); } finally { globalThis.fetch = real; }
  assertEquals(fetched, 0, "a census with no taps sends nothing, and report() is a no-op in tests anyway");
});

const DAY = 86400000, T0 = 20000 * DAY + 3600000;

Deno.test("bumpOpen + rankOpens: the app opened most leads, and the order is stable on a tie", () => {
  let m = null;
  for (const id of ["reel", "fonoteka", "fonoteka", "remix", "fonoteka", "reel"]) m = bumpOpen(m, id, T0);
  assertEquals(rankOpens(m, T0), [{ id: "fonoteka", score: 3 }, { id: "reel", score: 2 }, { id: "remix", score: 1 }]);
  m = bumpOpen(m, "arc", T0);
  assertEquals(rankOpens(m, T0).slice(2).map((x) => x.id), ["arc", "remix"], "equal scores order by id, not by insertion");
});

Deno.test("bumpOpen + rankOpens: an open weighs half after the half-life, so this week's habit passes last month's", () => {
  let m = null;
  for (let i = 0; i < 4; i++) m = bumpOpen(m, "old", T0);
  assertEquals(rankOpens(m, T0 + HALF_LIFE_DAYS * DAY)[0], { id: "old", score: 2 });
  const later = T0 + 2 * HALF_LIFE_DAYS * DAY;
  m = bumpOpen(m, "new", later); m = bumpOpen(m, "new", later);
  assertEquals(rankOpens(m, later).map((x) => x.id), ["new", "old"], "4 opens a month ago = 1 today; 2 opens today lead");
  assertEquals(m.old, [1, Math.floor(later / DAY)], "a bump rewrites every score as of today");
});

Deno.test("bumpOpen + rankOpens: a habit long gone is forgotten, and a broken record is read as empty", () => {
  const m = bumpOpen(bumpOpen(null, "gone", T0), "here", T0 + 80 * DAY);
  assertEquals(Object.keys(m), ["here"], "one open 80 days ago is under the floor and leaves the record");
  assertEquals(rankOpens({ a: "x", b: [0, 1], c: [-2, 1], d: null }, T0), []);
  assertEquals(rankOpens(null), []);
  assertEquals(bumpOpen({ a: "x" }, "", T0), {}, "no app id, nothing gained");
  assertEquals(frequent(), [], "outside a browser there is no record");
});

Deno.test("opens: the record's contract", () => {
  assertEquals(OPENS_KEY, "ms:opens");
  assertEquals(HALF_LIFE_DAYS, 14);
  assertEquals(REOPEN_MS, 1800000);
});

Deno.test("budget: the roll-up is slow and the key count is capped", () => {
  assertEquals(CENSUS_MS, 120000);
  assertEquals(MAX_KEYS, 40);
  assert(CENSUS_MS >= 60000, "a census that flushed often would be the stream it exists to avoid");
});
