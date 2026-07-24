// sitelabel — turn a page URL into something a human reads in a list row, and group pages by the site they
// belong to. Pure + DOM-free + network-free → unit-tested, deterministic in the gate, correct offline.
//
// Why derive instead of fetching <title>: a subscriptions list is N rows, and N HEAD/GET round-trips through
// the proxy to read a title would make the tab slow, flaky and useless offline — while the URL already
// carries the answer on almost every site that lists videos (`/free-stock-video/space/`,
// `/wiki/Category:Underwater_videos`, `/search?q=cats`).
import { resolveSearch } from "./urlquery.js";

// Two-label public suffixes we actually meet. Not a full PSL (that's a 200 kB list): the point is only that
// `commons.wikimedia.org` and `wikimedia.org` land in ONE group, and `bbc.co.uk` isn't grouped as `co.uk`.
const MULTI_SUFFIX = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.il",
  "com.ua", "net.ua", "org.ua", "kiev.ua", "com.pl", "com.br", "com.au", "com.tr", "com.cn",
  "com.mx", "com.ar", "com.sg", "com.hk", "com.tw", "com.ru", "org.ru", "net.ru",
]);

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url || "").replace(/^www\./, ""); }
}

// The grouping key: the registrable domain (site), not the hostname — subdomains are pages of one site.
export function registrableDomain(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const p = h.split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  return MULTI_SUFFIX.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The site's display name: the label before the public suffix. mixkit.co → Mixkit · commons.wikimedia.org →
// Wikimedia. Deliberately NOT the full host — the host is shown next to it, in mono, as the precise value.
export function siteName(url) {
  const d = registrableDomain(hostOf(url));
  const first = (d.split(".")[0] || d).replace(/[-_]+/g, " ").trim();
  return cap(first) || d;
}

// Path segments that never name a page — walking backwards we skip these to reach the one that does.
const NOISE = /^(?:index|default|home|main|page|pages|p|pg|paged|list|browse|view|watch|embed|media|videos?|clips?|en|uk|ua|ru|de|pl|www|html?|php)$/i;
const isId = (s) => /^[0-9]+$/.test(s) || /^[0-9a-f]{8,}$/i.test(s);   // 2, 00417, 3f9a1c8d… — an id, not a title

const prettify = (raw, max) => {
  let s = String(raw || "")
    .replace(/\.(?:html?|php|aspx?|jsp)$/i, "")          // page.html → page
    .replace(/^[A-Za-zА-Яа-яІіЇїЄєҐґ]{2,12}:/, "")       // Category:Underwater_videos → Underwater_videos
    .replace(/^[0-9]+[-_](?=\D)/, "")                    // 12345-some-title → some-title
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  s = cap(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
};

// pageLabel(url) → the readable title of THAT page (not the site). Falls back to the site name for a bare
// root URL, and to the raw string for anything that isn't a URL at all.
export function pageLabel(url, { max = 42 } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let u;
  try { u = new URL(raw); } catch { return prettify(raw, max) || raw; }
  const sr = resolveSearch(raw);                                     // a results page is titled by its term
  if (sr.searchable && sr.term.trim()) return prettify(sr.term.trim(), max);
  const segs = decodeURIComponent(u.pathname).split("/").map((s) => s.trim()).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (isId(seg) || NOISE.test(seg.replace(/\.(?:html?|php|aspx?|jsp)$/i, ""))) continue;
    const out = prettify(seg, max);
    if (out) return out;
  }
  return siteName(raw);
}

// groupByDomain(list) → [{ domain, name, items }] in first-appearance order. `items` keep their input order,
// so "the page you added last" stays where the caller put it.
export function groupByDomain(list) {
  const groups = new Map();
  for (const s of list || []) {
    const url = typeof s === "string" ? s : s?.url;
    if (!url) continue;
    const domain = registrableDomain(hostOf(url));
    if (!groups.has(domain)) groups.set(domain, { domain, name: siteName(url), items: [] });
    groups.get(domain).items.push(s);
  }
  return [...groups.values()];
}
