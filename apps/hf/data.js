import { viaProxy, fetchJson } from "/_rt/feed.js";

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

export async function load(filters = {}) {
  const spaces = filters.type === "spaces";              
  const kind = spaces ? "spaces" : "models";
  const sort = (!spaces && filters.sort === "downloads") ? "downloads" : "likes";
  const q = (filters.q || "").trim();
  const cat = (filters.category || "").trim();           
  const params = new URLSearchParams({ sort, direction: "-1", limit: "40" });
  if (q) params.set("search", q);
  if (cat) params.set("filter", cat);
  const data = await fetchJson(`https://huggingface.co/api/${kind}?${params}`, { array: true });
  const items = (Array.isArray(data) ? data : []).map((m) => {
    const id = m.id || m.modelId || "";
    const [org, ...rest] = id.split("/");
    const name = rest.length ? rest.join("/") : id;      
    return {
      id,
      name,
      author: rest.length ? org : "",
      task: spaces ? (m.sdk || "space") : (m.pipeline_tag || ""),   
      lib: spaces ? "" : (m.library_name || ""),
      downloads: spaces ? "" : compact(m.downloads),      
      likes: compact(m.likes),
      createdAt: m.createdAt ? Date.parse(m.createdAt) : 0,
      url: spaces ? `https://huggingface.co/spaces/${id}` : `https://huggingface.co/${id}`,
    };
  }).filter((it) => it.id);
  return { items, meta: {} };
}
