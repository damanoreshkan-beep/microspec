import { viaProxy, isJsonArray } from "/_rt/feed.js";

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

const SORTS = { likes: "likes", downloads: "downloads" };

export async function load(filters = {}) {
  const sort = SORTS[filters.sort] || "likes";
  const q = (filters.q || "").trim();
  const params = new URLSearchParams({ sort, direction: "-1", limit: "40" });
  if (q) params.set("search", q);
  const url = `https://huggingface.co/api/models?${params}`;
  const data = JSON.parse(await viaProxy(url, isJsonArray));
  const items = (Array.isArray(data) ? data : []).map((m) => {
    const id = m.id || m.modelId || "";
    const [org, ...rest] = id.split("/");
    const name = rest.length ? rest.join("/") : id;   
    return {
      id,
      name,
      author: rest.length ? org : "",
      task: m.pipeline_tag || "",
      lib: m.library_name || "",
      downloads: compact(m.downloads),
      likes: compact(m.likes),
      createdAt: m.createdAt ? Date.parse(m.createdAt) : 0,
      url: `https://huggingface.co/${id}`,
    };
  }).filter((it) => it.id);
  return { items, meta: {} };
}
