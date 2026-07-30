import { askAI, cacheFor, persist, pending, aiTick, reading } from "./ai-core.js";
import { pool } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";


export async function suggest(mode, spark, locale) {
  try { return (await askAI(String(spark || ""), locale, mode)).text; }
  catch { return ""; }
}


export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor("", locale)[text] || text;
}

export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor("", locale);
}

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
export const summary = SUM.get;
export const isSummarized = SUM.has;
export const warmSummary = SUM.warm;

export { aiTick };
