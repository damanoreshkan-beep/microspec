const SEARCH_KEYS = [
  "q", "query", "search", "search_query", "searchtext", "text", "keyword", "keywords",
  "term", "s", "k", "kw", "wd", "p", "_nkw", "word", "find", "key",
];

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

export function buildSearchUrl(url, term) {
  const { searchable, key } = resolveSearch(url);
  if (!searchable) return url;
  try { const u = new URL(url); u.searchParams.set(key, term); return u.toString(); } catch { return url; }
}
