/* @ts-self-types="./ai-core.d.ts" */
/**
 * The shared machinery under every AI capability (POST /feed/ai, key held on the VPS): the one wire call
 * (`askAI`), the localStorage-backed cache per (namespace, locale) (`cacheFor`, `persist`), the global
 * in-flight set (`pending`), the single `aiTick` atom, and `reading(ns, mode)` — the factory that turns those
 * into a cached, deduped, fail-open sync-get / async-warm capability so no domain module hand-writes the triple.
 * @module
 */
import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";

const AI = `${VPS_PROXY}/ai`;

/** Atom bumped whenever any AI cache gains an entry; `useStore(aiTick)` re-renders the subscriber. */
export const aiTick = atom(0);

/** Tags of requests currently in flight, shared across every capability so two warms of one key make one request. */
export const pending = new Set();

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
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch {  }
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
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch {  }
}

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
      if (out && !truncated && !ungrounded) { cache[key] = out; persist(ns, locale, cache); aiTick.set(aiTick.get() + 1); }
    } catch {  }
    finally { pending.delete(tag); }
  };
  return { get, has, warm };
}
