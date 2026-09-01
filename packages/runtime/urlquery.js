/* @ts-self-types="./urlquery.d.ts" */
/**
 * Resolve a page's "search" query parameter and rewrite it, so an app scraped from a results page can offer
 * a search box that swaps the term and re-extracts. Exports `resolveSearch` (which known key carries the
 * term, by a deliberate priority order across the popular engines) and `buildSearchUrl` (the same URL with
 * that key set). Never guesses an unknown key — guessing would corrupt the URL. Pure and DOM-free.
 * @module
 */
const SEARCH_KEYS = [
  "q", "query", "search", "search_query", "searchtext", "text", "keyword", "keywords",
  "term", "s", "k", "kw", "wd", "p", "_nkw", "word", "find", "key",
];

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
    const hit = keys.find((k) => k.toLowerCase() === name);            
    if (hit) return { searchable: true, key: hit, term: u.searchParams.get(hit) || "" };
  }
  return miss;
}

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
