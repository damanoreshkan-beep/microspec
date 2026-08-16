// persona — the shelf. One call to the edge (`characters()`, cached per session by /_rt/characters.js) is the
// whole stock; a typed name goes to Wikipedia through the edge and comes back as CANDIDATES in the same card
// shape, flagged so the shelf sections them apart and the detail body knows to create the person first.
//
// Card text is picked in the ACTIVE locale here — the runtime resolves one field per slot and both languages
// live on the row — read off <html lang>, which the runtime keeps current. The drill-down (view.js) follows
// `loc` live; the shelf re-labels on its next load.
import { gate } from "/_rt/gate.js";
import { characters, lookup, $characters } from "/_rt/characters.js";
import { letterTile } from "/_rt/tile.js";

const locale = () => (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "uk");

// A portrait is the recognition on this shelf; a person without one gets a quiet monogram in one hue near the
// accent, never a random colour — colour means something here.
const monogram = (name) => letterTile(name, { w: 300, h: 450, hue: 350, sat: 12, light: 22, fontSize: 84 });

export function toItem(c, loc) {
  const uk = loc === "uk";
  return {
    id: c.id,
    slug: c.slug,
    title: (uk ? c.name_uk : c.name) || c.name,
    byline: (uk ? c.tagline_uk : c.tagline) || c.tagline || "",
    story: (uk ? c.story_uk : c.story) || c.story || "",
    cover: c.avatar || monogram(c.name),
    url: c.url,
    // section flags — exactly one is true per item
    mine: !c.public && c.created_by != null,
    shelf: !!c.public,
    candidate: false,
  };
}

export const candidateItem = (k) => ({
  id: "wiki:" + k.key,
  key: k.key,
  title: k.title,
  byline: k.description,
  story: "",
  cover: k.thumb || monogram(k.title),
  url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(k.key),
  mine: false, shelf: false, candidate: true,
});

export async function load(filters) {
  const q = (filters?.q || "").trim();
  const loc = locale();
  const shelf = async () => {
    const list = await characters();
    return { items: list.map((c) => toItem(c, loc)), meta: { found: list.length } };
  };
  if (gate || !q) return shelf();
  // A typed name: the shelf's own matches first (no round-trip, and the person may already be here), then
  // Wikipedia's candidates for anyone who is not.
  const list = $characters.get() || (await characters());
  const ql = q.toLowerCase();
  const own = list.filter((c) => [c.name, c.name_uk, c.tagline, c.tagline_uk].some((s) => (s || "").toLowerCase().includes(ql)));
  let found = [];
  try { found = await lookup(q); } catch { /* signed out or the edge is down: the shelf still answers */ }
  const have = new Set(list.map((c) => c.slug));
  const items = [...own.map((c) => toItem(c, loc)), ...found.filter((k) => !have.has(k.key)).map(candidateItem)];
  return { items, meta: { found: items.length } };
}
