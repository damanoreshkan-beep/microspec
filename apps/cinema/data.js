const API = "https://archive.org/advancedsearch.php";
const BASE = 'collection:(feature_films) AND mediatype:(movies) AND format:("h.264")';
const FIELDS = ["identifier", "title", "year", "description", "downloads", "language"];

const LANGS = {
  en: ["eng", "English"], es: ["spa", "Spanish"], de: ["ger", "German"], tr: ["tur", "Turkish"],
  fr: ["fre", "French"], ja: ["jpn", "Japanese"], it: ["ita", "Italian"], ru: ["rus", "Russian"], uk: ["ukr", "Ukrainian"],
};

const ERAS = {
  silent: "[* TO 1929]",      
  golden: "[1930 TO 1949]",   
  mid: "[1950 TO 1969]",      
  late: "[1970 TO 1999]",     
  modern: "[2000 TO *]",      
};

const query = (f = {}) => {
  const parts = [BASE];
  const codes = LANGS[f.lang];
  if (codes) parts.push(`language:(${codes.map((c) => `"${c}"`).join(" OR ")})`);
  if (ERAS[f.era]) parts.push(`year:${ERAS[f.era]}`);
  return parts.join(" AND ");
};

const clean = (d) => {
  const raw = Array.isArray(d) ? d.join(" ") : typeof d === "string" ? d : "";
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, (m) => ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" }[m.toLowerCase()] || " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
};

const year = (y) => { const n = parseInt(Array.isArray(y) ? y[0] : y, 10); return n >= 1870 && n <= 2100 ? String(n) : ""; };
const views = (n) => { const v = Number(n) || 0; return v >= 1000 ? `${Math.round(v / 1000)}k` : v ? String(v) : ""; };

export async function load(filters = {}) {
  const u = new URL(API);
  u.searchParams.set("q", query(filters));
  for (const f of FIELDS) u.searchParams.append("fl[]", f);
  u.searchParams.append("sort[]", "downloads desc");     
  u.searchParams.set("rows", "60");
  u.searchParams.set("page", "1");
  u.searchParams.set("output", "json");

  const r = await fetch(u);
  if (!r.ok) throw new Error(`archive.org ${r.status}`);
  const j = await r.json();

  const items = (j.response?.docs || [])
    .filter((d) => d.identifier && d.title)
    .map((d) => {
      const id = encodeURIComponent(d.identifier);
      return {
        id: d.identifier,
        title: Array.isArray(d.title) ? d.title[0] : d.title,
        desc: clean(d.description),
        year: year(d.year),
        views: views(d.downloads),
        thumb: `https://archive.org/services/img/${id}`,
        video: `https://archive.org/download/${id}/format=h.264`,
        url: `https://archive.org/details/${id}`,
      };
    });
  return { items };
}
