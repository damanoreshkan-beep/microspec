import http from "node:http";

const PORT = Number(process.env.PORT) || 8787;
const BFL_KEY = process.env.BFL_KEY || "";
const FLUX_CREATE = "https://api.bfl.ai/v1/flux-2-pro-preview";
const ALLOW_ORIGIN = new Set(["https://damanoreshkan-beep.github.io"]);
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i, /(^|\.)gutendex\.com$/i, /(^|\.)chocolatey\.org$/i];
const ALLOW_FLUX = [/(^|\.)bfl\.ai$/i, /(^|\.)bfl\.ml$/i];
const ALLOW_IMG = [/(^|\.)aliexpress-media\.com$/i, /(^|\.)alicdn\.com$/i];
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

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

const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const SHOP_TTL = 15 * 60_000;
const shopCache = new Map();
const shopSlug = (q) => String(q || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
function parseAli(html) {
  const i = html.indexOf('"itemList":{"content":[');
  if (i < 0) return [];
  const seg = html.slice(i, i + 400000);
  const items = [];
  const re = /"productId":"(\d+)"([\s\S]*?)(?="productId":"|\](?:,"[a-z])|$)/g;
  let m;
  while ((m = re.exec(seg)) && items.length < 40) {
    const b = m[2];
    const img = b.match(/"imgUrl":"([^"]+)"/)?.[1];
    const title = b.match(/"displayTitle":"([^"]*)"/)?.[1];
    const price = b.match(/"salePrice":\{[^]*?"formattedPrice":"([^"]*)"/)?.[1];
    const orig = b.match(/"originalPrice":\{[^]*?"formattedPrice":"([^"]*)"/)?.[1];
    const disc = b.match(/"salePrice":\{[^]*?"discount":(\d+)/)?.[1] || b.match(/"discount":(\d+)/)?.[1];
    if (img && title && price) items.push({ id: m[1], title, img: "https:" + img, price, orig: orig && orig !== price ? orig : null, discount: disc ? +disc : null, url: `https://www.aliexpress.com/item/${m[1]}.html` });
  }
  return items;
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

  if (p === "/feed/img" && req.method === "GET") {
    const target = u.searchParams.get("url");
    let host; try { host = new URL(target).hostname; } catch { return send(res, 400, CORS, "bad url"); }
    if (!ALLOW_IMG.some((re) => re.test(host))) return send(res, 403, CORS, "host not allowed");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(target, { headers: { "user-agent": UA_DESKTOP }, signal: ctrl.signal, redirect: "follow" });
      const ab = await r.arrayBuffer();
      send(res, r.status, { ...CORS, "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" }, Buffer.from(ab));
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  if (p === "/feed/shop" && req.method === "GET") {
    const slug = shopSlug(u.searchParams.get("q"));
    const page = Math.max(1, Math.min(20, Number(u.searchParams.get("page")) || 1));
    if (!slug) return send(res, 400, CORS, "bad query");
    const key = `${slug}|${page}`, hit = shopCache.get(key);
    if (hit && Date.now() - hit.ts < SHOP_TTL) return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify(hit.data));
    const target = `https://www.aliexpress.com/w/wholesale-${slug}.html?page=${page}`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(target, { headers: { "user-agent": UA_DESKTOP, "accept-language": "en-US,en;q=0.9" }, signal: ctrl.signal, redirect: "follow" });
      const data = { q: slug, page, items: parseAli(await r.text()) };
      if (shopCache.size > 300) shopCache.clear();
      shopCache.set(key, { ts: Date.now(), data });
      send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify(data));
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

server.listen(PORT, "127.0.0.1", () => console.log(`feed-proxy listening on 127.0.0.1:${PORT}`));
