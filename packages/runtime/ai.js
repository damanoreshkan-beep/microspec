// microspec runtime — systemic AI text polish.
//
// Machine translation (translate.js, the free gtx endpoint) is literal and often reads wooden. This module
// takes such text and asks a server-side LLM — via POST /feed/ai on our VPS proxy (Gemini primary, Groq
// fallback, the key held server-side) — to LIGHTLY rewrite it into natural, fluent prose in the SAME
// language, preserving the meaning of every sentence. It is a *systemic* capability: any app can call
// polish() on API-derived body text that reads awkwardly after translation.
//
// Same shape as translate.js, and for the same reasons:
//   • polish(text, locale) is a SYNC cache read used inside render; warmPolish() is the async side that fills
//     the cache and bumps `aiTick` so subscribed components re-render when a rewrite arrives.
//   • Fail-open: a miss (not yet fetched, offline, endpoint down, no key configured) returns the input
//     unchanged. The reading is always shown; the polish is an enhancement, never a dependency.
//   • The content language (en) is a passthrough — the English source is the original, not a translation.
//   • Every unique string is polished once and cached permanently in localStorage (keyed by locale), so a
//     repeat load (and the saved tab) is instant and offline-friendly.
import { atom } from "nanostores";
import { pool, VPS_PROXY } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";

const AI = `${VPS_PROXY}/ai`;

// Bumped whenever new rewrites land in the cache → components that `useStore(aiTick)` re-render.
export const aiTick = atom(0);

const mem = new Map();       // locale → { [source]: polished }
const pending = new Set();   // `${locale} ${source}` currently in flight (dedupe concurrent warms)

function cacheFor(locale) {
  if (mem.has(locale)) return mem.get(locale);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + locale) || "{}"); } catch { /* private mode / bad json */ }
  mem.set(locale, obj);
  return obj;
}
function persist(locale, obj) {
  try { localStorage.setItem("ms:ai:" + locale, JSON.stringify(obj)); } catch { /* quota / private mode — mem cache still works */ }
}

// polish(text, locale) — synchronous. Returns the cached natural rewrite, or the input on a miss / passthrough.
export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor(locale)[text] || text;
}

async function polishOne(text, locale) {
  const r = await fetch(AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, locale }),
  });
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  const out = (j && typeof j.text === "string") ? j.text.trim() : "";
  return out || text;
}

// warmPolish(texts, locale) — rewrite every not-yet-cached string, then bump aiTick once. No-op for the
// content language or when everything is already cached (so it's cheap to call on every render/effect). Low
// concurrency — the free LLM tiers rate-limit, and the volume here is tiny (a handful of readings per user).
export async function warmPolish(texts, locale) {
  if (!locale || locale === CONTENT_LANG) return;
  const cache = cacheFor(locale);
  const todo = [...new Set(
    (texts || []).filter((s) => typeof s === "string" && s.trim() && !(s in cache) && !pending.has(locale + " " + s)),
  )];
  if (!todo.length) return;
  todo.forEach((s) => pending.add(locale + " " + s));
  let changed = false;
  await pool(todo, 2, async (src) => {
    try { cache[src] = await polishOne(src, locale); changed = true; }
    catch { /* fail-open: leave uncached so a later warm can retry */ }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist(locale, cache); aiTick.set(aiTick.get() + 1); }
}
