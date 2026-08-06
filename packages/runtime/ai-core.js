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
export const aiTick = atom(0);

// `${tag}` currently in flight, shared across every capability so the dedupe is global.
export const pending = new Set();

// One localStorage-backed cache per (namespace, locale). polish uses ns "" and therefore keeps its historic
// key `ms:ai:<loc>` — changing it would silently discard every rewrite a user has already paid for.
const mem = new Map();
export function cacheFor(ns, locale) {
  const k = ns ? ns + ":" + locale : locale;
  if (mem.has(k)) return mem.get(k);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch { /* private mode / bad json */ }
  mem.set(k, obj);
  return obj;
}
export function persist(ns, locale, obj) {
  const k = ns ? ns + ":" + locale : locale;
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch { /* quota / private mode — mem cache still works */ }
}

// The one wire call. `mode` selects the server-side system prompt; `extra` carries whatever else that mode
// needs in the body (`level`, `turns`, `locked`). Returns the text AND the two ways the server can tell us
// this answer is not worth keeping: `truncated` (it hit the token ceiling) and `ungrounded` (it named none
// of the factors it was given, and re-asking did not fix it). Both mean the same thing to the cache.
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
