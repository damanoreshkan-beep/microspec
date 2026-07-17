// Каталог програм — Windows software, from the Chocolatey community feed.
//
// No view.js: the showcase is `layout: "gallery"`, the drill-down is `spec.detail`, and search/favourites
// come from the list family. This app is the first real consumer of gallery — the launcher `grid` the store
// once used cannot carry a publisher line or a version, which is the whole reason a catalogue is scanned.
//
// Source, probed before a line was written:
// • api.winget.run is DEAD — frozen at 2023-03 (Notepad++ 8.5), ZERO icons across 132 packages sampled, and
//   its search answers "vlc" with "Flock". A grid of icons on a source with no icons is not a design.
// • community.chocolatey.org is alive and current (Chrome 151, Firefox 152, Acrobat 2026.1), carries real
//   IconUrl on ~7 of 8 packages, and DownloadCount is a real popularity signal.
//
// It has NO CORS, so this is one of the two apps in the farm that needs our own proxy (the other is dou).
// Public proxies are banned here — they die and take the app with them; ours is host-allowlisted and up.
// The icons themselves are fetched DIRECTLY: <img src> loads cross-origin without CORS, so 20 icon requests
// per page never touch the proxy.
//
// And it speaks OData/Atom XML, not JSON — the first non-JSON source in the farm.
import { viaProxy } from "/_rt/feed.js";

const API = "https://community.chocolatey.org/api/v2";
const PAGE = 24;

// A deliberately small XML reader rather than DOMParser: this runs inside the browser-free preflight too,
// where there is no DOMParser at all. The feed's shape is fixed and flat (<entry> → <d:Field>), so a
// regex per field is honest here — it is not parsing arbitrary markup, it is reading a known table.
// The feed's real shape, read off the wire rather than assumed — there is no <d:Id>, no <d:Authors> and no
// <d:Summary>, all of which are the obvious guesses:
//   <title>          → the PACKAGE ID ("adobereader")          — what you install
//   <d:Title>        → the display name ("Adobe Acrobat Reader DC")
//   <author><name>   → the publisher ("Adobe")                 — the line that tells two similar apps apart
//   <summary>        → the short description (often empty → fall back to <d:Description>)
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
// The published date is an OData timestamp; the card/detail want a real Date so the runtime can render it
// locale-aware with format:"ago". Never format it here — a baked string freezes one language.
const when = (s) => { const d = new Date(s); return isFinite(+d) ? +d : null; };

// Built by hand, NOT with URLSearchParams: it serialises as form-encoding, which escapes `$` — so every
// OData parameter arrives as `%24filter` and the server answers 406, having been asked nothing it knows.
//
// Browsing and searching are two different endpoints here, and the obvious guess is the wrong one:
// `$filter=substringof('vlc',Id)` returns ZERO — the feed simply does not answer that. Search lives in
// NuGet's own Search() function, and it 400s unless `targetFramework` and `includePrerelease` are BOTH
// present, empty string and false being perfectly acceptable values. Measured, not assumed.
const url = (q, page) => {
  const skip = (page || 0) * PAGE;
  const qs = [
    "$filter=IsLatestVersion",
    `$orderby=${encodeURIComponent("DownloadCount desc")}`, // what people install, not what was pushed last
    `$top=${PAGE}`,
    `$skip=${skip}`,
  ];
  if (!q) return `${API}/Packages()?${qs.join("&")}`;
  // The catalogue is thousands of packages: the answer to "vlc" is not in the first 24, so search is the
  // one thing that must go to the server rather than sieve what is already on screen.
  const esc = encodeURIComponent(q.replace(/'/g, "''"));    // OData escapes a quote by doubling it
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
      // A package with no icon gets the family glyph rather than a broken <img> — the tile is the
      // recognition, and an empty frame reads as a failed load, not as "this one has no icon".
      icon: icon || "",
      downloads: num(field(e, "DownloadCount")),
      install: id ? `choco install ${id}` : "",
      updated: when(field(e, "Published")),
      url: id ? `https://community.chocolatey.org/packages/${encodeURIComponent(id)}` : "",
    };
  }).filter((it) => it.pkg && it.title);

  // paginate: a full page means there is probably another one behind it
  return { items, next: items.length === PAGE ? String(page + 1) : undefined };
}
