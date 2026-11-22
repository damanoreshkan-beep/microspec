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
import { atom } from "nanostores";
import { viaProxy } from "./feed.js";
import { Effect } from "./fx.js";
import { filter, pipe, unique } from "./remeda.js";
import { ENRICH } from "./enrich.config.js";

/** Counter atom bumped once per `warmMeta` batch that added previews, so cards subscribed to it re-render. */
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

const HF = ENRICH.huggingface;
const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const described = (description, empty) => description ? Effect.succeed({ description }) : Effect.fail(new Error(empty));
const RESOLVERS = {
  [HF.host]: (url) => Effect.suspend(() => {
    const m = url.match(new RegExp(HF.repo));
    return !m ? Effect.succeed(null) : tried(() => viaProxy(HF.readme.replace("{repo}", () => m[1]), (x) => typeof x === "string" && x.length > 0, HF.timeout)).pipe(
      Effect.flatMap((md) => described(hfReadmeDesc(md), HF.empty)));
  }),
};

const mem = new Map();
const pending = new Set();

function cache() {
  if (mem.__loaded) return mem;
  let obj = {};
  try { obj = JSON.parse(localStorage.getItem("ms:meta") || "{}"); } catch { }
  for (const k in obj) mem.set(k, obj[k]);
  mem.__loaded = true;
  return mem;
}
function persist() {
  try { localStorage.setItem("ms:meta", JSON.stringify(Object.fromEntries(mem))); } catch { }
}

/**
 * Synchronous cache read of an article preview for a URL.
 * @param url the item's outbound URL
 * @returns `{ description }` when cached, or null on a miss (not yet fetched, offline, blocked)
 */
export function enrich(url) {
  if (typeof url !== "string" || !url) return null;
  return cache().get(url) || null;
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(new RegExp(ENRICH.www), ""); } catch { return ""; } };
const abortAfter = (ms) => Effect.acquireRelease(
  Effect.sync(() => { const ctrl = new AbortController(); return { ctrl, t: setTimeout(() => ctrl.abort(), ms) }; }),
  ({ t }) => Effect.sync(() => clearTimeout(t)),
);
const resolved = (url) => Effect.suspend(() => RESOLVERS[hostOf(url)]?.(url) ?? Effect.succeed(null));
const READER = ENRICH.reader;
const reading = (url, ctrl) => tried(async () => {
  const r = await fetch(READER.href + url, { signal: ctrl.signal, headers: READER.headers });
  if (!r.ok) throw new Error(READER.refused + r.status);
  const d = (await r.json())?.data || {};
  return String(d.description || "").replace(/\s+/g, " ").trim();
}).pipe(Effect.flatMap((description) => described(description, READER.empty)));
const read = (url) => Effect.scoped(abortAfter(READER.timeout).pipe(Effect.flatMap(({ ctrl }) => reading(url, ctrl))));
const fetchMeta = (url) => resolved(url).pipe(Effect.flatMap((r) => r ? Effect.succeed(r) : read(url)));

/**
 * Fetches a description for every not-yet-cached URL (bounded concurrency), persists the cache and bumps
 * `metaTick` once if anything arrived. Cached and in-flight URLs are skipped; failures stay uncached.
 * @param urls outbound URLs to warm
 * @returns resolves when the batch is done
 */
export async function warmMeta(urls) {
  const c = cache();
  const todo = pipe(urls || [], filter((u) => typeof u === "string" && u && !c.has(u) && !pending.has(u)), unique());
  if (!todo.length) return;
  todo.forEach((u) => pending.add(u));
  return await Effect.runPromise(Effect.forEach(todo, (u) => fetchMeta(u).pipe(
    Effect.tap((meta) => Effect.sync(() => { c.set(u, meta); })),
    Effect.as(true),
    Effect.catchCause(() => Effect.succeed(false)),
    Effect.ensuring(Effect.sync(() => { pending.delete(u); })),
  ), { concurrency: ENRICH.concurrency }).pipe(
    Effect.flatMap((got) => got.some(Boolean) ? Effect.sync(() => { persist(); metaTick.set(metaTick.get() + 1); }) : Effect.void),
  ));
}
