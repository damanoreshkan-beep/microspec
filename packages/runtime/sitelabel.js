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

// Words that name a MEDIUM, not a page. A label built only out of these (plus ids) is a label that tells you
// nothing: `/view_video.php` → "View video", `/video81234567/` → "Video81234567". Those are the URLs a video
// page uses, which is exactly where deriving a title from the URL stops working and the page has to be asked.
const WEAK_WORD = /^(?:a|the|view|views|watch|watching|play|player|preview|video|videos|vid|clip|clips|movie|movies|film|films|media|stream|streams|embed|item|page|show|new|hot|best|top|free|online|hd|sd|full)$/i;
// …plus anything that is an ID wearing a word's clothes: a bare number, or a blob mixing letters and digits
// (`video81234567`, `abC123`, `ph5f2a1b`). A real title's words are one or the other.
const isWeakToken = (w) => WEAK_WORD.test(w) || /^\d+$/.test(w) || (/[A-Za-z]/.test(w) && /\d/.test(w)) || w.length < 2;
// A label is weak when every token in it is weak — "Big buck bunny" is a title, "View video" is a URL shape.
export function isWeakLabel(label) {
  const toks = String(label || "").split(/[\s.,:;/|–—-]+/).filter(Boolean);
  return !toks.length || toks.every(isWeakToken);
}

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

// pageLabelInfo(url) → the readable title of THAT page derived from its URL, PLUS whether that derivation
// actually found a name (`weak: false`) or only produced a shape (`weak: true`). The caller needs the second
// half: a weak label is the signal to ask the page itself what it is called, instead of showing "View video".
export function pageLabelInfo(url, { max = 42 } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return { label: "", weak: true };
  let u;
  try { u = new URL(raw); } catch { const l = prettify(raw, max) || raw; return { label: l, weak: isWeakLabel(l) }; }
  const sr = resolveSearch(raw);                                     // a results page is titled by its term
  if (sr.searchable && sr.term.trim()) { const l = prettify(sr.term.trim(), max); return { label: l, weak: isWeakLabel(l) }; }
  const segs = decodeURIComponent(u.pathname).split("/").map((s) => s.trim()).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (isId(seg) || NOISE.test(seg.replace(/\.(?:html?|php|aspx?|jsp)$/i, ""))) continue;
    const out = prettify(seg, max);
    if (out) return { label: out, weak: isWeakLabel(out) };
  }
  // No segment named the page. On a BARE ROOT that is the honest answer — the site's front page is the site,
  // and its <title> is a marketing line ("Download Free Stock Video & Footage | No Watermark"). But a path
  // that exists and still named nothing (`/12345678`) is a page we simply failed to read: that one is weak.
  return { label: siteName(raw), weak: segs.length > 0 };
}

// pageLabel(url) → the readable title of THAT page (not the site). Falls back to the site name for a bare
// root URL, and to the raw string for anything that isn't a URL at all.
export function pageLabel(url, opts) { return pageLabelInfo(url, opts).label; }

// cleanPageTitle(raw, url) → a page's OWN title (<title>/og:title, or an extracted clip title), with the site
// chrome every site staples on removed: "Slow river - TUBE.EXAMPLE" → "Slow river". Only a leading/trailing
// chunk that names the SITE is cut — never an inner one — so a real title containing a dash survives whole.
// Returns "" when nothing worth showing is left, so a caller can just `||` its way down the fallback chain.
const SEP = /\s+[-–—|·•:»«]+\s+|\s+[-–—|·•»«]\s*$|^\s*[-–—|·•»«]\s+/;
export function cleanPageTitle(raw, url, { max = 64 } = {}) {
  let s = String(raw || "").replace(/[\s ]+/g, " ").trim();
  if (!s) return "";
  const site = siteName(url).toLowerCase(), host = hostOf(url).toLowerCase();
  const key = (x) => x.toLowerCase().replace(/[^a-z0-9а-яїієґ]+/gi, "");
  const isSite = (chunk) => {
    const k = key(chunk); if (!k || k.length > 40) return false;
    return k === key(site) || k === key(host) || k === key(registrableDomain(host)) ||
      (site.length >= 4 && (k.startsWith(key(site)) || k.endsWith(key(site))));
  };
  const parts = s.split(SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    while (parts.length > 1 && isSite(parts[parts.length - 1])) parts.pop();
    while (parts.length > 1 && isSite(parts[0])) parts.shift();
    s = parts.join(" – ");
  }
  s = s.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "").trim();
  if (!s || isWeakLabel(s) || isSite(s)) return "";                  // "video", "Watch HD", the site's own name
  if (s.length > max) { const cut = s.slice(0, max), sp = cut.lastIndexOf(" "); s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…"; }
  return s;
}

// sourceTitle(url, { pageTitle, hint }) → THE one answer to "what is this page called", for a list row, an
// island, a drag-reveal — every place the farm names a source. Priority: a URL that names the page wins (it is
// short, offline-true and identical everywhere); otherwise the page's own title, then the caller's hint (the
// title of the clip you dived from), and only then the shape the URL could manage.
export function sourceTitle(url, { pageTitle = "", hint = "" } = {}) {
  const { label, weak } = pageLabelInfo(url);
  if (!weak) return label;
  return cleanPageTitle(pageTitle, url) || cleanPageTitle(hint, url) || label;
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
