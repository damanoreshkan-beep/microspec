/* @ts-self-types="./ai-text.d.ts" */
/**
 * The LANGUAGE capabilities on top of ai-core: `polish` (lightly rewrite wooden machine translation into
 * natural prose, same language), `suggest` (a one-shot creative line, deliberately uncached) and `summary`
 * (collapse a structured block of facts into one short reading), each with its sync "is it there yet" and
 * async warm. Re-exports `aiTick` so a view can subscribe without importing ai-core.
 * @module
 */
import { askAI, cacheFor, persist, pending, aiTick, reading } from "./ai-core.js";
import { pool } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";


/**
 * One-shot creative generation for the "surprise me" wand; never cached, "" on any failure.
 * @param mode "dream" (a vivid scene prompt) or "edit" (a short photo-edit instruction)
 * @param spark the caller's random seed text that drives variety
 * @param locale the language to generate in
 * @returns the generated line, or "" so the caller keeps its field unchanged
 */
export async function suggest(mode, spark, locale) {
  try { return (await askAI(String(spark || ""), locale, mode)).text; }
  catch { return ""; }
}


/**
 * The cached natural rewrite of a machine-translated string, synchronously.
 * @param text the literal translation to look up
 * @param locale the UI locale it was translated into
 * @returns the rewrite, or the input on a miss / for the content language
 */
export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor("", locale)[text] || text;
}

/**
 * Whether a string's rewrite is already cached (false while still in flight).
 * @param text the literal translation
 * @param locale the UI locale
 * @returns true when cached, empty, or a content-language passthrough
 */
export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor("", locale);
}

/**
 * Rewrite every not-yet-cached string in a batch (concurrency 2), then bump `aiTick` once.
 * @param texts the literal translations to warm
 * @param locale the UI locale; a no-op for the content language
 */
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
    catch {  }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist("", locale, cache); aiTick.set(aiTick.get() + 1); }
}


const SUM = reading("sum", "summarize");
/** Sync: the cached reading for a facts signature `key` in `locale`, or "" on a miss. */
export const summary = SUM.get;
/** Sync: whether a reading for `key` in `locale` is cached (false while in flight). */
export const isSummarized = SUM.has;
/** Async: synthesise the reading for `key` from `text` once, cache it and bump `aiTick`. */
export const warmSummary = SUM.warm;

/** Re-exported from ai-core so views subscribe to one atom without a second import. */
export { aiTick } from "./ai-core.js";
