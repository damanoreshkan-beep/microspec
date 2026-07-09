// Hacker News adapter (Algolia front-page API — CORS *, no key). Returns { items, meta }.
import { viaProxy, isJsonObject } from "/_rt/feed.js";

export async function load() {
  const url = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30";
  const data = JSON.parse(await viaProxy(url, isJsonObject));
  const items = (data.hits || []).filter((h) => h.title).map((h) => ({
    id: String(h.objectID),
    title: h.title,
    author: h.author || "",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    ts: (h.created_at_i || 0) * 1000,
  }));
  return { items, meta: {} };
}
