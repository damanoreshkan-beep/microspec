// microspec runtime — the BOOK capabilities (apps/arc): retell a plot, then talk about it.
//
//   • acts(key, locale)   — a book's plot re-segmented into three narrative ACTS at a chosen length. The
//     input is real encyclopaedic plot prose, so the model is re-segmenting a source rather than retelling
//     from its own memory of the book.
//   • answer(key, locale) — a grounded CONVERSATION inside that one book's world. The only capability in
//     the farm that takes free user text, so the server prompt is hard-scoped (see edge/ai-prompts.js).
//
// Both carry a `level` 1|2|3 that changes the answer WITHOUT changing the input text, which is the whole
// reason the caller's signature must include it — send the level to the server but leave it out of the key
// and the first length a book is read at is served for all three. `ask` goes further: the reply depends on
// the entire exchange, so the caller's signature hashes the folded thread (packages/runtime/chat.js), not
// the question alone.
//
// See apps/arc/RESEARCH.md for the measured sentence/character ladder behind the levels.
import { reading, aiTick } from "./ai-core.js";

const clamp = (level) => Math.min(3, Math.max(1, Number(level) || 2));

const ACTS = reading("acts", "acts");
export const acts = ACTS.get;
export const isActed = ACTS.has;
// warmActs(key, text, locale, level) — `text` is the real plot prose to re-segment.
export const warmActs = (key, text, locale, level) => ACTS.warm(key, text, locale, { level: clamp(level) });

const ASK = reading("ask", "ask");
export const answer = ASK.get;
export const isAnswered = ASK.has;
// warmAsk(key, text, turns, locale, { level, locked }) — `text` is the grounding block (book header +
// plot), `turns` the folded thread ENDING on the reader. `locked` carries the app's spoiler state: while
// the ending is still under lock in the UI the answer must not give it away either, or the lock is theatre.
export const warmAsk = (key, text, turns, locale, { level = 2, locked = false } = {}) =>
  (Array.isArray(turns) && turns.length)
    ? ASK.warm(key, text, locale, { turns, locked, level: clamp(level) })
    : Promise.resolve();

export { aiTick };
