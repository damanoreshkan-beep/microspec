import { atom } from "nanostores";
import { pool, VPS_PROXY } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";

const AI = `${VPS_PROXY}/ai`;

export const aiTick = atom(0);

const mem = new Map();       
const pending = new Set();   

function cacheFor(locale) {
  if (mem.has(locale)) return mem.get(locale);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + locale) || "{}"); } catch {  }
  mem.set(locale, obj);
  return obj;
}
function persist(locale, obj) {
  try { localStorage.setItem("ms:ai:" + locale, JSON.stringify(obj)); } catch {  }
}

export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor(locale)[text] || text;
}

export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor(locale);
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
    catch {  }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist(locale, cache); aiTick.set(aiTick.get() + 1); }
}
