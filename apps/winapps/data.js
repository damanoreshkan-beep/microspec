import { viaProxy } from "/_rt/feed.js";

const API = "https://community.chocolatey.org/api/v2";
const PAGE = 24;

const entries = (xml) => xml.split("<entry>").slice(1);
const field = (e, tag) => {
  const m = e.match(new RegExp(`<d:${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</d:${tag}>`));
  return m ? m[1].trim() : "";
};
const atom = (e, tag) => {
  const m = e.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
};
const author = (e) => (e.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/) || [, ""])[1].trim();
const decode = (s) => s
  .replace(/<[^>]*>/g, " ")
  .replace(/&(lt|gt|amp|quot|apos|#39|nbsp);/gi, (m) => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " }[m.toLowerCase()] || " "))
  .replace(/\s+/g, " ")
  .trim();

const num = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v || ""); };
const when = (s) => { const d = new Date(s); return isFinite(+d) ? +d : null; };

const url = (q, page) => {
  const skip = (page || 0) * PAGE;
  const qs = [
    "$filter=IsLatestVersion",
    `$orderby=${encodeURIComponent("DownloadCount desc")}`, 
    `$top=${PAGE}`,
    `$skip=${skip}`,
  ];
  if (!q) return `${API}/Packages()?${qs.join("&")}`;
  const esc = encodeURIComponent(q.replace(/'/g, "''"));    
  return `${API}/Search()?searchTerm='${esc}'&targetFramework=''&includePrerelease=false&${qs.join("&")}`;
};

export async function load(filters = {}, cursor) {
  const q = (filters.q || "").trim().toLowerCase();
  const page = Number(cursor) || 0;
  const xml = await viaProxy(url(q, page), (t) => typeof t === "string" && t.includes("<feed"), 15000);

  const items = entries(xml).map((e) => {
    const id = decode(atom(e, "title")), version = field(e, "Version");
    const icon = field(e, "IconUrl");
    return {
      id: `${id}@${version}`,
      pkg: id,
      title: decode(field(e, "Title")) || id,
      publisher: decode(author(e)),
      desc: decode(atom(e, "summary") || field(e, "Description")).slice(0, 600),
      version,
      icon: icon || "",
      downloads: num(field(e, "DownloadCount")),
      install: id ? `choco install ${id}` : "",
      updated: when(field(e, "Published")),
      url: id ? `https://community.chocolatey.org/packages/${encodeURIComponent(id)}` : "",
    };
  }).filter((it) => it.pkg && it.title);

  return { items, next: items.length === PAGE ? String(page + 1) : undefined };
}
