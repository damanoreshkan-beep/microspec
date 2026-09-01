/* @ts-self-types="./localize.d.ts" */
/**
 * Systemic "localize body text" hook: drives the two-stage translate → polish pipeline for body prose and
 * reports ONE `pending` flag so an app holds a skeleton until the final text is ready. Fail-open (reveals the
 * best text after a timeout) and a settled passthrough under the gate. Exports `useLocalized`.
 * @module
 */
// microspec runtime — systemic "localize body text" hook.
//
// Body prose from an API is first translated (translate.js, free gtx) and then lightly rewritten to read
// naturally (ai.js, server-side LLM). Both stages are async and fail-open. Without coordination the UI shows
// the half-finished intermediate popping in — English, then the wooden machine translation, then the natural
// rewrite. This hook drives that two-stage pipeline and reports ONE `pending` flag so an app can hold an
// animated skeleton UNTIL the final (translated + polished) text is ready, and only then reveal it.
//
//   const { text, pending } = useLocalized(reading, locale);
//   ... pending ? <Skeleton/> : <p>{text}</p>
//
// Guarantees:
//   • Fail-open — it never hangs on a skeleton: after `timeout` (offline / an endpoint down) it reveals the
//     best text available so far (polished › translated › original), and upgrades in place if a later stage
//     still lands.
//   • Under the gate (shot / e2e) it is a passthrough — settled immediately, no network — so renders stay
//     deterministic. This is why the app itself no longer needs a gate guard around warm()/warmPolish().
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
  useStore(trTick);                                              // re-render when a translation lands…
  useStore(aiTick);                                             // …and again when its natural rewrite lands
  const src = typeof text === "string" ? text.trim() : "";
  const translated = tr(src, locale);
  const finalText = polish(translated, locale);
  // "done" = nothing left to wait for: no text, the content language, the gate, or both stages already cached.
  const done = !src || locale === CONTENT_LANG || gate || (isTranslated(src, locale) && isPolished(translated, locale));

  const [revealed, setRevealed] = useState(done);
  // Stage 1 (translate) + the fail-open reveal timer. Resets whenever the source text or locale changes.
  useEffect(() => {
    if (done) { setRevealed(true); return; }
    setRevealed(false);
    warm([src], locale);
    const timer = setTimeout(() => setRevealed(true), timeout);
    return () => clearTimeout(timer);
  }, [src, locale, done]);
  // Stage 2 (polish) — kicks in once the translation itself has landed (translated ≠ the original source).
  useEffect(() => {
    if (!gate && translated && translated !== src) warmPolish([translated], locale);
  }, [translated, locale]);

  const ready = done || revealed;
  return { text: ready ? finalText : "", pending: !ready };
}
