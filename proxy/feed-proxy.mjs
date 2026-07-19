// microspec — hardened same-origin proxy for the sources that need a backend. Runs on the VPS behind nginx
// (HTTPS at jobs-map.mooo.com, location /feed → this). Binds to localhost so only nginx reaches it. Node 18+
// (global fetch), zero dependencies.
//
//   PORT=8787 BFL_KEY=… node feed-proxy.mjs
//   GET  /feed?url=<enc>          → CORS text passthrough, allowlisted hosts (the original feed proxy)
//   POST /feed/flux               → FLUX.2 create; the ONLY place the paid key is used (server-side)
//   GET  /feed/flux/get?url=<enc> → keyless, binary-safe passthrough to bfl.ai only (poll + delivery image)
//   GET  /feed/horoscope?sign=1..12&day=today|tomorrow|yesterday → real horoscope.com reading, parsed to
//                                  compact JSON {date,sign,day,text,ratings} + CORS, cached per day.
//   GET  /feed/videos?url=<enc>   → light HTML video extractor: pulls playable video URLs (+ poster/title) and
//                                  the next-page link from any page, for the tiktok-style reel app. SSRF-guarded.
//   GET  /health                 → "ok"
import http from "node:http";
import dns from "node:dns/promises";

const PORT = Number(process.env.PORT) || 8787;
const BFL_KEY = process.env.BFL_KEY || "";
// The create target is a SERVER CONSTANT — never built from client input, so the key can never be aimed
// anywhere but Black Forest Labs (no SSRF surface for the secret).
const FLUX_CREATE = "https://api.bfl.ai/v1/flux-2-pro-preview";
// The paid create endpoint is origin-guarded (browsers enforce Origin) + rate-limited. A wall against casual
// web abuse, not a cryptographic one — a determined non-browser client can still spend, so keep a BFL cap too.
const ALLOW_ORIGIN = new Set(["https://damanoreshkan-beep.github.io"]);
// Original /feed allowlist (unchanged). NEVER an open proxy.
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i, /(^|\.)gutendex\.com$/i, /(^|\.)chocolatey\.org$/i];
// Keyless flux passthrough is restricted to Black Forest Labs hosts (polling_url + the signed delivery image).
const ALLOW_FLUX = [/(^|\.)bfl\.ai$/i, /(^|\.)bfl\.ml$/i];
const UA ="Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
// SSRF guard for the arbitrary-URL video extractor: only http(s), and the resolved IP must not be private/loopback
// (so a user-supplied URL can never make the proxy hit our own metadata/LAN). Best-effort single-lookup check.
const PRIVATE_IP = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;
async function safeUrl(raw) {
  let url; try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  try { const { address } = await dns.lookup(url.hostname); if (PRIVATE_IP.test(address)) return null; } catch { return null; }
  return url;
}

// crude per-IP rate limit on the paid path — a backstop, not billing.
const hits = new Map();
function rateOk(ip) {
  const now = Date.now(), win = 60_000, max = 12;
  const a = (hits.get(ip) || []).filter((t) => now - t < win);
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return a.length <= max;
}
const ipOf = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
const readBody = (req) => new Promise((resolve, reject) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 8000) req.destroy(); }); req.on("end", () => resolve(b)); req.on("error", reject); });
const send = (res, code, headers, body) => { res.writeHead(code, headers); res.end(body); };

// ── horoscope.com → compact JSON. Target is a SERVER CONSTANT (only int sign + enum day interpolated), so
// there is no SSRF surface; results are cached per (sign,day) since horoscope.com updates once a day. ──
const HORO_DAYS = new Set(["today", "tomorrow", "yesterday"]);
const HORO_TTL = 3 * 3600_000;
const horoCache = new Map(); // `${sign}|${day}` → { ts, data }
const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, "&");
function parseHoroscope(html) {
  const seg = html.slice(html.indexOf("main-horoscope"));        // reading = first <p> after the nav switcher
  const pm = seg.match(/<p>([\s\S]*?)<\/p>/);
  if (!pm) return null;
  let text = decodeEntities(pm[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  let date = "";
  const dm = text.match(/^([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*-\s*/);  // strip "Jul 19, 2026 - " prefix
  if (dm) { date = dm[1]; text = text.slice(dm[0].length).trim(); }
  if (!text || text.length < 40) return null;
  const ratings = {};                                            // Sex/Hustle/Vibe/Success, each = # filled stars
  const ri = html.indexOf('class="ratings');
  if (ri > -1) {
    const rblock = html.slice(ri, ri + 1600), re = /<h4>([^<]+)<\/h4>((?:(?!<\/a>)[\s\S])*)/g;
    const map = { Sex: "sex", Hustle: "hustle", Vibe: "vibe", Success: "success" };
    let m; while ((m = re.exec(rblock))) { const k = map[m[1].trim()]; if (k) ratings[k] = (m[2].match(/icon-star-filled highlight/g) || []).length; }
  }
  return { date, text, ratings };
}

// ── light HTML video extractor (keyless). Pulls playable video URLs from a page via the common embed patterns
// (<video>/<source>, og:video, JSON-LD contentUrl, and bare .mp4/.m3u8/.webm anywhere), dedupes transcoded /
// resolution variants down to one item each, and finds the next-page link (rel=next, else a ?page-style bump).
// No browser — works on any page that puts its media in the HTML; JS-only sites just return []. ──
const humanize = (s) => { try { s = decodeURIComponent(s); } catch {} return s.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim(); };
const firstUrl = (x) => Array.isArray(x) ? firstUrl(x[0]) : (x && typeof x === "object" ? (x.url || x.contentUrl) : x);
function parseVideos(html, base) {
  const abs = (u) => { try { return new URL(String(u).replace(/&amp;/g, "&"), base).href; } catch { return null; } };
  const isVid = (u) => /\.(?:mp4|m3u8|webm|mov)(?:\?|#|$)/i.test(u);
  // dedupe key: last path segment, sans /transcoded/, extension, and resolution/fps/quality tokens (so a video
  // published in 360p/720p/1080p collapses to one item).
  const normKey = (url) => {
    try {
      const u = new URL(url); let seg = (decodeURIComponent(u.pathname).replace(/\/transcoded\//, "/").split("/").filter(Boolean).pop() || "").toLowerCase();
      const ext = (seg.match(/\.(mp4|webm|m3u8|mov)$/) || [, ""])[1]; seg = seg.replace(/\.(?:mp4|webm|m3u8|mov)$/, "");
      seg = seg.replace(/([_-]|\b)(?:\d{2,4}p|\d{2,4}px|\d{2,4}[_-]\d{2,4}|\d{1,3}fps|hd|sd|hi|lo|small|medium|large|orig(?:inal)?)(?=$|[_-])/gi, "");
      return seg.replace(/[_-]+$/, "") + "." + ext;
    } catch { return url; }
  };
  // (a) JSON-LD VideoObject → the most reliable per-item title + thumbnail when a site ships schema.org data.
  const meta = new Map();
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (String(o["@type"] || "").toLowerCase().includes("video")) { const v = abs(o.contentUrl || o.embedUrl || ""); if (v) meta.set(normKey(v), { title: o.name || o.headline, poster: abs(firstUrl(o.thumbnailUrl)) }); }
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* bad ld+json — skip */ }
  }
  // (b) candidate videos with their source position + any inline poster/title on the <video> tag.
  const cands = [], vtitle = new Map();
  const addAt = (url, pos, poster) => { const a = abs(url); if (a && isVid(a)) cands.push({ url: a, pos, poster: poster ? abs(poster) : null }); };
  for (const m of html.matchAll(/<video\b([^>]*)>/gi)) { const src = (m[1].match(/\bsrc=["']([^"']+)["']/) || [])[1]; const p = (m[1].match(/\bposter=["']([^"']+)["']/) || [])[1]; const tt = (m[1].match(/\b(?:title|aria-label|data-title)=["']([^"']{3,120})["']/) || [])[1]; if (src) { addAt(src, m.index, p); if (tt) vtitle.set(normKey(abs(src) || src), decodeEntities(tt).trim()); } }
  for (const m of html.matchAll(/<source\b[^>]*\bsrc=["']([^"']+)["']/gi)) addAt(m[1], m.index, null);
  for (const m of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:video(?::url|:secure_url)?)["'][^>]*\bcontent=["']([^"']+)["']/gi)) addAt(m[1], m.index, null);
  for (const m of html.matchAll(/"(?:contentUrl|embedUrl)"\s*:\s*"([^"\\]+)"/gi)) addAt(m[1], m.index, null);
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s\\<>]+?\.(?:mp4|m3u8|webm)(?:\?[^"'\s\\<>]*)?/gi)) addAt(m[0].replace(/\\/g, ""), m.index, null);
  // (c) poster-only proximity: the <img> that most looks like a thumbnail nearest the video's HTML position.
  // (Proximity TITLES are dropped — they grab page chrome; the filename/JSON-LD title is cleaner.)
  const proximity = (pos) => {
    const start = Math.max(0, pos - 3500), win = html.slice(start, pos + 1000), rel = pos - start;
    let poster = null, bestScore = -Infinity;
    for (const m of win.matchAll(/<img\b[^>]*?\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/gi)) {
      const u = m[1]; if (!/^https?:|^\/\//.test(u) && !u.startsWith("/")) continue;
      const score = (/thumb|preview|poster|cover|_medium|\d{2,4}x\d{2,4}|\d{2,4}px/i.test(u) ? 4000 : 0) - Math.abs(m.index - rel);
      if (score > bestScore) { bestScore = score; poster = u; }
    }
    return poster ? abs(poster) : null;
  };
  const seen = new Set(), items = [];
  for (const c of cands) {
    const k = normKey(c.url); if (seen.has(k)) continue; seen.add(k);
    const md = meta.get(k) || {};
    const title = ((md.title && decodeEntities(String(md.title)).trim()) || vtitle.get(k) || humanize(k) || "video").slice(0, 140);
    items.push({ video: c.url, title, poster: c.poster || md.poster || proximity(c.pos) || null });
  }
  // ── next-page discovery, layered (most reliable first): <link|a rel=next> → an anchor that READS like "next"
  // by aria-label / class / short link text (multilingual, excluding "previous") → a ?page-style param bump.
  // (A JS "load more" button that fires XHR has no href and can't be followed without a browser.) ──
  const NEXT_RX = /(?:^|[^a-zа-я])(?:next|older|newer|load\s*more|show\s*more|näch|weiter|suivant|pró?xim|siguiente|successiv|volgende|næste|nästa|następn|далі|наступн|вперед|показати ще|ще|дальше|ещё|еще)(?:[^a-zа-я]|$)|[»›→]/i;
  const PREV_RX = /(?:^|[^a-zа-я])(?:prev(?:ious)?|zurück|précéd|anterior|vorige|forrige|föregå|poprzedn|попередн|назад|предыдущ)(?:[^a-zа-я]|$)|[«‹←]/i;
  const badHref = (h) => !h || /^(?:#|javascript:|mailto:|tel:)/i.test(h);
  let next = null;
  const relm = html.match(/<(?:a|link)\b[^>]*\brel=["'][^"']*\bnext\b[^"']*["'][^>]*\bhref=["']([^"']+)["']/i) || html.match(/<(?:a|link)\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*\bnext\b[^"']*["']/i);
  if (relm && !badHref(relm[1])) next = abs(relm[1]);
  if (!next) {
    for (const m of html.matchAll(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]{0,160}?)<\/a>/gi)) {
      const href = m[2]; if (badHref(href)) continue;
      const attrs = m[1] + " " + m[3];
      const aria = (attrs.match(/\baria-label=["']([^"']*)["']/i) || [, ""])[1];
      const cls = (attrs.match(/\bclass=["']([^"']*)["']/i) || [, ""])[1];
      const txt = decodeEntities(m[4].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (PREV_RX.test(`${aria} ${txt} ${cls.replace(/[-_]/g, " ")}`)) continue;
      const classNext = /\bnext\b/i.test(cls) || /\b(?:pagination|pager|load[-_]?more)\b/i.test(cls);
      if (NEXT_RX.test(aria) || classNext || (txt.length <= 20 && NEXT_RX.test(txt))) { const a = abs(href); if (a && a !== base) { next = a; break; } }
    }
  }
  if (!next) { try { const u = new URL(base); for (const key of ["page", "p", "pg", "paged", "offset", "start", "from", "skip"]) { if (u.searchParams.has(key)) { const n = parseInt(u.searchParams.get(key), 10); if (!isNaN(n)) { u.searchParams.set(key, (key === "offset" || key === "start" || key === "skip") ? n + Math.max(1, items.length) : n + 1); next = u.href; break; } } } } catch { /* no cursor */ } }
  return { items, next };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;
  if (req.method === "OPTIONS") return send(res, 204, CORS, "");
  if (p === "/health") return send(res, 200, CORS, "ok");

  // ── FLUX.2 create — the ONLY key-bearing call. Target is constant; only whitelisted fields are forwarded. ──
  if (p === "/feed/flux" && req.method === "POST") {
    if (!BFL_KEY) return send(res, 500, CORS, "no key configured");
    const origin = req.headers.origin || "";
    if (!ALLOW_ORIGIN.has(origin)) return send(res, 403, CORS, "origin not allowed");
    if (!rateOk(ipOf(req))) return send(res, 429, CORS, "rate limited");
    let inp;
    try { inp = JSON.parse(await readBody(req)); } catch { return send(res, 400, CORS, "bad json"); }
    const prompt = String(inp.prompt || "").slice(0, 4000).trim();
    if (!prompt) return send(res, 400, CORS, "empty prompt");
    const body = { prompt, output_format: inp.output_format === "png" ? "png" : "jpeg", safety_tolerance: 2 };
    if (Number.isInteger(inp.width)) body.width = inp.width;
    if (Number.isInteger(inp.height)) body.height = inp.height;
    if (Number.isInteger(inp.seed)) body.seed = inp.seed;
    try {
      const r = await fetch(FLUX_CREATE, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-key": BFL_KEY }, body: JSON.stringify(body) });
      return send(res, r.status, { ...CORS, "content-type": "application/json" }, await r.text());
    } catch { return send(res, 502, CORS, "upstream error"); }
  }

  // ── keyless, binary-safe passthrough for polling_url + the signed delivery image (bfl hosts only) ──
  if (p === "/feed/flux/get" && req.method === "GET") {
    const target = u.searchParams.get("url");
    let host; try { host = new URL(target).hostname; } catch { return send(res, 400, CORS, "bad url"); }
    if (!ALLOW_FLUX.some((re) => re.test(host))) return send(res, 403, CORS, "host not allowed");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(target, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" });
      const ab = await r.arrayBuffer();
      send(res, r.status, { ...CORS, "content-type": r.headers.get("content-type") || "application/octet-stream" }, Buffer.from(ab));
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  // ── real horoscope readings from horoscope.com (parsed, cached per day) ──
  if (p === "/feed/horoscope" && req.method === "GET") {
    const sign = Number(u.searchParams.get("sign")), day = String(u.searchParams.get("day") || "today");
    if (!Number.isInteger(sign) || sign < 1 || sign > 12 || !HORO_DAYS.has(day)) return send(res, 400, CORS, "bad params");
    const key = `${sign}|${day}`, hit = horoCache.get(key);
    if (hit && Date.now() - hit.ts < HORO_TTL) return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify(hit.data));
    const target = `https://www.horoscope.com/us/horoscopes/general/horoscope-general-daily-${day}.aspx?sign=${sign}`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(target, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" });
      const parsed = parseHoroscope(await r.text());
      if (!parsed) return send(res, 502, CORS, "parse failed");
      const data = { sign, day, date: parsed.date, text: parsed.text, ratings: parsed.ratings };
      if (horoCache.size > 200) horoCache.clear();
      horoCache.set(key, { ts: Date.now(), data });
      send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify(data));
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  // ── light video extractor for the reel app: any page URL → playable videos + next-page cursor (SSRF-guarded) ──
  if (p === "/feed/videos" && req.method === "GET") {
    const src = await safeUrl(u.searchParams.get("url"));
    if (!src) return send(res, 400, { ...CORS, "content-type": "application/json" }, JSON.stringify({ items: [], next: null, error: "bad or blocked url" }));
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(src.href, { headers: { "user-agent": UA_DESKTOP, "accept-language": "en-US,en;q=0.9", "accept": "text/html,application/xhtml+xml" }, signal: ctrl.signal, redirect: "follow" });
      const ct = r.headers.get("content-type") || "";
      const J = { ...CORS, "content-type": "application/json" };
      if (!/html|xml|json/i.test(ct)) return send(res, 200, J, JSON.stringify({ items: [], next: null, note: "not an html page" }));
      send(res, 200, J, JSON.stringify(parseVideos(await r.text(), r.url)));
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  // ── original /feed (unchanged) ──
  if (p === "/feed" && req.method === "GET") {
    const target = u.searchParams.get("url");
    let host; try { host = new URL(target).hostname; } catch { return send(res, 400, CORS, "bad url"); }
    if (!ALLOW.some((re) => re.test(host))) return send(res, 403, CORS, "host not allowed");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(target, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" });
      const body = await r.text();
      send(res, r.status, { ...CORS, "content-type": r.headers.get("content-type") || "text/plain; charset=utf-8" }, body);
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  send(res, 404, CORS, "not found");
});

server.listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`feed-proxy listening on 127.0.0.1:${PORT}`));
