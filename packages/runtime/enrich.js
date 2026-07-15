// microspec runtime — link enrichment (article previews).
//
// Link-feed APIs (Hacker News, launches, …) give a title + URL but no preview text. A card that is just
// a title is "raw" — the runtime forbids it (see validate.js: a feed card must declare a preview slot).
// This module fills that slot: given an item's outbound URL it fetches the article's description once and
// exposes it as a virtual field the card renders.
//
// Same shape as translate.js — and for the same reasons:
//   • Render-time, cached, fail-open. enrich(url) is a SYNC cache read used in render; warmMeta(urls)
//     is the async side that fills the cache and bumps `metaTick` so cards re-render as previews arrive.
//   • A miss (not yet fetched, offline, site blocked) leaves the slot empty — the card degrades to
//     title + badges, never breaks. Previews are an enhancement, not a dependency.
//   • Permanent per-URL localStorage cache → repeat loads and the saved tab are instant.
//
// Source: Jina Reader (r.jina.ai) JSON mode — free, no key, sends CORS headers (so we fetch it directly,
// no proxy needed), and extracts a clean description even when a page has no og:description meta. Probed
// at ~7/8 hit rate on a live HN front page vs 1/8 for og-scraping through public proxies.
import { atom } from "nanostores";
import { viaProxy } from "./feed.js";

export const metaTick = atom(0);

// Per-host description resolvers. Default = Jina Reader (fetchMeta below). A few hosts need a bespoke
// extractor: Hugging Face blocks anonymous Jina AND its og:description is a generic site blurb, so the
// real model card lives in README.md — fetched through the CORS proxy (HF restricts CORS to its own
// origin) and reduced to its first prose paragraph. Same { description } contract, same cache, same
// fail-open. A new host that hides its prose the same way just adds an entry here.
function hfReadmeDesc(md) {
  let t = String(md || "").replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, ""); // strip YAML frontmatter
  if (/access to (model|this repo|the model) .*is restricted/i.test(t.slice(0, 400))) return ""; // gated
  const out = [];
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line) { if (out.length) break; else continue; }                  // blank line ends 1st paragraph
    if (/^(#|!\[|<|\[!|\||-{3,}|={3,}|>|\*\s|-\s|\d+\.\s)/.test(line)) continue; // heading/img/html/badge/table/rule/quote/list
    const s = line.replace(/!\[[^\]]*\]\([^)]*\)/g, "")                    // images
                  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                 // links → their text
                  .replace(/<[^>]+>/g, "")                                 // inline html
                  .replace(/https?:\/\/\S+/g, "")                          // bare URLs
                  .replace(/[*`_]/g, "").replace(/\s+/g, " ").trim();      // emphasis / code ticks / gaps
    if (s.length < 20) continue;
    out.push(s);
    if (out.join(" ").length > 220) break;
  }
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, 340);
}

const RESOLVERS = {
  "huggingface.co": async (url) => {
    const m = url.match(/^https?:\/\/huggingface\.co\/([^/?#]+\/[^/?#]+)/); // org/model
    if (!m) return null;                                                    // not a model page → let Jina try
    const md = await viaProxy(`https://huggingface.co/${m[1]}/raw/main/README.md`, (x) => typeof x === "string" && x.length > 0, 12000);
    const description = hfReadmeDesc(md);
    if (!description) throw new Error("no card");                           // gated / no README → fail-open
    return { description };
  },
};

const mem = new Map();      // url → { description }
const pending = new Set();  // urls in flight (dedupe concurrent warms)

function cache() {
  if (mem.__loaded) return mem;
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:meta") || "{}"); } catch { /* private mode / bad json */ }
  for (const k in obj) mem.set(k, obj[k]);
  mem.__loaded = true;
  return mem;
}
function persist() {
  try { localStorage.setItem("ms:meta", JSON.stringify(Object.fromEntries(mem))); } catch { /* quota — mem cache still serves */ }
}

// enrich(url) — synchronous. Returns { description } or null on a miss.
export function enrich(url) {
  if (typeof url !== "string" || !url) return null;
  return cache().get(url) || null;
}

async function fetchMeta(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* bad url → Jina */ }
  const resolver = RESOLVERS[host];
  if (resolver) { const r = await resolver(url); if (r) return r; }   // resolver may throw (fail-open) or null → Jina
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    // Jina takes the raw URL as its path (not query-encoded). X-Timeout bounds Jina's own upstream fetch.
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

// warmMeta(urls) — fetch a description for every not-yet-cached URL, then bump metaTick once. Cheap to
// call on every render/effect: already-cached and in-flight URLs are skipped. Failures stay uncached so
// a later load can retry (fail-open, never a poisoned negative cache).
export async function warmMeta(urls) {
  const c = cache();
  const todo = [...new Set((urls || []).filter((u) => typeof u === "string" && u && !c.has(u) && !pending.has(u)))];
  if (!todo.length) return;
  todo.forEach((u) => pending.add(u));
  let changed = false;
  await pool(todo, 5, async (u) => {
    try { c.set(u, await fetchMeta(u)); changed = true; }
    catch { /* fail-open: leave uncached for retry */ }
    finally { pending.delete(u); }
  });
  if (changed) { persist(); metaTick.set(metaTick.get() + 1); }
}
