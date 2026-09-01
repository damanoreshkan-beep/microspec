/**
 * # runtime/ai-text.js — the language capabilities: rewrite it, invent it, or collapse it
 *
 * Three ways to ask the farm's AI route for words, each on the shared machinery in ai-core.js. `polish`
 * takes the literal, wooden output of machine translation (translate.js gtx) and lightly rewrites it into
 * natural prose in the SAME language, meaning preserved — the content language (en) is a passthrough
 * because the English source is the original, not a translation. `suggest` is a one-shot creative line for
 * the "surprise me" wand, deliberately uncached so every tap returns something new. `summary` collapses a
 * structured block of facts (a tarot spread: positions, cards, meanings) into one short cohesive reading,
 * and is not a passthrough — even `en` is synthesised. Everything shared (the wire, the caches, the dedupe,
 * `aiTick`) lives in ai-core.js; this file is the domain-free language layer.
 *
 * ![ai-text: polish, suggest and summary on top of ai-core's wire and caches](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-ai-text.svg)
 *
 * ## Import
 * ```js
 * import { summary, warmSummary, isSummarized, aiTick } from "/_rt/ai-text.js";                    // an app's page: the import map resolves /_rt/
 * import { polish, warmPolish, isPolished } from "@microspec/core/runtime/ai-text.js";             // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link polish} — `polish(text, locale)` sync: the cached natural rewrite, or the input on a miss / for the
 *   content language.
 * - {@link isPolished} — `isPolished(text, locale)` sync: cached, empty or passthrough → true; false while in
 *   flight.
 * - {@link warmPolish} — `warmPolish(texts, locale)` async: rewrite every not-yet-cached string (concurrency
 *   2), bump `aiTick` once; a no-op for the content language.
 * - {@link suggest} — `suggest(mode, spark, locale)` async: "dream" (a vivid scene prompt) or "edit" (a short
 *   photo-edit instruction); "" on any failure, never cached.
 * - {@link summary} — `summary(key, locale)` sync: the cached reading for a facts signature, or "".
 * - {@link isSummarized} — `isSummarized(key, locale)` sync: cached? false while in flight.
 * - {@link warmSummary} — `warmSummary(key, text, locale, extra)` async: synthesise once, cache, bump `aiTick`.
 * - {@link aiTick} — re-exported from ai-core so a view subscribes to one atom without a second import.
 *
 * ## In practice
 * The synthesis sheet in the tarot app: subscribe to the tick, warm on open, render the sync getter, and
 * stop the skeleton with a retry when nothing has landed in ~12 s.
 * ```js
 * import { summary, warmSummary, isSummarized, aiTick } from "/_rt/ai-text.js";   // apps/tarot/view.js
 *
 * function SynthSheet({ open, sig, input, loc }) {
 *   useStore(aiTick);
 *   const [failed, setFailed] = useState(false);
 *   const run = () => { setFailed(false); warmSummary(sig, input, loc); return setTimeout(() => setFailed(!isSummarized(sig, loc)), 12000); };
 *   useEffect(() => {
 *     if (!open || gate || isSummarized(sig, loc)) return;
 *     const timer = run();
 *     return () => clearTimeout(timer);
 *   }, [open, sig, loc]);
 *   const done = gate || isSummarized(sig, loc);
 *   const text = gate ? GATE_SUMMARY[loc] : summary(sig, loc);
 *   // …a skeleton until `done`, then the text; `failed` offers a retry that calls run() again
 * }
 * ```
 * The wand in mirage is the uncached path: `const out = await suggest(mode === "make" ? "dream" : "edit",
 * spark, loc); if (out) setText(out);` — the caller's random `spark` drives the variety.
 *
 * ## How it fits
 * `summary` / `isSummarized` / `warmSummary` are exactly `reading("sum", "summarize")` from ai-core;
 * `polish` is the odd one out and stays hand-written — it is keyed by the source text itself (not a
 * signature), warms a batch with bounded concurrency through `pool` from feed.js, and on failure caches the
 * input so the app shows the literal translation rather than nothing. The module imports `askAI`,
 * `cacheFor`, `persist`, `pending`, `aiTick`, `reading` from ai-core.js, `pool` from feed.js and
 * `CONTENT_LANG` from translate.js. localize.js imports the polish triple and `aiTick` to run
 * the natural-prose pass over translated UI. In the farm 5 apps import it directly — tarot and iching
 * (summary), imagine and mirage (suggest, in view.js and imagine/edit.js), horoscope — and every localized
 * app reaches `polish` through localize.js.
 *
 * ## Invariants and pitfalls
 * - `suggest` is never cached, on purpose: a cached "surprise" is not one. It is also never called under the
 *   gate (no network) — the caller keeps its field unchanged on "".
 * - The image models want English, but `suggest` generates in-locale for a native feel; translate.js
 *   `toEnglish` converts at send time.
 * - polish is a passthrough for `CONTENT_LANG`: `polish` returns the input and `isPolished` is true, so
 *   English never spends a request.
 * - polish's cache is `ms:ai:<loc>` (ns ""), the historic key. Changing it would silently discard every
 *   rewrite users already paid for.
 * - `warmPolish` is cheap to call on every render/effect: it filters to the not-cached, not-in-flight set and
 *   returns early when that set is empty. Concurrency is 2 because the free LLM tiers rate-limit.
 * - `summary` is synthesised even for `en`; do not short-circuit it the way polish does.
 * - The `key` for `summary` is a stable signature of the facts, not the facts — same draw, same key, one
 *   request; and a `truncated` / `ungrounded` reply is never cached (ai-core's rule).
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/ai-text.js — edit the JSDoc there, never this file.
/**
 * One-shot creative generation for the "surprise me" wand; never cached, "" on any failure.
 * @param mode "dream" (a vivid scene prompt) or "edit" (a short photo-edit instruction)
 * @param spark the caller's random seed text that drives variety
 * @param locale the language to generate in
 * @returns the generated line, or "" so the caller keeps its field unchanged
 */
export function suggest(mode: any, spark: any, locale: any): Promise<any>;
/**
 * The cached natural rewrite of a machine-translated string, synchronously.
 * @param text the literal translation to look up
 * @param locale the UI locale it was translated into
 * @returns the rewrite, or the input on a miss / for the content language
 */
export function polish(text: any, locale: any): any;
/**
 * Whether a string's rewrite is already cached (false while still in flight).
 * @param text the literal translation
 * @param locale the UI locale
 * @returns true when cached, empty, or a content-language passthrough
 */
export function isPolished(text: any, locale: any): boolean;
/**
 * Rewrite every not-yet-cached string in a batch (concurrency 2), then bump `aiTick` once.
 * @param texts the literal translations to warm
 * @param locale the UI locale; a no-op for the content language
 */
export function warmPolish(texts: any, locale: any): Promise<void>;
/** Sync: the cached reading for a facts signature `key` in `locale`, or "" on a miss. */
export const summary: any;
/** Sync: whether a reading for `key` in `locale` is cached (false while in flight). */
export const isSummarized: any;
/** Async: synthesise the reading for `key` from `text` once, cache it and bump `aiTick`. */
export const warmSummary: any;
