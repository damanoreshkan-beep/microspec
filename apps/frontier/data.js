// Frontier — fresh breakthrough OSS from the GitHub Search API. GitHub sends CORS *, so viaProxy fetches
// it directly (own IP → the generous per-user rate limit) and only falls back to a proxy if that 403s.
// "Frontier" = recently-created repos ranked by stars within a time window → what's breaking out now.
// Descriptions are English prose; translate.js decodes them into the active locale. Returns { items, meta }.
import { viaProxy, isJsonObject } from "/_rt/feed.js";

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

const WINDOWS = { week: 7, month: 30, quarter: 90 };

export async function load(filters = {}) {
  const days = WINDOWS[filters.period] || 30;
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); // YYYY-MM-DD
  const topic = (filters.category || "").trim();
  const q = (filters.q || "").trim();
  const parts = ["stars:>10", `created:>${since}`];   // >10★ trims noise; created window = "frontier"
  if (topic) parts.push(`topic:${topic}`);
  if (q) parts.push(q);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(parts.join(" "))}&sort=stars&order=desc&per_page=40`;
  const data = JSON.parse(await viaProxy(url, isJsonObject));
  const items = (data.items || []).map((it) => ({
    id: String(it.id),
    name: it.name,
    owner: it.owner?.login || "",
    desc: it.description || "",
    lang: it.language || "",
    stars: compact(it.stargazers_count),
    forks: compact(it.forks_count),
    issues: it.open_issues_count || 0,
    license: (it.license?.spdx_id && it.license.spdx_id !== "NOASSERTION") ? it.license.spdx_id : "",
    topicsStr: (it.topics || []).slice(0, 6).join(" · "),
    created: it.created_at ? Date.parse(it.created_at) : 0,
    pushed: it.pushed_at ? Date.parse(it.pushed_at) : 0,
    url: it.html_url,
  })).filter((it) => it.id && it.name);
  return { items, meta: {} };
}
