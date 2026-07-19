// Wikipedia search adapter. searchFetch family: the search box drives load() and the trimmed query
// arrives as filters.q. One request per search via the Action API generator=search (rank-ordered
// pages WITH plaintext intro extract + description + thumbnail). origin=* → CORS *, direct on any host.
import { fetchJson } from "/_rt/feed.js";
import { isGate, gate } from "/_rt/gate.js";
import { letterTile } from "/_rt/tile.js";

const LANGS = { uk: "Українська", en: "English", de: "Deutsch", pl: "Polski" };
const oneLine = (s) => { s = s.replace(/\s+/g, " ").trim(); return s.length > 100 ? s.slice(0, 100).replace(/\s+\S*$/, "") + "…" : s; };
// Not every article has a thumbnail → a deterministic letter tile so a card is NEVER image-less (keeps the
// feed visually consistent + the "cards have a thumbnail" gate honest). Self-contained data-URI, no fetch.
const placeholder = (title) => letterTile(title, { w: 400, h: 400, sat: 32, light: 40, fontSize: 230 });

// Gate fixture: Wikipedia search goes thin/down and reds the run on a live-data e2e. In the gate we return
// a deterministic set for any non-empty query (self-contained placeholder thumbs), so the search e2e is
// stable regardless of the network.
const GATE_ARTS = [
  ["Київ", "Столиця України", "Київ — столиця та найбільше місто України на річці Дніпро, одне з найдавніших міст Європи."],
  ["Україна", "Держава у Східній Європі", "Україна — держава у Східній Європі, друга за площею країна континенту."],
  ["Дніпро (річка)", "Річка у Східній Європі", "Дніпро — одна з найдовших річок Європи, тече через Україну до Чорного моря."],
  ["Софійський собор", "Пам'ятка у Києві", "Софійський собор — визначна пам'ятка Києва, об'єкт Світової спадщини ЮНЕСКО."],
  ["Хрещатик", "Головна вулиця Києва", "Хрещатик — головна вулиця Києва завдовжки близько 1,3 кілометра."],
];

export async function load(filters) {
  const q = (filters.q || "").trim();
  const lang = LANGS[filters.lang] ? filters.lang : "uk";
  if (!q) return { items: [], meta: { count: 0 }, next: null };
  if (isGate) {
    const items = GATE_ARTS.map(([title, desc, extract], i) => ({
      id: `${lang}:${1000 + i}`, title, desc, extract, langName: LANGS[lang],
      thumb: placeholder(title), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    }));
    return { items, meta: { count: items.length }, next: null };
  }

  const params = {
    action: "query", format: "json", generator: "search",
    gsrsearch: q, gsrlimit: "20", gsrnamespace: "0", gsrqiprofile: "classic",
    prop: "extracts|description|pageimages",
    exintro: "1", explaintext: "1", exchars: "600",
    piprop: "thumbnail", pithumbsize: "400", origin: "*",
  };
  if (filters.cursor != null) params.gsroffset = String(filters.cursor); // infinite scroll: search offset
  const api = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams(params);
  const data = await fetchJson(api);
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
      thumb: p.thumbnail?.source || placeholder(p.title),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    };
  });
  // Wikipedia signals more results via continue.gsroffset — use it verbatim as the next-page cursor.
  return { items, meta: { count: items.length }, next: data.continue?.gsroffset ?? null };
}
