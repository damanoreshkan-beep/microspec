import { resolveSearch } from "./urlquery.js";

const decodeOnce = (s) => {
  try { return decodeURIComponent(s); } catch {  }
  return s.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
};
const percentDecode = (s) => { const one = decodeOnce(s); return /%[0-9a-f]{2}/i.test(one) ? decodeOnce(one) : one; };

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
  return hit === undefined ? m : hit;                                  
});


export function humanText(raw) {
  const s = decodeEntities(percentDecode(String(raw ?? "")));
  return s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")                                  
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")                              
    .replace(/\s+/g, " ")                                              
    .trim();
}


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



const WEAK_WORD = /^(?:a|the|view|views|watch|watching|play|player|preview|video|videos|vid|clip|clips|movie|movies|film|films|media|stream|streams|embed|item|page|show|new|hot|best|top|free|online|hd|sd|full)$/i;


const isWeakToken = (w) => WEAK_WORD.test(w) || /^\d+$/.test(w) || (/[A-Za-z]/.test(w) && /\d/.test(w)) || w.length < 2;

export function isWeakLabel(label) {
  const toks = String(label || "").split(/[\s.,:;/|–—-]+/).filter(Boolean);
  return !toks.length || toks.every(isWeakToken);
}
const prettify = (raw, max) => {
  let s = humanText(raw)                                 
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




export function pageLabelInfo(url, { max = 42 } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return { label: "", weak: true };
  let u;
  try { u = new URL(raw); } catch { const l = prettify(raw, max) || raw; return { label: l, weak: isWeakLabel(l) }; }
  const sr = resolveSearch(raw);                                     
  if (sr.searchable && sr.term.trim()) { const l = prettify(sr.term.trim(), max); return { label: l, weak: isWeakLabel(l) }; }
  const segs = u.pathname.split("/").map((s) => humanText(s)).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (isId(seg) || NOISE.test(seg.replace(/\.(?:html?|php|aspx?|jsp)$/i, ""))) continue;
    const out = prettify(seg, max);
    if (out) return { label: out, weak: isWeakLabel(out) };
  }
  return { label: siteName(raw), weak: segs.length > 0 };
}



export function pageLabel(url, opts) { return pageLabelInfo(url, opts).label; }


const SEP = /\s+[-–—|·•:»«]+\s+|\s+[-–—|·•»«]\s*$|^\s*[-–—|·•»«]\s+/;
export function cleanPageTitle(raw, url, { max = 64 } = {}) {
  let s = humanText(raw);                                            
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
  if (!s || isWeakLabel(s) || isSite(s)) return "";                  
  if (s.length > max) { const cut = s.slice(0, max), sp = cut.lastIndexOf(" "); s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…"; }
  return s;
}










export function sourceTitle(url, { pageTitle = "", hint = "", max = 0 } = {}) {
  const lim = max ? { max } : undefined;
  const { label, weak } = pageLabelInfo(url, lim);
  if (!weak) return label;
  return cleanPageTitle(pageTitle, url, lim) || cleanPageTitle(hint, url, lim) || label;
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
