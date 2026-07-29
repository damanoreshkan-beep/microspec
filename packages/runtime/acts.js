// microspec runtime — the pure logic behind `arc`: deciding what is a book, finding the plot, folding it
// to fit a prompt, and parsing the three acts back out. No DOM, no fetch, no rendering — all of it is
// unit-tested in runtime_test.js, because every one of these rules was derived from a measurement and a
// wrong constant here fails silently (a dropped genre, a lost ending, a stump of an act).
// See apps/arc/RESEARCH.md for the census and the measurements each table comes from.

// ── what counts as a book ────────────────────────────────────────────────────────────────────────────────
// Derived from a P31 census over 39 known books, NOT guessed. A bare "literary work" allowlist covers only
// 34/39 and silently drops every work of non-fiction (Sapiens, Educated, A Room of One's Own are typed
// `written work`) and anything catalogued as its series (The Hunger Games).
export const BOOK_TYPES = new Set([
  "Q7725634",    // literary work        — 34/39
  "Q47461344",   // written work         — non-fiction
  "Q571",        // book
  "Q8261",       // novel
  "Q1667921",    // novel series         — The Hunger Games
  "Q13593966",   // literary trilogy
  "Q7725310",    // series of creative works
  "Q49084",      // short story
  "Q25379",      // play
  "Q5185279",    // poem
  "Q49100005",   // banned book          — only ever co-occurs, never alone
  "Q1279564",    // short story collection
  "Q149537",     // memoir
]);

// Types that positively mean "not the book" even when the entity also looks work-shaped. A film adaptation
// shares its title with the novel and is the single most likely wrong pick — uk `Там, де співають раки`
// resolves to the film, whose plot section summarises the wrong work entirely.
export const NOT_BOOK_TYPES = new Set([
  "Q11424",      // film
  "Q5",          // human
  "Q4167410",    // Wikimedia disambiguation page
  "Q22808320",   // Wikimedia human name disambiguation page
  "Q13406463",   // Wikimedia list article
  "Q482994",     // album
  "Q5398426",    // television series
  "Q7889",       // video game
  "Q196600",     // media franchise
  "Q1985406",    // television film
]);

// isBook(claims) — `claims` is the shape wbgetentities gives us, already reduced to
// { p31: string[], hasAuthor: bool, hasDate: bool }.
// Primary signal is the type allowlist. The secondary signal exists because Wikidata typing is uneven:
// P50 (author) is on 38/39 books and P577 (date) on 38/39, while films carry P57 (director) not P50, and
// humans and disambiguation pages carry neither — so an untyped work with both is still a book.
export function isBook(claims) {
  const p31 = claims?.p31 || [];
  if (p31.some((t) => NOT_BOOK_TYPES.has(t))) return false;
  if (p31.some((t) => BOOK_TYPES.has(t))) return true;
  return !!(claims?.hasAuthor && claims?.hasDate);
}

// ── finding the plot section ─────────────────────────────────────────────────────────────────────────────
// Observed across 28 sampled articles: Plot (10), Plot summary (9), Synopsis (2), plus a long tail. Ordered
// by preference — "Plot summary" beats "Synopsis" when an article somehow carries both.
export const PLOT_HEADINGS = [
  "plot", "plot summary", "synopsis", "plot introduction", "summary",
  "story", "storylines", "plot outline", "features of plotline", "contents",
];

const norm = (s) => String(s || "").toLowerCase().replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim();

// findPlotSection(sections) → { index, line } | null.
// `sections` is the array `action=parse&prop=sections` returns ({ index, line, level }).
// Resolve BY NAME, never by a remembered number: on Dune (novel) the Plot section moved from index 2 to
// index 3 between two revisions 4 minutes apart, and `section=Plot` is rejected as `invalidsection`.
// A cached index is only valid alongside the revid it was read at.
export function findPlotSection(sections) {
  const list = (sections || []).filter((s) => s && s.index != null && s.line);
  for (const want of PLOT_HEADINGS) {
    const hit = list.find((s) => norm(s.line) === want);
    if (hit) return { index: String(hit.index), line: hit.line };
  }
  // nothing exact — accept a heading that STARTS with a plot word ("Plot (novel)", "Synopsis of Part One")
  for (const want of PLOT_HEADINGS) {
    const hit = list.find((s) => norm(s.line).startsWith(want + " "));
    if (hit) return { index: String(hit.index), line: hit.line };
  }
  return null;
}

// ── cleaning ─────────────────────────────────────────────────────────────────────────────────────────────
// The DOM half (removing <sup>/<style>/<table> before reading textContent) belongs to the app, because it
// needs a real parser. This is the text half, and it is where the silent corruptions live: citation
// markers survive as "[12]", the section heading arrives with its "[edit]" affordance attached, and
// non-breaking spaces are not matched by \s in every engine.
export function cleanPlotText(text, heading) {
  let s = String(text || "")
    .replace(/ /g, " ")
    .replace(/\[\s*(edit|\d+|citation needed|nb \d+|[a-z])\s*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (heading) {                                     // the heading itself leads the section HTML
    const h = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp("^" + h + "\\s*", "i"), "");
  }
  return s.trim();
}

// ── folding a long plot to fit the prompt ────────────────────────────────────────────────────────────────
// Plots run to 16 448 characters (Crime and Punishment). A plain `slice(0, max)` would cut off the END of
// the book — which is exactly what act [3] has to be grounded in, so the model would be forced to invent
// the finale. Keep the head AND the tail and drop from the middle, which act [2] can best afford to lose.
export function foldPlot(text, max = 20000, headShare = 0.6) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const gap = " […] ";
  const budget = max - gap.length;
  const head = Math.floor(budget * headShare);
  const tail = budget - head;
  // cut on a sentence boundary where one is near, so neither half starts or ends mid-clause
  const cutHead = s.lastIndexOf(". ", head);
  const cutTail = s.indexOf(". ", s.length - tail);
  const a = s.slice(0, cutHead > head * 0.8 ? cutHead + 1 : head);
  const b = s.slice(cutTail !== -1 && cutTail < s.length - tail * 0.8 ? cutTail + 2 : s.length - tail);
  return a + gap + b;
}

// ── parsing the model's answer ───────────────────────────────────────────────────────────────────────────
// The contract is three blocks each opening with a bare [1] / [2] / [3] marker. A delimiter beats JSON here
// because the free HF Gradio fallback returns plain text, and a model that fumbles JSON returns nothing
// usable at all — whereas a fumbled marker still leaves readable prose to salvage.
const MARK = /\[\s*([123])\s*\]/g;

// parseActs(text) → { acts: [string, string, string], ok, truncated }
// `ok` is false when fewer than three markers were found — the caller must not cache or show a partial
// answer as if it were complete. `truncated` catches an answer cut mid-word by the token ceiling: the
// provider also reports this, but a local check costs nothing and covers the fallback providers too.
export function parseActs(text) {
  const s = String(text || "").trim();
  const found = [];
  let m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(s)) !== null) found.push({ n: Number(m[1]), at: m.index, end: MARK.lastIndex });
  // keep the FIRST occurrence of each marker — a model that repeats "[1]" mid-prose must not split the act
  const first = new Map();
  for (const f of found) if (!first.has(f.n)) first.set(f.n, f);
  const marks = [1, 2, 3].map((n) => first.get(n)).filter(Boolean);
  if (marks.length < 3) return { acts: [s, "", ""], ok: false, truncated: false };
  const acts = marks.map((mk, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].at : s.length;
    return s.slice(mk.end, stop).trim();
  });
  const last = acts[2];
  const truncated = last.length > 0 && !/[.!?…"»)]$/.test(last);
  return { acts, ok: acts.every((a) => a.length > 0), truncated };
}

// countSentences(text) — used by the gate and by the length readout. Abbreviations are not a concern here:
// the input is generated prose, not scanned text.
export function countSentences(text) {
  return String(text || "").split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 1).length;
}

// actSignature(...) — the cache key for one retelling. Stable across sessions and independent of the plot
// text (which can change under us as the article is edited), so a re-read hits cache. The level MUST be in
// here: the same book at a different length is a different answer.
export function actSignature(pageid, level, locale) {
  return `${pageid}|${level}|${locale}`;
}

// ── withholding the ending from the chat ─────────────────────────────────────────────────────────────────
// The reader can ask questions about the book, and while the ending is still locked those answers must not
// give it away. Instructing the model not to is NOT enough — measured: told the ending was hidden, it still
// answered "what happens to Feyd-Rautha?" with the climactic duel and its outcome, and "the fate of Irulan"
// with Paul taking the throne. Two of three indirect questions leaked. A prompt is a soft filter over a
// source that contains the answer.
//
// So the fix is structural: while locked, the model never receives the ending at all. The cut is at 72% of
// the plot text because the third plot point — "all is lost", where act III begins — sits at ~75% of a
// story, and an encyclopaedic plot section is chronological, so its last quarter is the story's last
// quarter. Cutting slightly early is the safe direction.
export function plotUpToClimax(text, share = 0.72) {
  const s = String(text || "").trim();
  if (s.length < 400) return s;                       // too short to have a separable third act
  const cut = Math.floor(s.length * share);
  const dot = s.lastIndexOf(". ", cut);               // never end mid-sentence
  return s.slice(0, dot > cut * 0.7 ? dot + 1 : cut).trim();
}
