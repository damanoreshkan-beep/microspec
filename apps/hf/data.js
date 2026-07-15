// Hugging Face model catalog. The HF API restricts CORS to huggingface.co, so every request goes through
// the runtime's CORS proxy (viaProxy). Descriptions aren't in the list payload — the runtime's enrich step
// fetches each model's README card (see enrich.js → huggingface.co resolver) and translate.js decodes the
// English prose into the active locale. Returns { items, meta }.
import { viaProxy, isJsonArray } from "/_rt/feed.js";

// Downloads/likes span 0 → tens of millions; a raw count blows out a badge. Compact once, here, so the
// card + detail render a tidy "627K" / "13.6M" and never a 8-digit number.
const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

export async function load(filters = {}) {
  const spaces = filters.type === "spaces";              // Models catalog vs interactive Spaces (demos)
  const kind = spaces ? "spaces" : "models";
  // Spaces have no download counter, so "Завантаження" is meaningless there — always rank Spaces by likes.
  const sort = (!spaces && filters.sort === "downloads") ? "downloads" : "likes";
  const q = (filters.q || "").trim();
  const cat = (filters.category || "").trim();           // pipeline_tag (models) / tag (spaces) — server-side
  const params = new URLSearchParams({ sort, direction: "-1", limit: "40" });
  if (q) params.set("search", q);
  if (cat) params.set("filter", cat);
  // No pagination: HF pages via a Link header the CORS proxy strips, so we take the top 40 — a catalog page.
  const data = JSON.parse(await viaProxy(`https://huggingface.co/api/${kind}?${params}`, isJsonArray));
  const items = (Array.isArray(data) ? data : []).map((m) => {
    const id = m.id || m.modelId || "";
    const [org, ...rest] = id.split("/");
    const name = rest.length ? rest.join("/") : id;      // "org/repo" → "repo"; bare "gpt2" → "gpt2"
    return {
      id,
      name,
      author: rest.length ? org : "",
      task: spaces ? (m.sdk || "space") : (m.pipeline_tag || ""),   // the "kind" badge: SDK for spaces, task for models
      lib: spaces ? "" : (m.library_name || ""),
      downloads: spaces ? "" : compact(m.downloads),      // empty → badge/detail row auto-hidden for spaces
      likes: compact(m.likes),
      createdAt: m.createdAt ? Date.parse(m.createdAt) : 0,
      url: spaces ? `https://huggingface.co/spaces/${id}` : `https://huggingface.co/${id}`,
    };
  }).filter((it) => it.id);
  return { items, meta: {} };
}
