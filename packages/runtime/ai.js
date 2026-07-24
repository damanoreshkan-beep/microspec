// microspec runtime — systemic AI text helpers (server-side LLM via POST /feed/ai, key held on the VPS).
//
// Two *systemic* capabilities any app can reuse:
//   • polish(text, locale) — machine translation (translate.js gtx) is literal and reads wooden; this LIGHTLY
//     rewrites it into natural, fluent prose in the SAME language, meaning preserved. Content language (en)
//     is a passthrough (the English source is the original, not a translation).
//   • summary(key, locale) — collapse a STRUCTURED block of facts (e.g. a tarot spread: positions + cards +
//     meanings) into one short, cohesive reading in the active locale. Not a passthrough — even `en` is
//     synthesised. Keyed by a stable signature of the input, not the input text, so the same draw hits cache.
//
// Same shape as translate.js, and for the same reasons: the getter is a SYNC cache read used inside render;
// the warm*() side is async, fills the cache and bumps `aiTick` so subscribers re-render when a result lands.
// Fail-open everywhere: a miss (not fetched, offline, endpoint down, no key) returns the input / "" — the app
// is always usable; the AI is an enhancement, never a dependency. Every result is cached permanently in
// localStorage (keyed by locale), so a repeat view is instant and offline-friendly.
import { atom } from "nanostores";
import { pool, VPS_PROXY } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";

const AI = `${VPS_PROXY}/ai`;

// Bumped whenever a new result lands in any cache → components that `useStore(aiTick)` re-render.
export const aiTick = atom(0);

const pending = new Set();   // `${tag}` currently in flight (dedupe concurrent warms across both capabilities)

// One localStorage-backed cache per (namespace, locale). polish uses ns "" (unchanged key `ms:ai:<loc>` — no
// re-warm of existing caches); summary uses ns "sum" (`ms:ai:sum:<loc>`).
const mem = new Map();
function cacheFor(ns, locale) {
  const k = ns ? ns + ":" + locale : locale;
  if (mem.has(k)) return mem.get(k);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch { /* private mode / bad json */ }
  mem.set(k, obj);
  return obj;
}
function persist(ns, locale, obj) {
  const k = ns ? ns + ":" + locale : locale;
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch { /* quota / private mode — mem cache still works */ }
}

// The one wire call. `mode` selects the server-side system prompt ("polish" | "summarize").
async function askAI(text, locale, mode) {
  const r = await fetch(AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, text, locale }),
  });
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  return (j && typeof j.text === "string") ? j.text.trim() : "";
}

// ── suggest: a one-shot CREATIVE generation for the "surprise me" prompt buttons ─────────────────────────

// suggest(mode, spark, locale) — generate a fresh prompt line on demand (the wand button in imagine/retouch).
// Unlike polish/summary this is deliberately UNCACHED — every tap returns a new line — so `spark` (a random
// seed phrase the caller supplies) drives the variety. mode "dream" → a vivid scene prompt; "edit" → a short
// photo-edit instruction. Returns the generated text in the active locale, or "" on any failure (the caller
// keeps the field unchanged). Never called under the gate (no network). The image models want English, but we
// generate in-locale for a native feel and let translate.js/toEnglish convert it at send time.
export async function suggest(mode, spark, locale) {
  try { return await askAI(String(spark || ""), locale, mode); }
  catch { return ""; }
}

// ── polish: a light rewrite of wooden machine translation ────────────────────────────────────────────────

// polish(text, locale) — synchronous. Returns the cached natural rewrite, or the input on a miss / passthrough.
export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor("", locale)[text] || text;
}

// isPolished(text, locale) — has this string already been rewritten + cached? (false while still in flight, so
// a caller can hold a loading state until the natural rewrite lands). Passthrough/empty count as done.
export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor("", locale);
}

// warmPolish(texts, locale) — rewrite every not-yet-cached string, then bump aiTick once. No-op for the
// content language or when everything is already cached (so it's cheap to call on every render/effect). Low
// concurrency — the free LLM tiers rate-limit, and the volume here is tiny (a handful of readings per user).
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
    try { const out = await askAI(src, locale, "polish"); cache[src] = out || src; changed = true; }
    catch { /* fail-open: leave uncached so a later warm can retry */ }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist("", locale, cache); aiTick.set(aiTick.get() + 1); }
}

// ── summary: synthesise a structured block of facts into one short reading ────────────────────────────────

// summary(key, locale) — synchronous. The cached short reading for this input signature, or "" on a miss.
export function summary(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("sum", locale)[key] || "";
}

// isSummarized(key, locale) — is the reading for this input signature already cached? (false while in flight).
export function isSummarized(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("sum", locale);
}

// warmSummary(key, text, locale) — summarise the structured `text` under a stable `key` (the input signature,
// so the same draw hits cache), then bump aiTick. Fail-open, deduped, one call. Unlike polish, `en` summarises
// too (the synthesis is the value, not a translation).
export async function warmSummary(key, text, locale) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("sum", locale);
  const tag = "sum " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try { const out = await askAI(text, locale, "summarize"); if (out) { cache[key] = out; persist("sum", locale, cache); aiTick.set(aiTick.get() + 1); } }
  catch { /* fail-open: leave uncached so a later warm can retry */ }
  finally { pending.delete(tag); }
}

// ── interpret: like summary, but a DOMAIN reading of structured facts (astrology transits) ────────────────
// Same on-demand, keyed-by-signature, cached, fail-open shape as summary — but a separate server mode
// ("astro", an astrologer prompt that reads ONLY the supplied positions + aspects, inventing nothing) and its
// own cache namespace ("astro") so an astrology reading never mixes with the tarot summarise prompt. Reusable
// by any app that turns a structured domain state into a grounded reading (e.g. the horoscope app later).

// interpret(key, locale) — synchronous. The cached reading for this input signature, or "" on a miss.
export function interpret(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("astro", locale)[key] || "";
}

// isInterpreted(key, locale) — is the reading for this signature already cached? (false while in flight).
export function isInterpreted(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("astro", locale);
}

// warmInterpret(key, text, locale) — interpret the structured `text` under a stable `key`, then bump aiTick.
// Fail-open, deduped, one wire call. Like summary, `en` interprets too (the synthesis is the value).
export async function warmInterpret(key, text, locale) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("astro", locale);
  const tag = "astro " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try { const out = await askAI(text, locale, "astro"); if (out) { cache[key] = out; persist("astro", locale, cache); aiTick.set(aiTick.get() + 1); } }
  catch { /* fail-open: leave uncached so a later warm can retry */ }
  finally { pending.delete(tag); }
}
