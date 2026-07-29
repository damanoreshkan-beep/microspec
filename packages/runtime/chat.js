// microspec runtime — the pure logic behind a GROUNDED CONVERSATION (arc's reader talking about one book).
// No DOM, no fetch, no rendering: folding a thread to fit the wire, and turning a thread into a stable cache
// signature. Unit-tested in runtime_test.js, because both rules fail silently when they are wrong — a bad
// fold drops the grounding a whole answer depends on, and a bad signature serves one conversation's reply
// inside another.
//
// A single question box became a conversation for a concrete reason: the questions this is FOR presuppose
// one. "І що б персонаж сказав мені, якби я йому розповів?" — told him what? That sentence only means
// anything as turn two. See apps/arc/RESEARCH.md §6.

// ── the wire shape ───────────────────────────────────────────────────────────────────────────────────────
// A turn is { r: "u" | "a", t: string } — deliberately terse, because a thread rides on every request and
// this is the one payload that grows without bound as a reader keeps talking.
export const asked = (t) => ({ r: "u", t: String(t || "").trim() });
export const answered = (t) => ({ r: "a", t: String(t || "").trim() });

// groundBook({ title, byline, plot }) — the grounding block the FIRST reader turn is prepended with. The
// labels are Ukrainian because they address the model, not the reader: the acts prompt is written in the
// target language for output quality and this is the same wire, not UI text (nothing here is ever rendered,
// so it is deliberately NOT an i18n string).
export function groundBook({ title, byline, plot }) {
  const head = [title, byline].filter(Boolean).join(" — ");
  return `КНИГА: ${head}\n\nСЮЖЕТ:\n${String(plot || "").trim()}`;
}

// ── folding a thread ─────────────────────────────────────────────────────────────────────────────────────
// The request body is capped (40 000 on the edge) and the plot alone runs to 16 448 characters, so the thread
// gets a budget of its own and the OLDEST turns go first — the reverse of the plot fold, where the tail is
// what act [3] needs. In a conversation the recent turns carry the pronouns ("а якби я ЙОМУ сказав"), and the
// book itself is re-sent whole every time, so nothing that matters is lost by forgetting the start.
//
// Two invariants the edge relies on, and one it cannot fix: what survives must OPEN on a reader turn (the
// grounding is prepended to it, and an exchange that starts on the model's own reply misattributes the plot),
// and the LAST turn must be the reader's (it is the one being answered). A fold that dropped the last turn
// would answer the previous question and cache it under the new one's key.
export const THREAD_CHARS = 6000, THREAD_TURNS = 12;

export function foldThread(turns, maxChars = THREAD_CHARS, maxTurns = THREAD_TURNS) {
  let list = (Array.isArray(turns) ? turns : [])
    .filter((x) => x && typeof x.t === "string" && x.t.trim())
    .map((x) => ({ r: x.r === "a" ? "a" : "u", t: x.t.trim() }));
  if (!list.length) return [];
  list = list.slice(-maxTurns);
  let used = list.reduce((a, x) => a + x.t.length, 0);
  while (list.length > 1 && used > maxChars) used -= list.shift().t.length;
  while (list.length > 1 && list[0].r !== "u") list.shift();
  // A single surviving turn must still be the reader's — if the tail is one enormous answer there is nothing
  // to ask, and sending it would have the model reply to itself.
  return list[0].r === "u" ? list : [];
}

// ── the cache signature ──────────────────────────────────────────────────────────────────────────────────
// The same words asked after a different exchange are a different question, so the WHOLE prefix joins the
// key — not just the last turn. FNV-1a over the joined turns keeps that bounded: a key that embedded the
// thread verbatim would grow past what localStorage can hold as a conversation ran on.
export function hashTurns(turns) {
  const s = (Array.isArray(turns) ? turns : []).map((x) => (x?.r || "u") + ":" + (x?.t || "")).join("");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// askSignature(pageid, level, locked, locale, turns) — the cache key for ONE reply.
// `locked` belongs in it because a locked reading is grounded on less of the book, so the same question
// genuinely has two different honest answers; `level` because it changes the answer without changing the
// input, the lesson the acts ladder already paid for.
export function askSignature(pageid, level, locked, locale, turns) {
  return `${pageid}|${level}|${locked ? "L" : "O"}|${locale}|${hashTurns(turns)}`;
}
