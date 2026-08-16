import { gate } from "/_rt/gate.js";
import { characters, lookup, $characters } from "/_rt/characters.js";
import { letterTile } from "/_rt/tile.js";

const locale = () => (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "uk");

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
  const list = $characters.get() || (await characters());
  const ql = q.toLowerCase();
  const own = list.filter((c) => [c.name, c.name_uk, c.tagline, c.tagline_uk].some((s) => (s || "").toLowerCase().includes(ql)));
  let found = [];
  try { found = await lookup(q); } catch {  }
  const have = new Set(list.map((c) => c.slug));
  const items = [...own.map((c) => toItem(c, loc)), ...found.filter((k) => !have.has(k.key)).map(candidateItem)];
  return { items, meta: { found: items.length } };
}
