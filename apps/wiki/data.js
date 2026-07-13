// Wikipedia search adapter. searchFetch family: the search box drives load() and the trimmed query
// arrives as filters.q. One request per search via the Action API generator=search (rank-ordered
// pages WITH plaintext intro extract + description + thumbnail). origin=* → CORS *, direct on any host.
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const LANGS = { uk: "Українська", en: "English", de: "Deutsch", pl: "Polski" };
const oneLine = (s) => { s = s.replace(/\s+/g, " ").trim(); return s.length > 100 ? s.slice(0, 100).replace(/\s+\S*$/, "") + "…" : s; };

export async function load(filters) {
  const q = (filters.q || "").trim();
  const lang = LANGS[filters.lang] ? filters.lang : "uk";
  if (!q) return { items: [], meta: { count: 0 }, next: null };

  const params = {
    action: "query", format: "json", generator: "search",
    gsrsearch: q, gsrlimit: "20", gsrnamespace: "0", gsrqiprofile: "classic",
    prop: "extracts|description|pageimages",
    exintro: "1", explaintext: "1", exchars: "600",
    piprop: "thumbnail", pithumbsize: "400", origin: "*",
  };
  if (filters.cursor != null) params.gsroffset = String(filters.cursor); // infinite scroll: search offset
  const api = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams(params);
  const data = JSON.parse(await viaProxy(api, isJsonObject));
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));

  const items = pages.map((p) => {
    const extract = (p.extract || "").replace(/\s+/g, " ").trim();
    const desc = p.description || (extract ? oneLine(extract) : "");
    return {
      id: `${lang}:${p.pageid}`,
      title: p.title,
      desc,
      extract: extract || desc,
      langName: LANGS[lang],
      thumb: p.thumbnail?.source || "",
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    };
  });
  // Wikipedia signals more results via continue.gsroffset — use it verbatim as the next-page cursor.
  return { items, meta: { count: items.length }, next: data.continue?.gsroffset ?? null };
}
