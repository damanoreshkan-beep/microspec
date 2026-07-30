import { atom } from "nanostores";
import { VPS_PROXY } from "./feed.js";

const AI = `${VPS_PROXY}/ai`;

export const aiTick = atom(0);

export const pending = new Set();

const mem = new Map();
export function cacheFor(ns, locale) {
  const k = ns ? ns + ":" + locale : locale;
  if (mem.has(k)) return mem.get(k);
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:ai:" + k) || "{}"); } catch {  }
  mem.set(k, obj);
  return obj;
}
export function persist(ns, locale, obj) {
  const k = ns ? ns + ":" + locale : locale;
  try { localStorage.setItem("ms:ai:" + k, JSON.stringify(obj)); } catch {  }
}

export async function askAI(text, locale, mode, extra) {
  const r = await fetch(AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, text, locale, ...extra }),
  });
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  return { text: (j && typeof j.text === "string") ? j.text.trim() : "", truncated: !!(j && j.truncated) };
}

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
      const { text: out, truncated } = await askAI(text, locale, mode, extra);
      if (out && !truncated) { cache[key] = out; persist(ns, locale, cache); aiTick.set(aiTick.get() + 1); }
    } catch {  }
    finally { pending.delete(tag); }
  };
  return { get, has, warm };
}
