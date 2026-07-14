import { viaProxy, isJsonObject } from "/_rt/feed.js";

const LANGS = { uk: "Українська", en: "English", de: "Deutsch", pl: "Polski" };
const oneLine = (s) => { s = s.replace(/\s+/g, " ").trim(); return s.length > 100 ? s.slice(0, 100).replace(/\s+\S*$/, "") + "…" : s; };
const placeholder = (title) => {
  const ch = (title.trim()[0] || "?").toUpperCase();
  let hue = 0; for (const c of title) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue} 32% 40%)"/><text x="50%" y="52%" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="230" font-weight="700" fill="rgba(255,255,255,.92)">${ch}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
};

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
  if (filters.cursor != null) params.gsroffset = String(filters.cursor); 
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
      thumb: p.thumbnail?.source || placeholder(p.title),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    };
  });
  return { items, meta: { count: items.length }, next: data.continue?.gsroffset ?? null };
}
