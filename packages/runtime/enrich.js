/* @ts-self-types="./enrich.d.ts" */
/**
 * # runtime/enrich.js — the article preview a link feed never gave you
 *
 * Link-feed APIs (Hacker News, launches, …) return a title and a URL but no preview text, and a feed card
 * that is just a title is "raw" — validate.js refuses it unless the card declares a preview slot. This
 * module fills that slot: given an item's outbound URL it fetches the article's description once (Jina
 * Reader JSON mode — free, keyless, CORS-friendly, ~7/8 hit rate on a live HN front page against 1/8 for
 * og-scraping through public proxies) and exposes it as a virtual field the card renders. Same shape as
 * translate.js, for the same reasons: render-time, cached, fail-open. `enrich(url)` is a synchronous cache
 * read used in render; `warmMeta(urls)` is the async side that fills the cache and bumps `metaTick` so
 * cards re-render as previews arrive. A miss leaves the slot empty and the card degrades to title + badges.
 * Previews are an enhancement, never a dependency.
 *
 * ![The enrich module's map: URL in, cached description out, metaTick fanning out to cards](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-enrich.svg)
 *
 * ## Import
 * ```js
 * import { enrich, warmMeta, metaTick } from "/_rt/enrich.js";                    // an app's page: the import map resolves /_rt/
 * import { enrich, warmMeta, metaTick } from "@microspec/core/runtime/enrich.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link enrich} — `enrich(url)`: synchronous cache read; `{ description }` when cached, `null` on a miss.
 * - {@link warmMeta} — `warmMeta(urls)`: fetches a description for every not-yet-cached URL (5 in flight at once via `pool`), persists the cache and bumps `metaTick` once if anything arrived.
 * - {@link metaTick} — a nanostores counter atom bumped once per `warmMeta` batch that added previews; subscribe to re-render.
 *
 * ## In practice
 * ```js
 * // packages/runtime/render.js — the one importer. An app never calls this module; it declares
 * // spec.enrich = { url: "url", body: "desc" } (hn, hf) and the renderer resolves the virtual field.
 * import { enrich, warmMeta, metaTick } from "./enrich.js";
 *
 * function field(it, name) {
 *   const e = A.spec.enrich;
 *   return (e && name === e.body) ? (enrich(it[e.url])?.description ?? "") : it[name];
 * }
 *
 * function ListView({ tab }) {
 *   const mt = useStore(metaTick);                       // re-render as previews land
 *   useEffect(() => {
 *     if (A.spec.enrich) warmMeta(items.map((it) => it[A.spec.enrich.url]));
 *   }, [items, mt]);
 *   // …
 * }
 * ```
 *
 * ## How it fits
 * Imports `atom` from nanostores and `viaProxy` + `pool` from feed.js (the proxy chain carries the one
 * bespoke resolver — Hugging Face README.md through the CORS proxy — and `pool` bounds the Jina burst).
 * Its only importer is render.js, which resolves `spec.enrich.body` through `enrich()` and warms every
 * visible item's URL; no farm app imports it directly. Two farm apps reach it through `spec.enrich` today —
 * hn and hf — and translate.js runs after it so a translated locale localizes the fetched preview too.
 *
 * ## Invariants and pitfalls
 * - `enrich()` is synchronous and never fetches; only `warmMeta()` touches the network. Calling `warmMeta` on every render/effect is cheap: cached and in-flight URLs are skipped.
 * - Failures stay uncached so a later load can retry — fail-open, never a poisoned negative cache. A miss means empty slot, not a broken card.
 * - The cache is a permanent per-URL `localStorage` entry (`ms:meta`), so repeat loads and the saved tab are instant; a quota or private-mode failure still serves from memory.
 * - Jina takes the raw URL as its path, not query-encoded; `X-Timeout: 8` bounds Jina's own upstream fetch and a 10 s abort bounds ours.
 * - Per-host resolvers (`RESOLVERS`) exist for hosts that hide their prose: Hugging Face blocks anonymous Jina and its og:description is a site blurb, so the model card's first prose paragraph comes from README.md. A resolver returning `null` falls through to Jina; one that throws fails open.
 * - `metaTick` is bumped at most once per batch, and only when something arrived — an empty batch is a no-op.
 * @module
 */
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
import { viaProxy, pool } from "./feed.js";

/** Counter atom bumped once per `warmMeta` batch that added previews, so cards subscribed to it re-render. */
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
    // models: /org/repo ; spaces & datasets carry a /spaces|/datasets prefix → /spaces/org/repo
    const m = url.match(/^https?:\/\/huggingface\.co\/((?:spaces|datasets)\/[^/?#]+\/[^/?#]+|[^/?#]+\/[^/?#]+)/);
    if (!m) return null;                                                    // not a repo page → let Jina try
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
/**
 * Synchronous cache read of an article preview for a URL.
 * @param url the item's outbound URL
 * @returns `{ description }` when cached, or null on a miss (not yet fetched, offline, blocked)
 */
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

// warmMeta(urls) — fetch a description for every not-yet-cached URL, then bump metaTick once. Cheap to
// call on every render/effect: already-cached and in-flight URLs are skipped. Failures stay uncached so
// a later load can retry (fail-open, never a poisoned negative cache).
/**
 * Fetches a description for every not-yet-cached URL (bounded concurrency), persists the cache and bumps
 * `metaTick` once if anything arrived. Cached and in-flight URLs are skipped; failures stay uncached.
 * @param urls outbound URLs to warm
 * @returns resolves when the batch is done
 */
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
