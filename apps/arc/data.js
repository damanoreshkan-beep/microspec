// arc — find a BOOK. Two requests: Wikipedia's search (which also carries the Wikidata QID and a
// thumbnail), then ONE batched Wikidata lookup that types every candidate at once. Wikipedia's own search
// is not book-only — "Dune" returns the landform, the film, the franchise and a disambiguation page — and
// `haswbstatement:` is not parsed on en.wikipedia (measured: 0 hits), so the typing has to come from the
// QID roundtrip. The allowlist behind `isBook` came from a P31 census over 39 known books, not a guess.
// See apps/arc/RESEARCH.md.
//
// Grounding is always the ENGLISH article: en coverage is 82% against uk's 64%, and uk actively resolves
// some titles to the FILM (`Там, де співають раки` → the adaptation, a plot summary of the wrong work).
// The reader's language is a separate concern — the AI writes the acts in their locale.
import { isBook } from "/_rt/acts.js";
import { letterTile } from "/_rt/tile.js";
import { gate } from "/_rt/gate.js";
import { CURATED, SHELVES } from "./curated.js";

const WP = "https://en.wikipedia.org/w/api.php";
const WD = "https://www.wikidata.org/w/api.php";
// A browser cannot set User-Agent (forbidden header); `Api-User-Agent` is what the Wikimedia policy asks
// browser applications to send instead. 2026 gateway limit for a browser client is 200 req/min — this app
// spends 2 per search, so the limit is never the constraint, but identifying ourselves is still the deal.
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

// A placeholder is BOARD, not decoration. letterTile defaults to a hue hashed across the full 360 and
// 30% saturation, which put six loud unrelated colours on one shelf — and colour in this farm means
// something, so six meaningless hues is noise. One quiet hue near the app accent, low saturation, and only
// the LIGHTNESS varies per title: enough texture to tell two spines apart, never a false signal. The letter
// drops to a spine-sized glyph instead of filling half the tile.
const spine = (title) => {
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 100;
  return letterTile(title, { w: 300, h: 450, hue: 24, sat: 12, light: 18 + (h % 9), fontSize: 84 });
};

// A book with no cover must still look like a book — Wikidata P18 is present on only 64% of them and the
// search thumbnail on fewer still, so the placeholder is not an edge case, it is the common path.
const coverFor = (title, thumb) => thumb || spine(title);

export async function load(filters) {
  const q = (filters?.q || "").trim();
  // The gate never touches the network and never types, so it gets the SHELVES — the real landing screen,
  // built entirely from committed data. Shooting the search prompt instead would photograph the one screen
  // that proves nothing.
  if (gate) return loadShelves();
  // No query means BROWSE, not "prompt me to type": a catalogue is browsed first and searched second.
  // `browse: true` on the tab is what tells the runtime that, and this is the stock it shows.
  if (!q) return loadShelves();

  const search = await jget(`${WP}?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}`
    + `&gsrlimit=12&prop=pageprops|pageimages&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=320`
    + `&format=json&formatversion=2&origin=*`);
  const pages = (search.query?.pages || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  const qids = pages.map((p) => p.pageprops?.wikibase_item).filter(Boolean);
  if (!qids.length) return { items: [], meta: { q } };

  // ONE call for every candidate — ten separate lookups would be ten round trips for the same answer.
  const ent = await jget(`${WD}?action=wbgetentities&ids=${qids.join("|")}&props=claims|labels`
    + `&languages=en|uk&format=json&formatversion=2&origin=*`);

  // Authors arrive as QIDs; collect them and resolve their labels in a second batched call rather than
  // showing a reader "Q7934" where the author's name belongs.
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
    } catch { /* fail-open: a missing author name is a blank line, not a broken card */ }
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

// ── the landing shelves ──────────────────────────────────────────────────────────────────────────────────
// Everything the shelves need except the covers is already committed (title, pageid, author in both
// locales, all pre-verified), so this is ONE batched request for every shelf at once — not one per shelf,
// and certainly not one per book. If it fails, the shelves still render with generated tiles: a cover is an
// enhancement, and 54% of these books have no Wikipedia thumbnail anyway.
async function loadShelves() {
  const flat = SHELVES.flatMap((g) => CURATED[g].map((b) => ({ ...b, group: g })));
  let thumbs = {};
  // The gate has no network. Generated tiles are not a degraded state here — 54% of these books have no
  // Wikipedia thumbnail on a real device either, so this is what a real shelf largely looks like.
  if (!gate) try {
    const r = await jget(`${WP}?action=query&pageids=${flat.map((b) => b.pageid).join("|")}`
      + `&prop=pageimages&piprop=thumbnail&pithumbsize=320&format=json&formatversion=2&origin=*`, 12000);
    for (const p of r.query?.pages || []) if (p.thumbnail) thumbs[p.pageid] = p.thumbnail.source;
  } catch { /* fail-open: generated tiles carry the shelf perfectly well */ }
  const items = flat.map((b) => ({
    id: b.id,
    pageid: b.pageid,
    title: b.title,
    // The card subtitle is one pre-joined string (a card renders text, not fields), and the author is
    // carried in both locales so a Ukrainian reader does not meet "Panas Myrnyi" on a Ukrainian shelf.
    byline: b.uk,
    bylineEn: b.en,
    cover: thumbs[b.pageid] || spine(b.title),
    hasCover: !!thumbs[b.pageid],
    url: `https://en.wikipedia.org/?curid=${b.pageid}`,
    // one truthy flag per shelf — `sections` selects on a predicate, and a predicate is a truthy item key
    ...Object.fromEntries(SHELVES.map((g) => [`g_${g}`, g === b.group])),
  }));
  return { items, meta: { found: items.length } };
}

// ── the plot, fetched only for the book actually opened ──────────────────────────────────────────────────
// Two more requests. The section is resolved BY NAME every time: the numeric index moved 2 → 3 on
// `Dune (novel)` between two revisions four minutes apart, and `section=Plot` is rejected outright.
import { findPlotSection, cleanPlotText, foldPlot } from "/_rt/acts.js";

export async function loadPlot(title) {
  const secs = await jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&prop=sections`
    + `&format=json&formatversion=2&origin=*`);
  const hit = findPlotSection(secs.parse?.sections);
  if (!hit) return { plot: "", heading: null };
  const body = await jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&section=${hit.index}`
    + `&prop=text&format=json&formatversion=2&origin=*`);
  const html = body.parse?.text || "";
  // A real parser, not a regex: the section HTML carries <sup> citation markers (which textContent would
  // render as "[12]"), <style> blobs, and tables. Strip the nodes BEFORE reading the text out of them.
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup, style, table, .mw-editsection, .reference, .hatnote").forEach((n) => n.remove());
  const text = cleanPlotText(doc.body.textContent, hit.line);
  return { plot: foldPlot(text), heading: hit.line, chars: text.length };
}
