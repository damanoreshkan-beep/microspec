import { atom } from "nanostores";
import { viaProxy } from "./feed.js";

export const metaTick = atom(0);

function hfReadmeDesc(md) {
  let t = String(md || "").replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, ""); 
  if (/access to (model|this repo|the model) .*is restricted/i.test(t.slice(0, 400))) return ""; 
  const out = [];
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line) { if (out.length) break; else continue; }                  
    if (/^(#|!\[|<|\[!|\||-{3,}|={3,}|>|\*\s|-\s|\d+\.\s)/.test(line)) continue; 
    const s = line.replace(/!\[[^\]]*\]\([^)]*\)/g, "")                    
                  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                 
                  .replace(/<[^>]+>/g, "")                                 
                  .replace(/https?:\/\/\S+/g, "")                          
                  .replace(/[*`_]/g, "").replace(/\s+/g, " ").trim();      
    if (s.length < 20) continue;
    out.push(s);
    if (out.join(" ").length > 220) break;
  }
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, 340);
}

const RESOLVERS = {
  "huggingface.co": async (url) => {
    const m = url.match(/^https?:\/\/huggingface\.co\/([^/?#]+\/[^/?#]+)/); 
    if (!m) return null;                                                    
    const md = await viaProxy(`https://huggingface.co/${m[1]}/raw/main/README.md`, (x) => typeof x === "string" && x.length > 0, 12000);
    const description = hfReadmeDesc(md);
    if (!description) throw new Error("no card");                           
    return { description };
  },
};

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
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {  }
  const resolver = RESOLVERS[host];
  if (resolver) { const r = await resolver(url); if (r) return r; }   
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
