import { atom } from "nanostores";

export const metaTick = atom(0);

const mem = new Map();      
const pending = new Set();  

function cache() {
  if (mem.__loaded) return mem;
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:meta") || "{}"); } catch {  }
  for (const k in obj) mem.set(k, obj[k]);
  mem.__loaded = true;
  return mem;
}
function persist() {
  try { localStorage.setItem("ms:meta", JSON.stringify(Object.fromEntries(mem))); } catch {  }
}

export function enrich(url) {
  if (typeof url !== "string" || !url) return null;
  return cache().get(url) || null;
}

async function fetchMeta(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch("https://r.jina.ai/" + url, { signal: ctrl.signal, headers: { Accept: "application/json", "X-Timeout": "8" } });
    if (!r.ok) throw new Error("status " + r.status);
    const d = (await r.json())?.data || {};
    const description = String(d.description || "").replace(/\s+/g, " ").trim();
    if (!description) throw new Error("no description");
    return { description };
  } finally { clearTimeout(t); }
}

async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export async function warmMeta(urls) {
  const c = cache();
  const todo = [...new Set((urls || []).filter((u) => typeof u === "string" && u && !c.has(u) && !pending.has(u)))];
  if (!todo.length) return;
  todo.forEach((u) => pending.add(u));
  let changed = false;
  await pool(todo, 5, async (u) => {
    try { c.set(u, await fetchMeta(u)); changed = true; }
    catch {  }
    finally { pending.delete(u); }
  });
  if (changed) { persist(); metaTick.set(metaTick.get() + 1); }
}
