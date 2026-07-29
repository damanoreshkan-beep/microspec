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
import { FIXTURE } from "./fixture.js";

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

// A book with no cover must still look like a book — Wikidata P18 is present on only 64% of them and the
// search thumbnail on fewer still, so the placeholder is not an edge case, it is the common path.
const coverFor = (title, thumb) => thumb || letterTile(title, { w: 300, h: 450 });

export async function load(filters) {
  const q = (filters?.q || "").trim();
  // The gate never touches the network, and it never types either — so it gets the fixture even with an
  // empty query. Otherwise every shot and every a11y pass would be taken of the search prompt, which is the
  // one screen that proves nothing.
  if (gate) return { items: FIXTURE, meta: { q, found: FIXTURE.length } };
  // searchFetch calls load() with q:"" on boot; returning nothing is what shows the `prompt` empty-state.
  if (!q) return { items: [], meta: {} };

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
