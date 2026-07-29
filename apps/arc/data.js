import { isBook } from "/_rt/acts.js";
import { letterTile } from "/_rt/tile.js";
import { gate } from "/_rt/gate.js";
import { CURATED, SHELVES } from "./curated.js";

const WP = "https://en.wikipedia.org/w/api.php";
const WD = "https://www.wikidata.org/w/api.php";
export const WIKI_HEADERS = { "Api-User-Agent": "microspec-arc/1.0 (https://github.com/damanoreshkan-beep/microspec)" };

const jget = async (url, timeout = 10000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: WIKI_HEADERS, signal: ctrl.signal });
    if (!r.ok) throw new Error("status " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
};

const spine = (title) => {
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 100;
  return letterTile(title, { w: 300, h: 450, hue: 24, sat: 12, light: 18 + (h % 9), fontSize: 84 });
};

const coverFor = (title, thumb) => thumb || spine(title);

export async function load(filters) {
  const q = (filters?.q || "").trim();
  if (gate) return loadShelves();
  if (!q) return loadShelves();

  const search = await jget(`${WP}?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}`
    + `&gsrlimit=12&prop=pageprops|pageimages&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=320`
    + `&format=json&formatversion=2&origin=*`);
  const pages = (search.query?.pages || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  const qids = pages.map((p) => p.pageprops?.wikibase_item).filter(Boolean);
  if (!qids.length) return { items: [], meta: { q } };

  const ent = await jget(`${WD}?action=wbgetentities&ids=${qids.join("|")}&props=claims|labels`
    + `&languages=en|uk&format=json&formatversion=2&origin=*`);

  const typed = new Map();
  const authorQids = new Set();
  for (const [id, e] of Object.entries(ent.entities || {})) {
    const cl = e.claims || {};
    const p31 = (cl.P31 || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const author = (cl.P50 || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean)[0];
    const time = (cl.P577 || []).map((c) => c.mainsnak?.datavalue?.value?.time).filter(Boolean)[0];
    if (author) authorQids.add(author);
    typed.set(id, { p31, hasAuthor: !!cl.P50, hasDate: !!cl.P577, author, year: time ? String(time).slice(1, 5) : null });
  }
  let names = {};
  if (authorQids.size) {
    try {
      const a = await jget(`${WD}?action=wbgetentities&ids=${[...authorQids].join("|")}&props=labels`
        + `&languages=en|uk&format=json&formatversion=2&origin=*`);
      for (const [id, e] of Object.entries(a.entities || {})) names[id] = e.labels?.en?.value || e.labels?.uk?.value || "";
    } catch {  }
  }

  const items = [];
  for (const p of pages) {
    const qid = p.pageprops?.wikibase_item;
    const meta = qid && typed.get(qid);
    if (!meta || !isBook(meta)) continue;
    items.push({
      id: String(p.pageid),
      pageid: p.pageid,
      qid,
      title: p.title,
      author: (meta.author && names[meta.author]) || "",
      year: meta.year || "",
      byline: [(meta.author && names[meta.author]) || "", meta.year || ""].filter(Boolean).join(" · "),
      cover: coverFor(p.title, p.thumbnail?.source),
      hasCover: !!p.thumbnail?.source,
      url: `https://en.wikipedia.org/?curid=${p.pageid}`,
    });
  }
  return { items, meta: { q, found: items.length } };
}

async function loadShelves() {
  const flat = SHELVES.flatMap((g) => CURATED[g].map((b) => ({ ...b, group: g })));
  let thumbs = {};
  if (!gate) try {
    const r = await jget(`${WP}?action=query&pageids=${flat.map((b) => b.pageid).join("|")}`
      + `&prop=pageimages&piprop=thumbnail&pithumbsize=320&format=json&formatversion=2&origin=*`, 12000);
    for (const p of r.query?.pages || []) if (p.thumbnail) thumbs[p.pageid] = p.thumbnail.source;
  } catch {  }
  const items = flat.map((b) => ({
    id: b.id,
    pageid: b.pageid,
    title: b.title,
    byline: b.uk,
    bylineEn: b.en,
    cover: thumbs[b.pageid] || spine(b.title),
    hasCover: !!thumbs[b.pageid],
    url: `https://en.wikipedia.org/?curid=${b.pageid}`,
    ...Object.fromEntries(SHELVES.map((g) => [`g_${g}`, g === b.group])),
  }));
  return { items, meta: { found: items.length } };
}

import { findPlotSection, cleanPlotText, foldPlot } from "/_rt/acts.js";

export async function loadPlot(title) {
  const secs = await jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&prop=sections`
    + `&format=json&formatversion=2&origin=*`);
  const hit = findPlotSection(secs.parse?.sections);
  if (!hit) return { plot: "", heading: null };
  const body = await jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&section=${hit.index}`
    + `&prop=text&format=json&formatversion=2&origin=*`);
  const html = body.parse?.text || "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup, style, table, .mw-editsection, .reference, .hatnote").forEach((n) => n.remove());
  const text = cleanPlotText(doc.body.textContent, hit.line);
  return { plot: foldPlot(text), heading: hit.line, chars: text.length };
}
