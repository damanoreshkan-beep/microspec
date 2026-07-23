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
export function buildSearchUrl(url, term) {
  const { searchable, key } = resolveSearch(url);
  if (!searchable) return url;
  try { const u = new URL(url); u.searchParams.set(key, term); return u.toString(); } catch { return url; }
}
