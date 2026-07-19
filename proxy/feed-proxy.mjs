import http from "node:http";
import dns from "node:dns/promises";

const PORT = Number(process.env.PORT) || 8787;
const BFL_KEY = process.env.BFL_KEY || "";
const FLUX_CREATE = "https://api.bfl.ai/v1/flux-2-pro-preview";
const ALLOW_ORIGIN = new Set(["https://damanoreshkan-beep.github.io"]);
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i, /(^|\.)gutendex\.com$/i, /(^|\.)chocolatey\.org$/i];
const ALLOW_FLUX = [/(^|\.)bfl\.ai$/i, /(^|\.)bfl\.ml$/i];
const UA ="Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const PRIVATE_IP = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;
async function safeUrl(raw) {
  let url; try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  try { const { address } = await dns.lookup(url.hostname); if (PRIVATE_IP.test(address)) return null; } catch { return null; }
  return url;
}

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

const HORO_DAYS = new Set(["today", "tomorrow", "yesterday"]);
const HORO_TTL = 3 * 3600_000;
const horoCache = new Map(); 
const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, "&");
function parseHoroscope(html) {
  const seg = html.slice(html.indexOf("main-horoscope"));        
  const pm = seg.match(/<p>([\s\S]*?)<\/p>/);
  if (!pm) return null;
  let text = decodeEntities(pm[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  let date = "";
  const dm = text.match(/^([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*-\s*/);  
  if (dm) { date = dm[1]; text = text.slice(dm[0].length).trim(); }
  if (!text || text.length < 40) return null;
  const ratings = {};                                            
  const ri = html.indexOf('class="ratings');
  if (ri > -1) {
    const rblock = html.slice(ri, ri + 1600), re = /<h4>([^<]+)<\/h4>((?:(?!<\/a>)[\s\S])*)/g;
    const map = { Sex: "sex", Hustle: "hustle", Vibe: "vibe", Success: "success" };
    let m; while ((m = re.exec(rblock))) { const k = map[m[1].trim()]; if (k) ratings[k] = (m[2].match(/icon-star-filled highlight/g) || []).length; }
  }
  return { date, text, ratings };
}

const humanize = (s) => { try { s = decodeURIComponent(s); } catch {} return s.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim(); };
function parseVideos(html, base) {
  const abs = (u) => { try { return new URL(String(u).replace(/&amp;/g, "&"), base).href; } catch { return null; } };
  const isVid = (u) => /\.(?:mp4|m3u8|webm|mov)(?:\?|#|$)/i.test(u);
  const found = [];
  const add = (u) => { const a = abs(u); if (a && isVid(a)) found.push(a); };
  for (const m of html.matchAll(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:video(?::url|:secure_url)?|twitter:player:stream)["'][^>]*\bcontent=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:video(?::url|:secure_url)?|twitter:player:stream)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/"(?:contentUrl|embedUrl)"\s*:\s*"([^"\\]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s\\<>]+?\.(?:mp4|m3u8|webm)(?:\?[^"'\s\\<>]*)?/gi)) add(m[0].replace(/\\/g, ""));
  const norm = (url) => { try { const u = new URL(url); let pth = decodeURIComponent(u.pathname).replace(/\/transcoded\//, "/").replace(/\.(?:\d{2,4}p|\d{2,4}px-[^/]*)\.(mp4|webm|m3u8|mov)$/i, ".$1"); return (pth.split("/").filter(Boolean).pop() || pth).toLowerCase(); } catch { return url; } };
  const seen = new Set(), items = [];
  for (const v of found) { const k = norm(v); if (seen.has(k)) continue; seen.add(k); items.push({ video: v, title: humanize(k) || "video", poster: null }); }
  const ogImg = abs(html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || "");
  if (ogImg) for (const it of items) it.poster = ogImg;   
  let next = null;
  const rel = html.match(/<(?:a|link)\b[^>]*\brel=["']next["'][^>]*\bhref=["']([^"']+)["']/i) || html.match(/<(?:a|link)\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']next["']/i);
  if (rel) next = abs(rel[1]);
  else { try { const u = new URL(base); for (const key of ["page", "p", "pg", "paged", "offset", "start"]) { if (u.searchParams.has(key)) { const n = parseInt(u.searchParams.get(key), 10); if (!isNaN(n)) { u.searchParams.set(key, (key === "offset" || key === "start") ? n + Math.max(1, items.length) : n + 1); next = u.href; break; } } } } catch {  } }
  return { items, next };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;
  if (req.method === "OPTIONS") return send(res, 204, CORS, "");
  if (p === "/health") return send(res, 200, CORS, "ok");

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
