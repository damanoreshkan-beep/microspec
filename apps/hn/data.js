import { fetchJson } from "/_rt/feed.js";

export async function load(filters = {}) {
  const page = Number(filters.cursor) || 0;
  const url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30&page=${page}`;
  const data = await fetchJson(url);
  const items = (data.hits || []).filter((h) => h.title).map((h) => ({
    id: String(h.objectID),
    title: h.title,
    author: h.author || "",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    ts: (h.created_at_i || 0) * 1000,
  }));
  const next = data.page + 1 < data.nbPages ? data.page + 1 : null;
  return { items, meta: {}, next };
}
