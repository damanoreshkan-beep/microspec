import { atom } from "nanostores";
import { pool, VPS_PROXY } from "./feed.js";
import { CONTENT_LANG } from "./translate.js";

const AI = `${VPS_PROXY}/ai`;

export const aiTick = atom(0);

const pending = new Set();   

const mem = new Map();
function cacheFor(ns, locale) {
  const k = ns ? ns + ":" + locale : locale;
  if (mem.has(k)) return mem.get(k);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch {  }
  mem.set(k, obj);
  return obj;
}
function persist(ns, locale, obj) {
  const k = ns ? ns + ":" + locale : locale;
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch {  }
}

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


export async function suggest(mode, spark, locale) {
  try { return await askAI(String(spark || ""), locale, mode); }
  catch { return ""; }
}


export function polish(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return text;
  return cacheFor("", locale)[text] || text;
}

export function isPolished(text, locale) {
  if (typeof text !== "string" || !text.trim() || !locale || locale === CONTENT_LANG) return true;
  return text in cacheFor("", locale);
}

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
    catch {  }
    finally { pending.delete(locale + " " + src); }
  });
  if (changed) { persist("", locale, cache); aiTick.set(aiTick.get() + 1); }
}


export function summary(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("sum", locale)[key] || "";
}

export function isSummarized(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("sum", locale);
}

export async function warmSummary(key, text, locale) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("sum", locale);
  const tag = "sum " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try { const out = await askAI(text, locale, "summarize"); if (out) { cache[key] = out; persist("sum", locale, cache); aiTick.set(aiTick.get() + 1); } }
  catch {  }
  finally { pending.delete(tag); }
}


export function interpret(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("astro", locale)[key] || "";
}

export function isInterpreted(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("astro", locale);
}

export async function warmInterpret(key, text, locale) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("astro", locale);
  const tag = "astro " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try { const out = await askAI(text, locale, "astro"); if (out) { cache[key] = out; persist("astro", locale, cache); aiTick.set(aiTick.get() + 1); } }
  catch {  }
  finally { pending.delete(tag); }
}


export function acts(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("acts", locale)[key] || "";
}

export function isActed(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("acts", locale);
}

export async function warmActs(key, text, locale, level) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("acts", locale);
  const tag = "acts " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try {
    const r = await fetch(AI, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "acts", text, locale, level: Math.min(3, Math.max(1, Number(level) || 2)) }),
    });
    if (!r.ok) throw new Error("status " + r.status);
    const j = await r.json();
    const out = (j && typeof j.text === "string") ? j.text.trim() : "";
    if (out && !j.truncated) { cache[key] = out; persist("acts", locale, cache); aiTick.set(aiTick.get() + 1); }
  } catch {  }
  finally { pending.delete(tag); }
}


export function answer(key, locale) {
  if (typeof key !== "string" || !key || !locale) return "";
  return cacheFor("ask", locale)[key] || "";
}

export function isAnswered(key, locale) {
  if (typeof key !== "string" || !key || !locale) return false;
  return key in cacheFor("ask", locale);
}

export async function warmAsk(key, text, locale, { level = 2, locked = false } = {}) {
  if (typeof key !== "string" || !key || typeof text !== "string" || !text.trim() || !locale) return;
  const cache = cacheFor("ask", locale);
  const tag = "ask " + locale + " " + key;
  if (key in cache || pending.has(tag)) return;
  pending.add(tag);
  try {
    const r = await fetch(AI, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "ask", text, locale, locked, level: Math.min(3, Math.max(1, Number(level) || 2)) }),
    });
    if (!r.ok) throw new Error("status " + r.status);
    const j = await r.json();
    const out = (j && typeof j.text === "string") ? j.text.trim() : "";
    if (out && !j.truncated) { cache[key] = out; persist("ask", locale, cache); aiTick.set(aiTick.get() + 1); }
  } catch {  }
  finally { pending.delete(tag); }
}
