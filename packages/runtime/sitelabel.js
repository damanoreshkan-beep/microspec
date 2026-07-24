import { resolveSearch } from "./urlquery.js";

const MULTI_SUFFIX = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.il",
  "com.ua", "net.ua", "org.ua", "kiev.ua", "com.pl", "com.br", "com.au", "com.tr", "com.cn",
  "com.mx", "com.ar", "com.sg", "com.hk", "com.tw", "com.ru", "org.ru", "net.ru",
]);

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url || "").replace(/^www\./, ""); }
}

export function registrableDomain(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const p = h.split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  return MULTI_SUFFIX.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function siteName(url) {
  const d = registrableDomain(hostOf(url));
  const first = (d.split(".")[0] || d).replace(/[-_]+/g, " ").trim();
  return cap(first) || d;
}

const NOISE = /^(?:index|default|home|main|page|pages|p|pg|paged|list|browse|view|watch|embed|media|videos?|clips?|en|uk|ua|ru|de|pl|www|html?|php)$/i;
const isId = (s) => /^[0-9]+$/.test(s) || /^[0-9a-f]{8,}$/i.test(s);   

const prettify = (raw, max) => {
  let s = String(raw || "")
    .replace(/\.(?:html?|php|aspx?|jsp)$/i, "")          
    .replace(/^[A-Za-zА-Яа-яІіЇїЄєҐґ]{2,12}:/, "")       
    .replace(/^[0-9]+[-_](?=\D)/, "")                    
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

export function pageLabel(url, { max = 42 } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let u;
  try { u = new URL(raw); } catch { return prettify(raw, max) || raw; }
  const sr = resolveSearch(raw);                                     
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
