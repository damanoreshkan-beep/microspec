/* @ts-self-types="./localize.d.ts" */
/**
 * Systemic "localize body text" hook: drives the two-stage translate → polish pipeline for body prose and
 * reports ONE `pending` flag so an app holds a skeleton until the final text is ready. Fail-open (reveals the
 * best text after a timeout) and a settled passthrough under the gate. Exports `useLocalized`.
 * @module
 */
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { tr, warm, trTick, isTranslated, CONTENT_LANG } from "./translate.js";
import { polish, warmPolish, aiTick, isPolished } from "./ai-text.js";
import { gate } from "./gate.js";

/**
 * Preact hook: translate + polish `text` for `locale` and report one `pending` flag until the final text is
 * ready (or the fail-open timeout reveals the best text so far).
 * @param text source prose (non-strings are treated as empty)
 * @param locale target locale
 * @param options `timeout` — ms before the hook reveals whatever is available (default 6000)
 * @returns `{ text, pending }` — the text to render (empty while pending) and whether a skeleton should hold
 */
export function useLocalized(text, locale, { timeout = 6000 } = {}) {
  useStore(trTick);                                              
  useStore(aiTick);                                             
  const src = typeof text === "string" ? text.trim() : "";
  const translated = tr(src, locale);
  const finalText = polish(translated, locale);
  const done = !src || locale === CONTENT_LANG || gate || (isTranslated(src, locale) && isPolished(translated, locale));

  const [revealed, setRevealed] = useState(done);
  useEffect(() => {
    if (done) { setRevealed(true); return; }
    setRevealed(false);
    warm([src], locale);
    const timer = setTimeout(() => setRevealed(true), timeout);
    return () => clearTimeout(timer);
  }, [src, locale, done]);
  useEffect(() => {
    if (!gate && translated && translated !== src) warmPolish([translated], locale);
  }, [translated, locale]);

  const ready = done || revealed;
  return { text: ready ? finalText : "", pending: !ready };
}
