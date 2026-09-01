/* @ts-self-types="./sitelabel.d.ts" */
/**
 * sitelabel — turn a page URL into something a human reads in a list row, and group pages by the site they
 * belong to. Pure, DOM-free and network-free, so it is unit-tested, deterministic in the gate and correct
 * offline. Exports humanText (decode machine text once, where it enters a label), hostOf/registrableDomain/
 * siteName, pageLabel/pageLabelInfo/isWeakLabel, cleanPageTitle, sourceTitle (THE answer to "what is this
 * page called") and groupByDomain.
 * @module
 */
// sitelabel — turn a page URL into something a human reads in a list row, and group pages by the site they
// belong to. Pure + DOM-free + network-free → unit-tested, deterministic in the gate, correct offline.
//
// Why derive instead of fetching <title>: a subscriptions list is N rows, and N HEAD/GET round-trips through
// the proxy to read a title would make the tab slow, flaky and useless offline — while the URL already
// carries the answer on almost every site that lists videos (`/free-stock-video/space/`,
// `/wiki/Category:Underwater_videos`, `/search?q=cats`).
import { resolveSearch } from "./urlquery.js";

/* ── the text a page's name arrives as, before it is a name ──────────────────────────────────────────────
   Every producer here hands us machine text: a URL path is percent-encoded, a scraped <title> is HTML with
   entities in it, and a title derived from a filename is BOTH. Three measured failures, all of them visible
   in the sources list:
     · `decodeURIComponent("/a-100%-sure-thing/")` throws URIError for the WHOLE string — one literal percent
       anywhere in a path took down every label derived from it (and with it the row that rendered it).
     · a double-encoded path (`%2520`) survives one decode as a visible `%20`.
     · `&amp;`, `&#039;`, `&#8217;` reach us whole: the extractor decodes a short named list and nothing
       numeric, so anything outside it ships to the screen as its markup.
   humanText is the one answer, and it is applied where the text ENTERS a label — never at the moment of
   render, which is how two screens end up disagreeing about the same page. */
const decodeOnce = (s) => {
  try { return decodeURIComponent(s); } catch { /* one bad sequence poisons the whole string → per-run below */ }
  // Decode each RUN of valid escapes on its own, so a malformed `%zz` costs only itself. Runs, not single
  // escapes: a multi-byte UTF-8 character is several `%XX` in a row and only decodes together.
  return s.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
};
// Twice at most: `%2520` → `%20` → " ". Bounded, because a third pass starts eating text that legitimately
// contains a percent sign, and the second only runs when the first left something still encoded.
const percentDecode = (s) => { const one = decodeOnce(s); return /%[0-9a-f]{2}/i.test(one) ? decodeOnce(one) : one; };

// The named entities a page title actually carries (punctuation and the typographic quotes sites love).
// Numeric — decimal and hex — is handled generically, which is where the extractor's own short list ran out.
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•", laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", bdquo: "„", prime: "′", Prime: "″",
  deg: "°", times: "×", divide: "÷", plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§", para: "¶", dagger: "†",
};
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]{1,9});/gi, (m, g) => {
  if (g[0] === "#") {
    const cp = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;
    try { return String.fromCodePoint(cp); } catch { return m; }
  }
  const hit = NAMED[g] ?? NAMED[g.toLowerCase()];
  return hit === undefined ? m : hit;                                  // an unknown entity stays as it came
});

// humanText(raw) → the same string as text a person reads: decoded, unmarked-up, single-spaced. Never throws.
/**
 * Turn machine text (percent-encoded, entity-laden, or both) into the text a person reads. Never throws.
 * @param raw a URL segment, a scraped title, a filename-derived title
 * @returns the decoded, unmarked-up, single-spaced string
 */
export function humanText(raw) {
  const s = decodeEntities(percentDecode(String(raw ?? "")));
  return s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")                                  // control characters are not typography
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")                              // zero-width joiners/marks: invisible weight
    .replace(/\s+/g, " ")                                              // \s covers the NBSP the entities just made
    .trim();
}

// Two-label public suffixes we actually meet. Not a full PSL (that's a 200 kB list): the point is only that
// `commons.wikimedia.org` and `wikimedia.org` land in ONE group, and `bbc.co.uk` isn't grouped as `co.uk`.
const MULTI_SUFFIX = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.il",
  "com.ua", "net.ua", "org.ua", "kiev.ua", "com.pl", "com.br", "com.au", "com.tr", "com.cn",
  "com.mx", "com.ar", "com.sg", "com.hk", "com.tw", "com.ru", "org.ru", "net.ru",
]);

/**
 * The hostname of a URL without a leading `www.`; a string that is not a URL comes back as itself.
 * @param url a page URL
 * @returns the bare hostname
 */
export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url || "").replace(/^www\./, ""); }
}

// The grouping key: the registrable domain (site), not the hostname — subdomains are pages of one site.
/**
 * The registrable domain of a host — the site, so subdomains group together (commons.wikimedia.org → wikimedia.org).
 * @param host a hostname
 * @returns the registrable domain, two-label public suffixes respected (bbc.co.uk stays bbc.co.uk)
 */
export function registrableDomain(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const p = h.split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  return MULTI_SUFFIX.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The site's display name: the label before the public suffix. mixkit.co → Mixkit · commons.wikimedia.org →
// Wikimedia. Deliberately NOT the full host — the host is shown next to it, in mono, as the precise value.
/**
 * The site's display name: the capitalised label before the public suffix (mixkit.co → Mixkit).
 * @param url a page URL
 * @returns the site name, or the registrable domain when there is no label to show
 */
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
/**
 * Is this label only a URL shape ("View video", "Video81234567") rather than a name? True when every token is weak.
 * @param label a derived label
 * @returns true when the label tells the reader nothing and the page should be asked for its own title
 */
export function isWeakLabel(label) {
  const toks = String(label || "").split(/[\s.,:;/|–—-]+/).filter(Boolean);
  return !toks.length || toks.every(isWeakToken);
}

const prettify = (raw, max) => {
  let s = humanText(raw)                                 // %D0%9A…, &amp; → the characters they stand for
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
/**
 * Derive a page's readable title from its URL and say whether the derivation found a name or only a shape.
 * @param url the page URL (a search results page is titled by its term)
 * @param opts `max` — the label's character cap (default 42)
 * @returns `{ label, weak }` — `weak: true` means the caller should ask the page for its own title
 */
export function pageLabelInfo(url, { max = 42 } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return { label: "", weak: true };
  let u;
  try { u = new URL(raw); } catch { const l = prettify(raw, max) || raw; return { label: l, weak: isWeakLabel(l) }; }
  const sr = resolveSearch(raw);                                     // a results page is titled by its term
  if (sr.searchable && sr.term.trim()) { const l = prettify(sr.term.trim(), max); return { label: l, weak: isWeakLabel(l) }; }
  // Decoded PER SEGMENT, after the split: decoding the whole path first would let an encoded `%2F` invent a
  // path separator, and one malformed escape anywhere used to throw URIError and take the whole label — and
  // the row rendering it — down with it. humanText decodes what it can and never throws.
  const segs = u.pathname.split("/").map((s) => humanText(s)).filter(Boolean);
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
/**
 * The readable title of THAT page (not the site), derived from its URL.
 * @param url the page URL
 * @param opts `max` — the label's character cap (default 42)
 * @returns the label; the site name for a bare root, the raw string for a non-URL
 */
export function pageLabel(url, opts) { return pageLabelInfo(url, opts).label; }

// cleanPageTitle(raw, url) → a page's OWN title (<title>/og:title, or an extracted clip title), with the site
// chrome every site staples on removed: "Slow river - TUBE.EXAMPLE" → "Slow river". Only a leading/trailing
// chunk that names the SITE is cut — never an inner one — so a real title containing a dash survives whole.
// Returns "" when nothing worth showing is left, so a caller can just `||` its way down the fallback chain.
const SEP = /\s+[-–—|·•:»«]+\s+|\s+[-–—|·•»«]\s*$|^\s*[-–—|·•»«]\s+/;
/**
 * A page's OWN title with the site chrome stripped off its ends ("Slow river - TUBE.EXAMPLE" → "Slow river").
 * @param raw the <title>/og:title or extracted clip title
 * @param url the page URL, used to recognise the site's name in the title
 * @param opts `max` — the character cap (default 64)
 * @returns the cleaned title, or "" when nothing worth showing is left
 */
export function cleanPageTitle(raw, url, { max = 64 } = {}) {
  let s = humanText(raw);                                            // entities + escapes, before anything reads it
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

// sourceTitle(url, { pageTitle, hint, max }) → THE one answer to "what is this page called", for a list row, an
// island, a drag-reveal — every place the farm names a source. Priority: a URL that names the page wins (it is
// short, offline-true and identical everywhere); otherwise the page's own title, then the caller's hint (the
// title of the clip you dived from), and only then the shape the URL could manage.
//
// `max` is the caller's ROOM, and it belongs to the caller: an island is one line beside four controls and
// wants the short form, a list row can wrap and wants the whole name. It used to be unstatable — every
// surface got the producers' own caps (42 from a URL, 64 from a page title) — so a row with three lines
// spare still showed a name ending in "…". Passed, it overrides BOTH producers with the same number, so the
// two can never disagree about where a name ends; omitted, each keeps the cap it always had.
/**
 * THE one answer to "what is this page called": a URL that names the page wins, then the page's own title,
 * then the caller's hint, and only then the shape the URL could manage.
 * @param url the page URL
 * @param opts `pageTitle` (the page's own title), `hint` (the title of the clip dived from), `max` (the caller's room; 0 = each producer's own cap)
 * @returns the name to show
 */
export function sourceTitle(url, { pageTitle = "", hint = "", max = 0 } = {}) {
  const lim = max ? { max } : undefined;
  const { label, weak } = pageLabelInfo(url, lim);
  if (!weak) return label;
  return cleanPageTitle(pageTitle, url, lim) || cleanPageTitle(hint, url, lim) || label;
}

// groupByDomain(list) → [{ domain, name, items }] in first-appearance order. `items` keep their input order,
// so "the page you added last" stays where the caller put it.
/**
 * Group pages by the site they belong to, in first-appearance order.
 * @param list URL strings or objects with a `url`
 * @returns [{ domain, name, items }] — `items` keep their input order
 */
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
