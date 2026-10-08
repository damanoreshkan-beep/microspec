/* @ts-self-types="./ai-core.d.ts" */
/**
 * # runtime/ai-core.js — the wire, the cache, the dedupe and one tick under every AI capability
 *
 * The shared machinery under every AI capability in the farm: /feed/ai on the edge, run as a TASK (POST
 * /feed/task, the answer read from the task's stream — a dead zone mid-answer costs a pause, not the answer),
 * the key held on the VPS, never in a page. This file owns four things and no domain knowledge at all — the wire
 * (one task, one response shape, the `truncated` and `ungrounded` flags the provider sends back), the cache (one
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
import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";
import { authWall } from "./authwall.js";


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
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch { }
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
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch { }
}

/**
 * The one wire call to the AI route, as an edge task with no deadline; throws `Error("status N")` (with `.status`)
 * on a refusal or a failed answer — a 401 also bumps `authWall`, as the tunnel used to.
 * @param text the input the server-side prompt works on
 * @param locale the language the answer should come back in
 * @param mode selects the server-side system prompt
 * @param extra extra body fields that mode needs (`level`, `turns`, `locked`)
 * @returns `{ text, truncated, ungrounded }` — the trimmed answer plus the two "not worth caching" flags
 */
export async function askAI(text, locale, mode, extra) {
  const j = await taskCall("/feed/ai", { mode, text, locale, ...extra });
  return { text: (j && typeof j.text === "string") ? j.text.trim() : "", truncated: !!(j && j.truncated), ungrounded: !!(j && j.ungrounded) };
}

// ── the wire: the AI call as a TASK (owner, 2026-10-08: «переведи і ШІ-запити теж») ─────────────────────────────
// A model cascade answers after up to two minutes; one POST held for that long lost the answer to any dead zone and
// the retry started the cascade over. Now the edge runs it as a task (edge jobtask.js DIRECT route): the start
// carries a tap key (a re-sent start is the same task), and the answer is read from the task's Durable Stream by
// long-poll (durablestreams.com §5.7 — "everything after offset N"), so a dropped poll costs a pause, never the
// answer. A tiny reader of the protocol, not the 40 KB client: the AI only ever wants its one `result`.
const AT = (ms) => new Promise((go) => {
  const done = () => { clearTimeout(t); globalThis.removeEventListener?.("online", done); go(); };
  const t = setTimeout(done, ms);
  globalThis.addEventListener?.("online", done, { once: true });   // the network back ends the pause early
});
const pace = (n) => AT(Math.min(15_000, 1000 * 2 ** n));
const failed = (status, why) => { if (status === 401) authWall.set(authWall.get() + 1); return Object.assign(new Error("status " + status), { status, why }); };
const final = (s) => s >= 400 && s < 500 && s !== 408 && s !== 429;

async function taskCall(route, body) {
  const k = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  let id = "";
  for (let n = 0; !id; n++) {
    try {
      const r = await fetch(`${VPS_PROXY}/task`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route, body, k }) });
      if (r.ok) { id = String((await r.json())?.id || ""); if (id) break; }
      else if (final(r.status)) throw failed(r.status);
    } catch (e) { if (e?.status) throw e; }
    await pace(n);
  }
  let offset = "-1", cursor = "";
  for (let n = 0; ;) {
    let r, events = null;
    try {
      r = await fetch(`${VPS_PROXY}/task/${id}?offset=${encodeURIComponent(offset)}&live=long-poll${cursor ? `&cursor=${cursor}` : ""}`);
      if (r.status === 404) throw failed(404);
      if (r.status === 200) events = await r.json();
      else if (r.status !== 204) throw new Error("poll " + r.status);
    } catch (e) { if (e?.status) throw e; await pace(n++); continue; }
    n = 0;
    for (const ev of events || []) {
      if (ev.t === "result") return ev.body;
      if (ev.t === "fail") throw failed(ev.status || 502, ev.error);
    }
    offset = r.headers.get("stream-next-offset") || offset;
    cursor = r.headers.get("stream-cursor") || "";
    if (r.headers.get("stream-closed") === "true") throw failed(502, "no result");
  }
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
    } catch { }
    finally { pending.delete(tag); }
  };
  return { get, has, warm };
}
