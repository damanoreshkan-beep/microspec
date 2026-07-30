// microspec runtime — the LANGUAGE capabilities: rewrite it, invent it, or collapse it.
//
//   • polish(text, locale)   — machine translation (translate.js gtx) is literal and reads wooden; this
//     LIGHTLY rewrites it into natural prose in the SAME language, meaning preserved. The content language
//     (en) is a passthrough: the English source is the original, not a translation.
//   • suggest(mode, spark)   — a one-shot CREATIVE line for the "surprise me" wand (imagine/retouch).
//     Deliberately UNCACHED: every tap must return something new, so the caller's random `spark` drives the
//     variety rather than a cache key.
//   • summary(key, locale)   — collapse a STRUCTURED block of facts (a tarot spread: positions + cards +
//     meanings) into one short cohesive reading. Not a passthrough — even `en` is synthesised.
//
// Everything shared (the wire, the caches, the dedupe, aiTick) lives in ai-core.js.
import { askAI, cacheFor, persist, pending, aiTick, reading } from "./ai-core.js";
import { pool } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";

// ── suggest: a one-shot creative generation, never cached ────────────────────────────────────────────────

// suggest(mode, spark, locale) — mode "dream" → a vivid scene prompt; "edit" → a short photo-edit
// instruction. Returns "" on any failure (the caller keeps the field unchanged). Never called under the
// gate (no network). The image models want English, but we generate in-locale for a native feel and let
// translate.js/toEnglish convert it at send time.
export async function suggest(mode, spark, locale) {
  try { return (await askAI(String(spark || ""), locale, mode)).text; }
  catch { return ""; }
}

// ── polish: a light rewrite of wooden machine translation ────────────────────────────────────────────────
//
// The odd one out, and it stays hand-written rather than going through `reading()`: it is keyed by the
// SOURCE TEXT itself (not a signature), it warms a BATCH with bounded concurrency, and a failure caches the
// input so the app shows the literal translation rather than nothing.

// polish(text, locale) — synchronous. The cached natural rewrite, or the input on a miss / passthrough.
export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor("", locale)[text] || text;
}

// isPolished(text, locale) — already rewritten and cached? (false while still in flight, so a caller can
// hold a loading state until the natural rewrite lands). Passthrough/empty count as done.
export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor("", locale);
}

// warmPolish(texts, locale) — rewrite every not-yet-cached string, then bump aiTick once. No-op for the
// content language or when everything is already cached, so it is cheap to call on every render/effect.
// Low concurrency — the free LLM tiers rate-limit and the volume here is tiny.
export async function warmPolish(texts, locale) {
  if (!locale || locale === CONTENT_LANG) return;
  const cache = cacheFor("", locale);
  const todo = [...new Set(
    (texts || []).filter((s) => typeof s === "string" && s.trim() && !(s in cache) && !pending.has(locale + " " + s)),
  )];
  if (!todo.length) return;
  todo.forEach((s) => pending.add(locale + " " + s));
  let changed = false;
  await pool(todo, 2, async (src) => {
    try { const { text: out } = await askAI(src, locale, "polish"); cache[src] = out || src; changed = true; }
    catch { /* fail-open: leave uncached so a later warm can retry */ }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist("", locale, cache); aiTick.set(aiTick.get() + 1); }
}

// ── summary: structured facts → one short reading ────────────────────────────────────────────────────────

const SUM = reading("sum", "summarize");
export const summary = SUM.get;
export const isSummarized = SUM.has;
export const warmSummary = SUM.warm;

export { aiTick };
