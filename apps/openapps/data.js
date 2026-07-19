import { viaProxy, fetchJson } from "/_rt/feed.js";

const API = "https://api.github.com/search/repositories";
const PAGE = 24;

const OS = {
  "": "topic:app",
  windows: "topic:windows topic:desktop-app",
  macos: "topic:macos topic:desktop-app",
  linux: "topic:linux topic:desktop-app",
  android: "topic:android-app",
};
const EXCLUDE = "-topic:awesome -topic:library -topic:framework -topic:template";

const avatar = (u) => (u ? `${u}${u.includes("?") ? "&" : "?"}size=160` : "");
const num = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v); };
const when = (s) => { const d = new Date(s); return isFinite(+d) ? +d : null; };
const lic = (l) => { const id = l?.spdx_id; return id && id !== "NOASSERTION" ? id : ""; };

const query = (os, q) => {
  const base = OS[os] ?? OS[""];
  const term = q ? `${q} ` : "";
  return `${term}${base} ${EXCLUDE}`;
};

export async function load(filters = {}) {
  const q = (filters.q || "").trim();
  const os = filters.os || "";
  const sort = filters.sort === "updated" ? "updated" : "stars";
  const page = (Number(filters.cursor) || 0) + 1;

  const params = new URLSearchParams({
    q: query(os, q),
    sort,
    order: "desc",
    per_page: String(PAGE),
    page: String(page),
  });

  const data = await fetchJson(`${API}?${params}`, { timeout: 15000 });

  const raw = (data.items || []).length;
  const items = (data.items || []).map((it) => ({
    id: String(it.id),
    title: it.name,
    owner: it.owner?.login || "",
    icon: avatar(it.owner?.avatar_url),
    desc: (it.description || "").slice(0, 600),
    stars: num(it.stargazers_count),
    lang: it.language || "",
    license: lic(it.license),
    updated: when(it.pushed_at),
    url: it.html_url,
  })).filter((it) => it.title);

  const total = Math.min(data.total_count ?? 0, 1000);
  const more = raw === PAGE && page * PAGE < total;
  return { items, next: more ? String(page) : undefined };
}
