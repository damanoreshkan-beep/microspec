/* @ts-self-types="./ai-core.d.ts" */
/**
 * # runtime/ai-core.js — the wire, the cache, the dedupe and one tick under every AI capability
 *
 * The shared machinery under every AI capability in the farm: POST /feed/ai on the edge, the key held on
 * the VPS, never in a page. This file owns four things and no domain knowledge at all — the wire (one fetch,
 * one response shape, the `truncated` and `ungrounded` flags the provider sends back), the cache (one
 * localStorage-backed dict per namespace and locale, read synchronously), the in-flight set (two components
 * warming the same key make one request) and `aiTick` (one atom for the whole runtime, bumped when any
 * cache gains an entry). On top of them sits `reading(ns, mode)`, the reason the file exists: every cached
 * capability used to hand-write the same triple — a sync getter, a sync "is it there yet", an async warm —
 * and five copies had already drifted (two of them cached replies the provider had cut off mid-word, forever).
 * The factory ends that by construction: a stump is never cached anywhere now.
 *
 * ![ai-core: askAI on the wire, cacheFor per namespace and locale, pending, aiTick, and reading() binding them](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-ai-core.svg)
 *
 * ## Import
 * ```js
 * import { reading, aiTick } from "/_rt/ai-core.js";                    // an app's page: the import map resolves /_rt/
 * import { reading, aiTick } from "@microspec/core/runtime/ai-core.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link reading} — `reading(ns, mode)` → `{ get, has, warm }`: a cached, deduped, fail-open capability
 *   for one namespace and one server-side prompt.
 * - {@link aiTick} — the atom bumped whenever any cache gains an entry; `useStore(aiTick)` re-renders.
 * - {@link askAI} — `askAI(text, locale, mode, extra)` → `{ text, truncated, ungrounded }`; the one wire
 *   call, throws on a non-ok status.
 * - {@link cacheFor} — `cacheFor(ns, locale)` → the mutable cache dict, hydrated once from localStorage.
 * - {@link persist} — `persist(ns, locale, obj)` writes a dict back; a silent no-op on quota / private mode.
 * - {@link pending} — the global Set of in-flight tags.
 *
 * ## In practice
 * A domain module declares one capability per server mode and re-exports the triple under its own names.
 * From rt/ai-astro.js in the product farm:
 * ```js
 * import { reading, aiTick } from "@microspec/core/runtime/ai-core.js";   // rt/ai-astro.js
 *
 * // the whole sky on a date, against the chart
 * const SKY = reading("astro", "astro");
 * export const interpret = SKY.get;           // (key, locale) → the cached text, or "" on a miss
 * export const isInterpreted = SKY.has;       // (key, locale) → cached? false while in flight
 * export const warmInterpret = SKY.warm;      // (key, text, locale, extra) → fetch once, cache, bump aiTick
 * export { aiTick };
 * ```
 * A view calls `useStore(aiTick)`, renders `interpret(sig, loc)` and, in an effect, `warmInterpret(sig,
 * facts, loc)`; when the answer lands the tick bumps and the same sync getter now returns it.
 *
 * ## How it fits
 * Imports `atom` from nanostores and `VPS_PROXY` from feed.js (the sealed tunnel; the route is
 * `${VPS_PROXY}/ai`). ai-text.js builds the language capabilities (polish, suggest, summary) on it and
 * re-exports `aiTick`; in the product farm rt/ai-astro.js (seven readings) and rt/ai-books.js (`acts`, `ask`)
 * are pure `reading()` declarations. Apps reach it through those modules rather than directly — 7 farm apps
 * precache `/_rt/ai-core.js` (tarot, iching, horoscope, transit, arc, imagine, mirage).
 *
 * ## Invariants and pitfalls
 * - Sync getter + async warm is deliberate and stays: the getter is called inside render, so it cannot be a
 *   promise. The warm fills the cache and bumps `aiTick`; subscribers re-render.
 * - Fail-open everywhere: a miss returns "" and the app is fully usable. The AI is an enhancement, never a
 *   dependency — a thrown fetch leaves the key uncached so a later warm retries.
 * - `key` is the caller's stable signature of the input, not the input itself, and it must cover every value
 *   that changes the answer, `extra` included: a `level` sent to the server but left out of the key serves
 *   the first length asked for to all three.
 * - A `truncated` or `ungrounded` reply is never cached. The cache is permanent, and a stump in it is
 *   indistinguishable from a short answer; an empty sheet with a retry is the better bargain.
 * - One `aiTick` for the whole runtime. Split it per capability and a component watching one atom misses
 *   the other's answer.
 * - The namespace is part of the storage key (`ms:ai:<ns>:<locale>`). polish uses ns "" and so keeps its
 *   historic key `ms:ai:<loc>`; renaming a namespace silently discards every answer users already paid for.
 * @module
 */
// microspec runtime — the shared machinery under every AI capability (POST /feed/ai, key held on the VPS).
//
// This file owns four things and no domain knowledge at all:
//   • the wire            — one fetch, one response shape, the `truncated` flag the provider sends back;
//   • the cache           — one localStorage-backed dict per (namespace, locale), read SYNCHRONOUSLY;
//   • the in-flight set   — so two components warming the same key make one request;
//   • `aiTick`            — ONE atom for the whole runtime, bumped when any cache gains an entry.
//
// And it exposes `reading(ns, mode)`, which is the reason this file exists. Every cached capability was
// hand-writing the same three functions — a sync getter, a sync "is it there yet", and an async warm that
// dedupes, fails open and bumps the tick. Five copies of that triple is five places for the next one to
// drift, and the drift had already started: `acts`/`ask` refuse to cache a reply the provider marked
// `truncated`, `summary`/`interpret` did not, so a reply cut off mid-word could be cached FOREVER in two of
// the five. The factory ends that by construction — a stump is never cached anywhere now.
//
// Sync getter + async warm is deliberate and stays: the getter is called inside render, so it cannot be a
// promise; the warm side fills the cache and bumps `aiTick`, and subscribers re-render. Fail-open
// everywhere — a miss returns "" and the app is still fully usable, because the AI is an enhancement and
// never a dependency.
import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";

const AI = `${VPS_PROXY}/ai`;

// Bumped whenever a new result lands in ANY cache → components that `useStore(aiTick)` re-render. One atom
// for the whole runtime: split it per capability and a component watching one would miss the other's answer.
/** Atom bumped whenever any AI cache gains an entry; `useStore(aiTick)` re-renders the subscriber. */
export const aiTick = atom(0);

// `${tag}` currently in flight, shared across every capability so the dedupe is global.
/** Tags of requests currently in flight, shared across every capability so two warms of one key make one request. */
export const pending = new Set();

// One localStorage-backed cache per (namespace, locale). polish uses ns "" and therefore keeps its historic
// key `ms:ai:<loc>` — changing it would silently discard every rewrite a user has already paid for.
const mem = new Map();
/**
 * The cache dict for one (namespace, locale), read synchronously from memory or hydrated once from localStorage.
 * @param ns capability namespace ("" for polish, which keeps its historic key)
 * @param locale UI locale the entries were produced in
 * @returns the mutable cache object (key → text)
 */
export function cacheFor(ns, locale) {
  const k = ns ? ns + ":" + locale : locale;
  if (mem.has(k)) return mem.get(k);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch { /* private mode / bad json */ }
  mem.set(k, obj);
  return obj;
}
/**
 * Write a cache dict back to localStorage; silently a no-op on quota / private mode (the memory cache still works).
 * @param ns capability namespace ("" for polish)
 * @param locale UI locale
 * @param obj the cache object returned by `cacheFor`
 */
export function persist(ns, locale, obj) {
  const k = ns ? ns + ":" + locale : locale;
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch { /* quota / private mode — mem cache still works */ }
}

// The one wire call. `mode` selects the server-side system prompt; `extra` carries whatever else that mode
// needs in the body (`level`, `turns`, `locked`). Returns the text AND the two ways the server can tell us
// this answer is not worth keeping: `truncated` (it hit the token ceiling) and `ungrounded` (it named none
// of the factors it was given, and re-asking did not fix it). Both mean the same thing to the cache.
/**
 * The one wire call to the AI route; throws on a non-ok status.
 * @param text the input the server-side prompt works on
 * @param locale the language the answer should come back in
 * @param mode selects the server-side system prompt
 * @param extra extra body fields that mode needs (`level`, `turns`, `locked`)
 * @returns `{ text, truncated, ungrounded }` — the trimmed answer plus the two "not worth caching" flags
 */
export async function askAI(text, locale, mode, extra) {
  const r = await fetch(AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, text, locale, ...extra }),
  });
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  return { text: (j && typeof j.text === "string") ? j.text.trim() : "", truncated: !!(j && j.truncated), ungrounded: !!(j && j.ungrounded) };
}

// reading(ns, mode) → { get, has, warm } — a cached, deduped, fail-open synthesis capability.
//
//   get(key, locale)                  sync: the cached text, or "" on a miss
//   has(key, locale)                  sync: is it cached? (false while in flight)
//   warm(key, text, locale, extra)    async: fetch once, cache, bump aiTick
//
// `key` is the caller's stable SIGNATURE of the input, not the input itself — same facts, same key, one
// request. It must cover every value that can change the answer, `extra` included: a `level` that is sent to
// the server but left out of the key serves the first length asked for to all three.
/**
 * Build a cached, deduped, fail-open synthesis capability for one namespace and server mode.
 * @param ns cache namespace (also the in-flight tag prefix)
 * @param mode the server-side system prompt this capability asks for
 * @returns `{ get, has, warm }` — sync getter, sync "is it cached", async fetch-once-and-cache
 */
export function reading(ns, mode) {
  const get = (key, locale) => (typeof key === "string" && key && locale) ? (cacheFor(ns, locale)[key] || "") : "";
  const has = (key, locale) => (typeof key === "string" && key && locale) ? (key in cacheFor(ns, locale)) : false;
  const warm = async (key, text, locale, extra) => {
    if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
    const cache = cacheFor(ns, locale);
    const tag = ns + " " + locale + " " + key;
    if (key in cache || pending.has(tag)) return;
    pending.add(tag);
    try {
      const { text: out, truncated, ungrounded } = await askAI(text, locale, mode, extra);
      // A reply cut off mid-word is indistinguishable from a short one once it is in the cache, and the
      // cache is permanent. Leave it out: a miss retries, a cached stump never does. `ungrounded` is the
      // same bargain for the other failure — a reading that named none of its factors survived the server's
      // corrective pass, and thirty days of serving it is worse than one empty sheet with a retry on it.
      if (out && !truncated && !ungrounded) { cache[key] = out; persist(ns, locale, cache); aiTick.set(aiTick.get() + 1); }
    } catch { /* fail-open: leave uncached so a later warm can retry */ }
    finally { pending.delete(tag); }
  };
  return { get, has, warm };
}
