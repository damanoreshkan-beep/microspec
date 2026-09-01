/* @ts-self-types="./urlquery.d.ts" */
/**
 * # runtime/urlquery.js — which query key carries the search term, and the same URL with a new one
 *
 * A scraped source is often just a results page (`…/search?q=cats`). If the runtime can find WHICH query key
 * carries the search term, the app can offer a search box that swaps that value and re-extracts videos for
 * the new query. The resolver is the point: every site names its key differently (`q` for Google, Bing,
 * DuckDuckGo, GitHub, Reddit, Vimeo; `search_query` for YouTube; `SearchText` for AliExpress; `text` Yandex,
 * `wd` Baidu, `p` Yahoo, `k` Amazon, `_nkw` eBay, `s` WordPress and Medium…), so it recognises them by name in
 * a deliberate priority order — the most universal keys win when a URL happens to carry more than one. A URL
 * with query params but NO known key is NOT searchable: the module never guesses which param is the term,
 * because guessing would corrupt the URL. Pure and DOM-free, so it is unit-tested in Deno.
 *
 * ![The urlquery module map: a URL → resolveSearch walks the priority list of known keys → searchable, key, term → buildSearchUrl sets that key and keeps every other param](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-urlquery.svg)
 *
 * ## Import
 * ```js
 * import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";                    // an app's page: the import map resolves /_rt/
 * import { resolveSearch, buildSearchUrl } from "@microspec/core/runtime/urlquery.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link resolveSearch} — `resolveSearch(url)` → `{ searchable, key, term }`: `key` is the ORIGINAL-cased param name that carries the term (null when not searchable), `term` its current value ("" when not searchable).
 * - {@link buildSearchUrl} — `buildSearchUrl(url, term)` → string: the URL with its resolved key set to `term`, path and every other param preserved (spaces as `+`); `url` unchanged when it is not searchable.
 *
 * ## In practice
 * ```js
 * import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
 *
 * // A pasted results URL (`…/search?q=…`) is searchable → offer to swap the term and play those results.
 * const sr = resolveSearch(norm());
 * const search = (e) => { e?.preventDefault?.(); const url = norm(), term = q.trim(); if (url && term) goto(buildSearchUrl(url, term)); };
 * ...
 * ${sr.searchable ? html`<input id="sheet-search" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} />` : null}
 *
 * // A saved page row seeds its search box with the term the URL already carries:
 * const [q, setQ] = useState(resolveSearch(s.url).term || "");                // apps/reel/view.js
 * ```
 *
 * ## How it fits
 * Imports nothing — the `URL` global only. `sitelabel.js` imports `resolveSearch` to name a source by its
 * query. 1 farm app imports it directly — reel, in the source sheet and the saved-page rows. Covered by
 * `packages/runtime/tests/urlquery_test.js`.
 *
 * ## Invariants and pitfalls
 * - Never guess: query params with no recognised key ⇒ `searchable: false`; so does a URL with no params or
 *   an unparseable one. `buildSearchUrl` then returns the input untouched.
 * - Priority order is deliberate: `q`, `query`, `search`, `search_query`, `searchtext`, `text`, `keyword`,
 *   `keywords`, `term`, `s`, `k`, `kw`, `wd`, `p`, `_nkw`, `word`, `find`, `key` — the first key present in
 *   that order wins, not the first in the URL.
 * - Matching is case-insensitive but the ORIGINAL casing is preserved on rewrite (AliExpress `SearchText`).
 * - The rewrite goes through `URLSearchParams.set`, so spaces become `+` (form encoding, which every engine
 *   accepts) and every other param and the path survive.
 * @module
 */
// urlquery — resolve a page's "search" query parameter and rewrite it. A scraped source is often just a
// results page (`…/search?q=cats`); if we can find WHICH query key carries the search term, the app can offer
// a search box that swaps that value and re-extracts videos for the new query. Pure + DOM-free → unit-tested.
//
// The resolver is the point: it must recognise the search key across the popular engines/sites by name, since
// every site names it differently. Priority order below is deliberate — the most universal keys win when a
// URL happens to carry more than one known key. Match is case-insensitive; the ORIGINAL casing is preserved
// when rewriting (e.g. AliExpress `SearchText`). A URL with query params but NO known key is NOT searchable —
// we never guess which param is the search term (guessing would corrupt the URL).
//
//   q            Google · Bing · DuckDuckGo · Twitter/X · GitHub · Reddit · Vimeo · Pexels …
//   query        generic · many CMS/APIs
//   search       generic
//   search_query YouTube
//   searchText   AliExpress            text   Yandex            wd   Baidu            p   Yahoo
//   keyword(s)   many shops            term   generic           s    WordPress · Medium
//   k            Amazon                _nkw   eBay              kw / word / find / key   long tail
const SEARCH_KEYS = [
  "q", "query", "search", "search_query", "searchtext", "text", "keyword", "keywords",
  "term", "s", "k", "kw", "wd", "p", "_nkw", "word", "find", "key",
];

// resolveSearch(url) → { searchable, key, term }. `key` is the ORIGINAL-cased param name that carries the
// search term (or null); `term` is its current value. Not searchable ⇒ no query params, an unparseable URL,
// or query params none of which is a recognised search key.
/**
 * Find which query parameter of `url` carries the search term, by the module's priority list of known keys.
 * @param url the page URL to inspect
 * @returns `{ searchable, key, term }` — `key` keeps the URL's original casing (null when not searchable),
 *          `term` is its current value ("" when not searchable)
 */
export function resolveSearch(url) {
  const miss = { searchable: false, key: null, term: "" };
  let u;
  try { u = new URL(url); } catch { return miss; }
  const keys = [...u.searchParams.keys()];
  if (!keys.length) return miss;
  for (const name of SEARCH_KEYS) {
    const hit = keys.find((k) => k.toLowerCase() === name);            // first present key, in priority order
    if (hit) return { searchable: true, key: hit, term: u.searchParams.get(hit) || "" };
  }
  return miss;
}

// buildSearchUrl(url, term) → the URL with its resolved search key set to `term` (path + every other param
// preserved; spaces encoded as `+` per form encoding, which every engine accepts). Not searchable ⇒ unchanged.
/**
 * Rewrite `url` so its resolved search key carries `term`, preserving the path and every other parameter.
 * @param url the page URL whose search term is to be swapped
 * @param term the new search term
 * @returns the rewritten URL string, or `url` unchanged when it is not searchable
 */
export function buildSearchUrl(url, term) {
  const { searchable, key } = resolveSearch(url);
  if (!searchable) return url;
  try { const u = new URL(url); u.searchParams.set(key, term); return u.toString(); } catch { return url; }
}
