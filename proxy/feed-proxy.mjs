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
//   GET  /health                 → "ok"
import http from "node:http";

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
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

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

// ── AliExpress search → compact JSON (keyless, like the horoscope scrape). The query is sanitised to a safe
// slug and interpolated into a CONSTANT aliexpress.com URL (no SSRF surface); prices come back in the
// request's geo currency (₴ from the VPS). Cached per (slug,page). Parses the embedded itemList JSON. ──
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

  // ── AliExpress product search (parsed to compact JSON, cached per query) ──
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

server.listen(PORT, "127.0.0.1", () => console.log(`feed-proxy listening on 127.0.0.1:${PORT}`));
