/**
 * # runtime/translate.js — dynamic body translation: a sync cache read at render, an async warm behind it
 *
 * UI chrome is translated at author time through the i18n dicts. This module handles the *body*: text that
 * arrives from an API (Hacker News titles, a tarot card's meaning) and is therefore in the source language
 * regardless of the user's locale. When a spec declares `translate: ["title", ...]` the runtime shows those
 * item fields in the active locale. The lesson behind the shape is render-time, not load-time: the ORIGINAL
 * text is what gets stored (fav, localStorage) and translated, never the translated copy, so a bookmark saved
 * in UK still restores its English original when the user switches to EN and the fav list re-localizes with
 * the rest of the UI. `tr` is a synchronous cache read used inside render; `warm` is the async side that fills
 * the cache and bumps `trTick` so subscribed components re-render when translations arrive. Fail-open by
 * design: a miss returns the original, so the app is always readable and translation is an enhancement, never a
 * dependency. Backend is the free keyless Google `gtx` endpoint reached through `viaProxy()` like any other
 * CORS-blocked source; every unique string is translated once and cached permanently in localStorage.
 *
 * ![The translate module map: original text → tr (sync cache) at render, warm (async, 6 in flight) filling the cache and bumping trTick, toEnglish in its own bucket, all fail-open](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-translate.svg)
 *
 * ## Import
 * ```js
 * import { tr, warm, trTick } from "/_rt/translate.js";                    // an app's page: the import map resolves /_rt/
 * import { tr, warm, trTick } from "@microspec/core/runtime/translate.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link CONTENT_LANG} — `"en"`, the language the source APIs speak; a target equal to it is a passthrough.
 * - {@link trTick} — a nanostores `atom(0)` bumped whenever new translations land; `useStore(trTick)` re-renders on it.
 * - {@link tr} — `tr(text, target)` → string, synchronous: the cached translation or `text` itself on a miss, passthrough, empty or non-string input.
 * - {@link isTranslated} — `isTranslated(text, target)` → boolean: true once cached (or passthrough / empty); false while still in flight, so a caller can hold a loading state.
 * - {@link warm} — `warm(texts, target)` → Promise: translates every not-yet-cached string (6 in flight, de-duplicated against concurrent warms), persists, bumps `trTick` once if anything landed. No-op for the content language or when nothing is missing.
 * - {@link toEnglish} — `toEnglish(text)` → Promise<string>: any-language user text INTO English for the image models — Latin-script text passes untouched, otherwise gtx (`sl=auto`) then the edge's `english` mode; cached in its own `ms:tr:_en` bucket; THROWS (`code: "eTranslate"`) when no English could be had, so a caller never sends a non-Latin prompt to a Space.
 * - {@link rememberEnglish} — `rememberEnglish(local, en)`: seed the `_en` bucket with a pair the AI wrote itself (ai-text.js `suggestPrompt`), so the prompt shown in the reader's language sends as the model's own English, never a machine round-trip.
 *
 * ## In practice
 * ```js
 * import { useStore } from "@nanostores/preact";
 * import { tr, warm, trTick } from "/_rt/translate.js";
 *
 * function Spread({ S, drawn, seed }) {
 *   const loc = useStore(S.locale);
 *   useStore(trTick);                                              // re-render as translations land
 *   useEffect(() => { warm(drawn.map(meaningOf), loc); }, [seed, loc]);
 *   return drawn.map((d) => html`<p>${tr(meaningOf(d), loc)}</p>`);   // apps/tarot/view.js
 * }
 *
 * // A prompt for an image model, in whatever language the user typed it — English or nothing:
 * let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail(mode, run, e.code || "eTranslate"); }   // apps/mirage/state.js
 * ```
 *
 * ## How it fits
 * Imports `atom` from `nanostores`, `viaProxy`, `isJsonArray`, `pool` from `feed.js` — the same proxy and
 * concurrency pool every CORS-blocked source uses — and `askAI` from `ai-core.js` for the edge's `english`
 * mode behind gtx. Three runtime modules build on it: `render.js` (the spec's `translate: [...]` fields),
 * `localize.js` (translate → polish under one `pending` flag) and `ai-text.js` (`CONTENT_LANG`,
 * `rememberEnglish`). 4 farm apps import it directly — tarot (`tr`/`warm`/`trTick` for card meanings), imagine,
 * mirage and vydyvo (`toEnglish` for image prompts); every list app with a `translate` spec field reaches it through render.js.
 *
 * ## Invariants and pitfalls
 * - Translate at render, never at load: mutating items in `load()` would bake one locale into persisted data.
 *   Store the original; `tr()` it where it is drawn.
 * - `tr()` is sync and never fetches. Pair it with `warm()` in an effect and `useStore(trTick)` in the
 *   component, or the translation lands in the cache and nothing repaints.
 * - Fail-open for READING (`tr`/`warm`): a miss, offline, a down endpoint or a non-array response returns the
 *   original text; a failed string is left uncached so a later `warm()` retries it. Fail-CLOSED for SENDING
 *   (`toEnglish`): a prompt that could not be made English throws rather than reaching a Space (2026-09-03).
 * - `warm()` de-duplicates in-flight strings across concurrent calls (`pending`) and runs 6 at a time through
 *   `pool`; it bumps `trTick` once per call, only when something new landed.
 * - The cache lives in `localStorage` under `ms:tr:<target>` (mirrored in memory); private mode or quota
 *   failures degrade to the in-memory map for the session.
 * - `toEnglish` skips the wire for Latin-script text, auto-detects the source (`sl=auto`) otherwise, falls back
 *   to the edge's `english` mode, and keeps its own `ms:tr:_en` bucket keyed by the source text — the bucket
 *   `rememberEnglish` seeds with the AI's own {local → en} pairs so a suggested prompt never round-trips.
 * - Targets equal to `CONTENT_LANG` ("en") are a passthrough — `tr` returns the input, `isTranslated` is true,
 *   `warm` returns immediately.
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/translate.js — edit the JSDoc there, never this file.
/**
 * Synchronous cache read for use inside render: the cached translation of `text`, or `text` itself on a
 * miss or passthrough.
 * @param text the original (source-language) string
 * @param target the active locale code
 * @returns the translated string when cached, otherwise the original
 */
export function tr(text: any, target: any): any;
/**
 * Whether `text` already has a cached translation for `target` (false while still in flight, so a caller
 * can show a loading state); passthrough and empty strings count as done.
 * @param text the original string
 * @param target the active locale code
 * @returns true when nothing is left to fetch for this string
 */
export function isTranslated(text: any, target: any): boolean;
/**
 * Translate user text into English for the image models: Latin-script text passes untouched; otherwise gtx,
 * then the edge's `english` mode; cached in the `ms:tr:_en` bucket.
 * @param text the user's prompt in any language
 * @returns the English text (the input itself for Latin-script or non-string input)
 * @throws an Error with `code: "eTranslate"` when no English could be had — never returns non-Latin text
 */
export function toEnglish(text: any): Promise<any>;
/**
 * Seed the English bucket with a pair the AI wrote itself: `toEnglish(local)` then answers `en` at once.
 * @param local the prompt as shown to the reader, in their language
 * @param en the same prompt in English, from the same model call
 */
export function rememberEnglish(local: any, en: any): void;
/**
 * Translate every not-yet-cached string in `texts` (6 in flight at a time, de-duplicated against concurrent
 * warms), persist the cache and bump `trTick` once if anything landed. Cheap no-op when nothing is missing.
 * @param texts the original strings to translate
 * @param target the active locale code
 */
export function warm(texts: any, target: any): Promise<void>;
/** The language the source APIs speak ("en"); a target equal to this is a passthrough. */
export const CONTENT_LANG: "en";
/** Counter atom bumped whenever new translations land, so components subscribed to it re-render. */
export const trTick: any;
/** True when the text carries no letter outside the Latin script — what an image Space can read as-is. */
export function isLatin(text: any): boolean;
