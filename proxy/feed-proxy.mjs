// microspec — hardened same-origin proxy for the sources that need a backend. Runs on the VPS behind nginx
// (HTTPS at jobs-map.mooo.com, location /feed → this). Binds to localhost so only nginx reaches it. Node 18+
// (global fetch), zero dependencies.
//
//   PORT=8787 GEMINI_API_KEY=… node feed-proxy.mjs
//   GET  /feed?url=<enc>          → CORS text passthrough, allowlisted hosts (the original feed proxy)
//   POST /feed/ai                 → systemic LLM helper: {mode,text,locale} → text. mode "polish" (natural
//                                  rewrite) | "summarize" (structured facts → one short reading). Gemini free
//                                  tier, key server-side, origin-guarded + rate-limited + cached per (mode,locale,text).
//   POST /feed/image {prompt,width,height,seed} → FREE keyless text→image; starts an async cascade over
//                                  anonymous HF Gradio Spaces → {job}. No key/token ever. (Egress via VPN.)
//   GET  /feed/image/get?job=     → poll: {status,stage,elapsed} while pending, then the image bytes (cached).
//   POST /feed/image/edit {image(base64 data URL),prompt,seed} → FREE keyless instruction image EDITING; starts
//                                  an async cascade over anonymous HF Gradio edit Spaces → {job}. Larger body.
//   GET  /feed/image/edit/get?job= → poll: {status,stage,elapsed} while pending, then the edited image bytes.
//   GET  /feed/horoscope?sign=1..12&day=today|tomorrow|yesterday → real horoscope.com reading, parsed to
//                                  compact JSON {date,sign,day,text,ratings} + CORS, cached per day.
//   GET  /feed/videos?url=<enc>   → light HTML video extractor: pulls playable video URLs (+ poster/title) and
//                                  the next-page link from any page, for the tiktok-style reel app. SSRF-guarded.
//   GET  /health                 → "ok"
import http from "node:http";
import dns from "node:dns/promises";

const PORT = Number(process.env.PORT) || 8787;
// The key-bearing endpoints (/feed/ai) are origin-guarded (browsers enforce Origin) + rate-limited. A wall
// against casual web abuse, not a cryptographic one.
const ALLOW_ORIGIN = new Set(["https://damanoreshkan-beep.github.io"]);
// ── /feed/ai providers (OpenAI-compatible chat/completions). The key lives ONLY here, server-side. Gemini's
// free tier is IP-gated away from the EU/UK, but this VPS already egresses from a US IP, so it answers directly
// (no VPN plumbing needed). CRUCIAL: the free tier is metered PER MODEL PER DAY, and each per-model cap is
// small (tens of requests — flash-lite is 20/day). So we ROTATE across several Gemini models on the one key:
// a 429 on one model falls through to the next model, which has its OWN daily bucket — multiplying the free
// budget and keeping the feature up. Order = best quality first; override with GEMINI_MODELS (comma-sep). ──
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODELS = (process.env.GEMINI_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",").map((s) => s.trim()).filter(Boolean);
const AI_PROVIDERS = GEMINI_KEY ? GEMINI_MODELS.map((model) => ({ name: "gemini/" + model, base: GEMINI_BASE, model, key: GEMINI_KEY })) : [];
const AI_LANG = { uk: "українською", en: "English" };            // endonym for the system prompt's target language
const AI_TTL = 30 * 86400_000;                                  // a rewrite of a fixed text is stable — cache it a month
const aiCache = new Map();  // (see /feed/ai)
// ── /feed/image: FREE, KEYLESS text→image by cascading across public HF Gradio Spaces. Each Space is flaky
// (sleeps, queues, ZeroGPU guest quota is ~per-IP-per-day), so we try them in order (fast models first) and
// fall through to the next on any failure — the cascade buys reliability, not extra quota. Anonymous: no HF
// token, no key, ever. Param order per Space is fixed (probed from each /info) — data(prompt,w,h,seed). Some
// Spaces are Gradio 5 (path prefix "/gradio_api"), some Gradio 4 ("" → "/call/..."); we try v5 then fall to v4.
const IMG_SPACES = [
  { host: "kingnish-realtime-flux", pre: "/gradio_api", api: "generate_image", data: (p, w, h, s) => [p, s, w, h] },
  { host: "bytedance-sdxl-lightning", pre: "", api: "generate_image", data: (p) => [p, "4-Step"] },
  { host: "black-forest-labs-flux-1-schnell", pre: "/gradio_api", api: "infer", data: (p, w, h, s) => [p, s, false, w, h, 4] },
  { host: "multimodalart-flux-1-merged", pre: "/gradio_api", api: "infer", data: (p, w, h, s) => [p, s, false, w, h, 3.5, 8] },
  { host: "stabilityai-stable-diffusion-3-medium", pre: "/gradio_api", api: "infer", data: (p, w, h, s) => [p, "", s, false, w, h, 5.0, 28] },
  { host: "stabilityai-stable-diffusion-3-5-large", pre: "/gradio_api", api: "infer", data: (p, w, h, s) => [p, "", s, false, w, h, 4.5, 28] },
  { host: "black-forest-labs-flux-1-dev", pre: "/gradio_api", api: "infer", data: (p, w, h, s) => [p, s, false, w, h, 3.5, 20] },
  { host: "prithivmlmods-flux-lora-dlc", pre: "/gradio_api", api: "run_lora", data: (p, w, h, s) => [p, null, 0.75, 3.5, 8, false, s, w, h, 0.9] },
];
const IMG_TTL = 7 * 86400_000;
// ── /feed/image/edit: FREE, KEYLESS instruction image EDITING (image + text → image) by cascading across public
// HF Gradio Spaces, exactly like /feed/image but for image-to-image. The one hard difference vs text→image is
// that the shapes are NOT uniform across Spaces, so each entry carries BOTH its own `data(img,p,w,h,s)` builder
// AND an `out(arr)` extractor for the finished FileData:
//   • image passing — most take a FileData `{url:<base64 data URL>}` (Gradio's url field accepts a data URL), the
//     Qwen-2511 pair wrap it as a Gallery item list `[{image:{url},caption:null}]`, and the prithiv 2509 space
//     wants the raw base64 STRING in a textbox;
//   • image POSITION — index 0 for Kontext/Qwen, index 1 (after the prompt) for Step1X, index 5 for OmniGen2;
//   • output — plain `data[0].url` for most, `data[0][0].image.url` for the Gallery Spaces, and an Imageslider
//     (before/after pair) for Step1X (take the edited frame).
// w/h are the input photo's real pixels (jpegSize) so the Spaces that take an output size don't distort it.
// Fast (Lightning-distilled) Spaces first, then quality, then the heavier/odd shapes last. Anonymous, no token.
const fd = (url) => ({ url });                                    // Gradio FileData carrying a base64 data URL
const gal = (url) => [{ image: { url }, caption: null }];         // Gallery input item (Qwen-2511 pair)
const outUrl = (a) => (a && a[0] && (a[0].url || (typeof a[0] === "string" ? a[0] : null))) || null;
const outGallery = (a) => a?.[0]?.[0]?.image?.url || a?.[0]?.[0]?.url || null;
const outSlider = (a) => a?.[0]?.[1]?.url || a?.[0]?.url || a?.[1]?.url || null;  // Step1X before/after → edited
const IMG_EDIT_SPACES = [
  { host: "multimodalart-qwen-image-edit-fast", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [fd(img), p, s, false, 1.0, 8, false], out: outUrl },
  { host: "black-forest-labs-flux-1-kontext-dev", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [fd(img), p, s, false, 2.5, 28], out: outUrl },
  { host: "linoyts-qwen-image-edit-2511-fast", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [gal(img), p, s, false, 1.0, 8, h, w, false], out: outGallery },
  { host: "akhaliq-flux-1-kontext-dev", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [fd(img), p, s, false, 2.5, 28], out: outUrl },
  { host: "qwen-qwen-image-edit-2511", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [gal(img), p, s, false, 4.0, 40, h, w, false], out: outGallery },
  { host: "qwen-qwen-image-edit", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [fd(img), p, s, false, 4.0, 50, false], out: outUrl },
  { host: "stepfun-ai-step1x-edit", pre: "/gradio_api", api: "inference", data: (img, p, w, h, s) => [p, fd(img), s, 1024], out: outSlider },
  { host: "omnigen2-omnigen2", pre: "/gradio_api", api: "run", data: (img, p, w, h, s) => [p, w, h, "euler", 50, fd(img), null, null, "", 5.0, 2.0, 0.0, 1.0, 1, 2048, 1048576, s], out: outUrl },
  { host: "prithivmlmods-qwen-image-edit-2509-loras-fast", pre: "/gradio_api", api: "infer", data: (img, p, w, h, s) => [img, p, "", s, false, 1.0, 8], out: outUrl },
];
const IMG_EDIT_TTL = 3 * 86400_000;
const editCache = new Map();                                     // `${sig}|${prompt}|${seed}` → { ts, ct, buf }
let editJobSeq = 0;
const editJobs = new Map();                                      // id → { ts, status, stage, ct, buf }
// Minimal JPEG dimension reader (our uploads are always JPEG data URLs) so the size-taking Spaces keep aspect.
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let o = 2;
  while (o + 9 < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const m = buf[o + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
    if (m === 0xD8 || m === 0xD9 || (m >= 0xD0 && m <= 0xD7)) { o += 2; continue; }
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return null;
}
const imgCache = new Map();                                      // `${prompt}|${w}|${h}|${seed}` → { ts, ct, buf }
// A generation can take >60s (cold Spaces) but nginx caps a single /feed request at 60s, so /feed/image is
// ASYNC: POST starts a background job (returns an id instantly), the client polls /feed/image/get?job= with
// short requests that never hit the 60s cap, and each poll reports {status,stage,elapsed} until the bytes land.
let imgJobSeq = 0;
const imgJobs = new Map();                                       // id → { ts, status:pending|done|error, stage, ct, buf }                                     // `${locale} ${text}` → { ts, text } (protects the tiny free quota)
// Original /feed allowlist (unchanged). NEVER an open proxy.
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i, /(^|\.)gutendex\.com$/i, /(^|\.)chocolatey\.org$/i];
const UA ="Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
// Signed / expiring CDN URL markers — a source whose video URLs mostly carry these hands out one-time,
// IP+time-bound links (e.g. tube-site previews) that won't play once re-fetched from another IP/session.
const SIGN_RX = /[?&](?:validto|validfrom|expires?|token|signature|sig|policy|hash|key-pair-id|x-amz-[a-z-]+|__token__|st|e)=/i;
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
// Default cap is tiny (the JSON control endpoints); the image-edit endpoint passes a larger `max` because an
// uploaded photo rides in the body as a base64 data URL. nginx's client_max_body_size must be ≥ this too.
const readBody = (req, max = 8000) => new Promise((resolve, reject) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > max) req.destroy(); }); req.on("end", () => resolve(b)); req.on("error", reject); });
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
  // the page link nearest the video (the wrapping <a> in a thumbnail grid) — so "watch" opens the real video page,
  // not the raw (often signed/expiring) clip URL.
  const nearestAnchor = (pos) => {
    const start = Math.max(0, pos - 4000), win = html.slice(start, pos + 400), rel = pos - start;
    let href = null, best = Infinity;
    for (const m of win.matchAll(/<a\b[^>]*?\bhref=["']([^"'#\s]+)["']/gi)) {
      const u = m[1]; if (/^(?:data:|javascript:|mailto:|tel:)/i.test(u) || /\.(?:jpe?g|png|webp|gif|svg|css|js|mp4|webm|m3u8|ico|woff)/i.test(u)) continue;
      const d = Math.abs(m.index - rel); if (d < best) { best = d; href = u; }
    }
    return href ? abs(href) : null;
  };
  const seen = new Set(), items = [];
  for (const c of cands) {
    const k = normKey(c.url); if (seen.has(k)) continue; seen.add(k);
    const md = meta.get(k) || {};
    const title = ((md.title && decodeEntities(String(md.title)).trim()) || vtitle.get(k) || humanize(k) || "video").slice(0, 140);
    items.push({ video: c.url, title, poster: c.poster || md.poster || proximity(c.pos) || null, page: nearestAnchor(c.pos) });
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

// ── /feed/frame: same-origin reverse proxy for the interactive "source view". Fetches the target, STRIPS the
// frame-blocking headers (we simply never re-send X-Frame-Options / CSP), rewrites asset+link URLs (and CSS
// url()) back through this endpoint so everything loads via us with the right Referer/cookies, and injects a
// shim that routes runtime fetch/XHR through the proxy + harvests <video> URLs and postMessages them to the
// parent app. Cookies are jarred per host, so a user's click-through of a consent/age modal persists and can be
// reused by /feed/videos. NOTE: SSRF-guarded but otherwise an open proxy; the cookie jar is process-global
// (fine for a single owner, not multi-tenant). ──
const FRAME_UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
export const cookieJar = new Map();   // host → "k=v; k2=v2" captured from Set-Cookie, sent back on later requests
const FRAME_SHIM = `(function(){
var T=window.__TARGET__||location.href;
function P(u){try{if(!u||/^(data:|blob:|#|javascript:|mailto:|tel:)/i.test(u))return u;var a=new URL(u,T).href;if(a.indexOf(location.origin)===0)return u;return"/feed/frame?url="+encodeURIComponent(a)}catch(e){return u}}
function clean(s){if(!s)return s;var i=s.indexOf("/feed/frame?url=");if(i>=0){try{return decodeURIComponent(s.slice(i+16))}catch(e){}}return s}
var of=window.fetch;if(of)window.fetch=function(i,init){try{if(typeof i==="string")i=P(i);else if(i&&i.url)i=new Request(P(i.url),i)}catch(e){}return of.call(this,i,init)};
var ox=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){try{if(arguments[1])arguments[1]=P(arguments[1])}catch(e){}return ox.apply(this,arguments)};
function harvest(){try{var out=[];document.querySelectorAll("video,source").forEach(function(el){var s=clean(el.currentSrc||el.src||el.getAttribute("src")||"");if(/\\.(mp4|m3u8|webm|mov)(\\?|#|$)/i.test(s)&&out.indexOf(s)<0)out.push(s)});if(out.length)parent.postMessage({__reel:"videos",videos:out.slice(0,60)},"*")}catch(e){}}
try{new MutationObserver(harvest).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]})}catch(e){}
setInterval(harvest,1500);setTimeout(harvest,400);
})();`;
function proxify(u, base) {
  if (!u || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(u)) return u;
  try { return "/feed/frame?url=" + encodeURIComponent(new URL(u.replace(/&amp;/g, "&"), base).href); } catch { return u; }
}
function rewriteCss(css, base) { return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (m, q, v) => `url(${q}${proxify(v, base)}${q})`); }
function rewriteHtml(html, base) {
  html = html.replace(/<base\b[^>]*>/gi, "");                                             // we do absolute rewriting; a <base> would fight it
  html = html.replace(/\b(href|src|poster|action|data-src|data-lazy-src|data-poster)=(["'])([^"']*)\2/gi, (m, a, q, v) => `${a}=${q}${proxify(v, base)}${q}`);
  html = html.replace(/\bsrcset=(["'])([^"']*)\1/gi, (m, q, v) => `srcset=${q}${v.split(",").map((p) => { const s = p.trim().split(/\s+/); return proxify(s[0], base) + (s[1] ? " " + s[1] : ""); }).join(", ")}${q}`);
  html = rewriteCss(html, base);
  const inject = `<script>window.__TARGET__=${JSON.stringify(base)};${FRAME_SHIM}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;
}

// System prompt for /feed/ai, per mode. Written IN the target language for uk (best output quality); a generic
// English meta-instruction naming the target language for any other locale.
//   • polish     — light rewrite of a wooden machine translation, meaning preserved.
//   • summarize  — collapse a structured block of facts (positions + items + meanings) into ONE short reading.
function aiSystem(locale, mode) {
  const lang = AI_LANG[locale] || locale || "the same language";
  if (mode === "summarize") {
    if (locale === "uk") return "Ти — досвідчений таролог. Нижче — розклад: позиції, карти (пряма чи перевернута) та їхні значення. Стисло, за 3–4 речення, синтезуй ЄДИНЕ зв'язне тлумачення цього розкладу природною українською — покажи, як карти складаються в одну історію разом (а не перелічуй їх по одній). Без вступів, заголовків, списків і лапок — поверни ЛИШЕ саме тлумачення.";
    return `You are an experienced tarot reader. Below is a spread: positions, cards (upright or reversed) and their meanings. In 3–4 sentences, synthesise ONE cohesive reading in ${lang} — show how the cards combine into a single story (do not list them one by one). No preamble, headings, lists or quotes — return ONLY the reading itself.`;
  }
  if (locale === "uk") return "Ти — редактор-стиліст. Тобі дають фрагмент тексту українською, отриманий машинним перекладом, тому він звучить дослівно й неприродно. Перепиши його природною, живою, грамотною українською, ЗБЕРІГАЮЧИ зміст кожного речення — нічого не додавай, не прибирай і не вигадуй. Без пояснень, приміток чи лапок — поверни ЛИШЕ виправлений текст.";
  return `You are a copy editor. You are given a passage in ${lang} produced by machine translation, so it reads literal and unnatural. Rewrite it into natural, fluent ${lang}, preserving the meaning of every sentence — add nothing, drop nothing, invent nothing. No explanations or quotes — return ONLY the corrected text.`;
}

// One anonymous text→image generation against a single HF Gradio Space. Two-step queue API: POST the inputs →
// event_id, then read the SSE stream until `complete` (the FileData `url` is the finished image) or fail.
// Returns the image URL on success, null on ANY failure (so the caller just cascades to the next Space).
async function gradioImage(sp, prompt, w, h, seed) {
  const base = "https://" + sp.host + ".hf.space" + sp.pre + "/call/" + sp.api;
  let event_id;
  { const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    try {
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: sp.data(prompt, w, h, seed) }), signal: c.signal });
      if (!r.ok) return null;
      event_id = (await r.json())?.event_id;
    } catch { return null; } finally { clearTimeout(t); } }
  if (!event_id) return null;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 55000);
  try {
    const r = await fetch(base + "/" + event_id, { signal: c.signal });
    if (!r.ok) return null;
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", ev = null;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:") && (ev === "complete" || ev === "error")) {
          reader.cancel().catch(() => {});
          if (ev === "error") return null;
          try { const f = JSON.parse(line.slice(5).trim())[0]; return (f && f.url) || (typeof f === "string" ? f : null); } catch { return null; }
        }
      }
    }
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Background image job: cascade the Spaces (fast first), fetch the finished image, cache it, and record the
// result on the job so pollers can pick it up. `stage` tracks which Space is being tried, for a live status.
async function runImageJob(id, prompt, w, h, seed) {
  const job = imgJobs.get(id); if (!job) return;
  const ckey = `${prompt}|${w}|${h}|${seed}`, cached = imgCache.get(ckey);
  if (cached && Date.now() - cached.ts < IMG_TTL) { job.status = "done"; job.ct = cached.ct; job.buf = cached.buf; return; }
  const started = Date.now();
  for (const sp of IMG_SPACES) {
    if (Date.now() - started > 110000) break;                    // overall budget
    job.stage = sp.host;
    const url = await gradioImage(sp, prompt, w, h, seed).catch(() => null);
    if (!url) continue;
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
      const im = await fetch(url, { signal: c.signal }); clearTimeout(t);
      const ct = im.headers.get("content-type") || "";
      if (!im.ok || !ct.startsWith("image/")) continue;
      const buf = Buffer.from(await im.arrayBuffer());
      if (buf.length < 512) continue;                            // tiny → an error placeholder, not a real image
      if (imgCache.size > 300) imgCache.clear();
      imgCache.set(ckey, { ts: Date.now(), ct, buf });
      job.status = "done"; job.ct = ct; job.buf = buf; return;
    } catch { continue; }
  }
  job.status = "error";
}

// One anonymous image EDIT against a single HF Gradio Space. Same two-step queue API as gradioImage (POST the
// inputs → event_id, then read the SSE stream to `complete`), but the input array is built by the Space's own
// `sp.data(img,…)` (shapes vary — see IMG_EDIT_SPACES) and the finished image URL is pulled by `sp.out(arr)`
// from the full result array (not always index 0). Edits run more diffusion steps than text→image, so the
// stream timeout is longer. `img` is the base64 data URL. Returns the image URL, or null on ANY failure.
async function gradioEdit(sp, img, prompt, w, h, seed) {
  const base = "https://" + sp.host + ".hf.space" + sp.pre + "/call/" + sp.api;
  let event_id;
  { const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
    try {
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: sp.data(img, prompt, w, h, seed) }), signal: c.signal });
      if (!r.ok) return null;
      event_id = (await r.json())?.event_id;
    } catch { return null; } finally { clearTimeout(t); } }
  if (!event_id) return null;
  // Per-Space stream cap kept below the overall budget so ONE stalled/queued Space can't eat the whole cascade
  // (observed: a busy ZeroGPU Space can sit ~70s before yielding) — cap it and fall through to the next Space.
  const c = new AbortController(), t = setTimeout(() => c.abort(), 70000);
  try {
    const r = await fetch(base + "/" + event_id, { signal: c.signal });
    if (!r.ok) return null;
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", ev = null;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:") && (ev === "complete" || ev === "error")) {
          reader.cancel().catch(() => {});
          if (ev === "error") return null;
          try { const url = sp.out(JSON.parse(line.slice(5).trim())); return url || null; } catch { return null; }
        }
      }
    }
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Background edit job: cascade the edit Spaces, fetch the finished image, cache it, record it on the job.
// `img` is the base64 data URL (kept out of the cache key — we key on a cheap signature of it + prompt + seed).
async function runEditJob(id, img, prompt, seed) {
  const job = editJobs.get(id); if (!job) return;
  let dims = null;
  try { const b = Buffer.from(img.slice(img.indexOf(",") + 1), "base64"); dims = jpegSize(b); } catch { /* size hint only */ }
  const w = dims?.w || 1024, h = dims?.h || 1024;
  const sig = img.length + ":" + img.slice(-48);                 // cheap stand-in for hashing the whole data URL
  const ckey = `${sig}|${prompt}|${seed}`, cached = editCache.get(ckey);
  if (cached && Date.now() - cached.ts < IMG_EDIT_TTL) { job.status = "done"; job.ct = cached.ct; job.buf = cached.buf; return; }
  const started = Date.now();
  for (const sp of IMG_EDIT_SPACES) {
    if (Date.now() - started > 150000) break;                    // overall budget
    job.stage = sp.host;
    let url = await gradioEdit(sp, img, prompt, w, h, seed).catch(() => null);
    if (!url) continue;
    if (url.startsWith("/")) url = "https://" + sp.host + ".hf.space" + url;   // resolve a relative FileData url
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 25000);
      const im = await fetch(url, { signal: c.signal }); clearTimeout(t);
      const ct = im.headers.get("content-type") || "";
      if (!im.ok || !ct.startsWith("image/")) continue;
      const b = Buffer.from(await im.arrayBuffer());
      if (b.length < 512) continue;                              // tiny → an error placeholder, not a real image
      if (editCache.size > 200) editCache.clear();
      editCache.set(ckey, { ts: Date.now(), ct, buf: b });
      job.status = "done"; job.ct = ct; job.buf = b; return;
    } catch { continue; }
  }
  job.status = "error";
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;
  if (req.method === "OPTIONS") return send(res, 204, CORS, "");
  if (p === "/health") return send(res, 200, CORS, "ok");

  // ── /feed/image — FREE, keyless text→image, ASYNC (see imgJobs note). POST {prompt,width,height,seed} starts
  // a background cascade → {job}; poll GET /feed/image/get?job= (short requests) → {status,stage,elapsed} while
  // pending, then the image BYTES when done. Async so a >60s generation never trips nginx's 60s /feed cap. ──
  if (p === "/feed/image" && req.method === "POST") {
    const origin = req.headers.origin || "";
    if (!ALLOW_ORIGIN.has(origin)) return send(res, 403, CORS, "origin not allowed");
    if (!rateOk(ipOf(req))) return send(res, 429, CORS, "rate limited");
    let inp;
    try { inp = JSON.parse(await readBody(req)); } catch { return send(res, 400, CORS, "bad json"); }
    const prompt = String(inp.prompt || "").slice(0, 800).trim();
    if (!prompt) return send(res, 400, CORS, "empty prompt");
    const w = Math.max(256, Math.min(2048, Number(inp.width) || 768));
    const h = Math.max(256, Math.min(2048, Number(inp.height) || 768));
    const seed = Number(inp.seed) || 0;
    const now = Date.now();
    for (const [k, v] of imgJobs) if (now - v.ts > 300000) imgJobs.delete(k);   // prune jobs older than 5 min
    const id = (++imgJobSeq).toString(36) + now.toString(36);
    imgJobs.set(id, { ts: now, status: "pending", stage: "starting" });
    runImageJob(id, prompt, w, h, seed);                                        // fire-and-forget; poller collects the result
    return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ job: id }));
  }
  if (p === "/feed/image/get" && req.method === "GET") {
    const job = imgJobs.get(u.searchParams.get("job") || "");
    if (!job) return send(res, 404, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "error" }));
    if (job.status === "done") return send(res, 200, { ...CORS, "content-type": job.ct, "x-image-by": job.stage }, job.buf);
    if (job.status === "error") return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "error" }));
    return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "pending", stage: job.stage, elapsed: Math.round((Date.now() - job.ts) / 1000) }));
  }

  // ── /feed/image/edit — FREE, keyless instruction image EDITING, ASYNC (same job/poll model as /feed/image).
  // POST {image:<base64 data URL>, prompt, seed} starts a background cascade over the edit Spaces → {job}; poll
  // GET /feed/image/edit/get?job= → {status,stage,elapsed} while pending, then the edited image BYTES. The image
  // rides in the body as a data URL, so the body cap is raised here (and nginx client_max_body_size must match). ──
  if (p === "/feed/image/edit" && req.method === "POST") {
    const origin = req.headers.origin || "";
    if (!ALLOW_ORIGIN.has(origin)) return send(res, 403, CORS, "origin not allowed");
    if (!rateOk(ipOf(req))) return send(res, 429, CORS, "rate limited");
    let inp;
    try { inp = JSON.parse(await readBody(req, 12_000_000)); } catch { return send(res, 400, CORS, "bad json"); }
    const image = String(inp.image || "");
    if (!/^data:image\/[a-z+]+;base64,/.test(image)) return send(res, 400, CORS, "bad image");
    const prompt = String(inp.prompt || "").slice(0, 800).trim();
    if (!prompt) return send(res, 400, CORS, "empty prompt");
    const seed = Number(inp.seed) || 0;
    const now = Date.now();
    for (const [k, v] of editJobs) if (now - v.ts > 300000) editJobs.delete(k);   // prune jobs older than 5 min
    const id = (++editJobSeq).toString(36) + now.toString(36) + "e";
    editJobs.set(id, { ts: now, status: "pending", stage: "starting" });
    runEditJob(id, image, prompt, seed);                                          // fire-and-forget; poller collects the result
    return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ job: id }));
  }
  if (p === "/feed/image/edit/get" && req.method === "GET") {
    const job = editJobs.get(u.searchParams.get("job") || "");
    if (!job) return send(res, 404, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "error" }));
    if (job.status === "done") return send(res, 200, { ...CORS, "content-type": job.ct, "x-image-by": job.stage }, job.buf);
    if (job.status === "error") return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "error" }));
    return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ status: "pending", stage: job.stage, elapsed: Math.round((Date.now() - job.ts) / 1000) }));
  }

  // ── /feed/ai — server-side LLM "polish": a light rewrite of machine-translated body text into natural prose
  // in the same language, meaning preserved. Origin-guarded + rate-limited (the key-bearing path — never an
  // open LLM relay). Cached per (locale,text) so the thousands of readers who share one daily reading spend a
  // single call against the tiny free quota. Tries each configured provider in order, fail-open to the next. ──
  if (p === "/feed/ai" && req.method === "POST") {
    if (!AI_PROVIDERS.length) return send(res, 500, CORS, "no ai key configured");
    const origin = req.headers.origin || "";
    if (!ALLOW_ORIGIN.has(origin)) return send(res, 403, CORS, "origin not allowed");
    if (!rateOk(ipOf(req))) return send(res, 429, CORS, "rate limited");
    let inp;
    try { inp = JSON.parse(await readBody(req)); } catch { return send(res, 400, CORS, "bad json"); }
    const mode = inp.mode === "summarize" ? "summarize" : "polish";
    const text = String(inp.text || "").slice(0, mode === "summarize" ? 6000 : 2000).trim();
    const locale = String(inp.locale || "").slice(0, 8);
    if (!text) return send(res, 400, CORS, "empty text");
    const ckey = mode + " " + locale + " " + text, hit = aiCache.get(ckey);
    if (hit && Date.now() - hit.ts < AI_TTL) return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ text: hit.text, cached: true }));
    const messages = [{ role: "system", content: aiSystem(locale, mode) }, { role: "user", content: text }];
    const maxTokens = mode === "summarize" ? 400 : 800;
    for (const prov of AI_PROVIDERS) {
      // reasoning_effort:"none" disables the 2.5 "thinking" budget — otherwise a thinking model spends the
      // whole max_tokens reasoning and truncates the visible answer. We want direct output for both modes.
      const payload = JSON.stringify({ model: prov.model, messages, temperature: 0.4, max_tokens: maxTokens, reasoning_effort: "none" });
      // one retry per provider on a TRANSIENT failure (429 burst / 5xx / network) — the free tiers throttle
      // short bursts, and a single ~600ms backoff recovers most of them before we give up / fall to the next.
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
        let transient = false;
        try {
          const r = await fetch(prov.base, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer " + prov.key },
            body: payload,
            signal: ctrl.signal,
          });
          if (r.status === 429 || r.status >= 500) transient = true;   // throttle / upstream blip → retry once
          else if (!r.ok) break;                                       // 4xx (bad key / bad request) → next provider
          else {
            const j = await r.json();
            const out = (j?.choices?.[0]?.message?.content || "").trim();
            if (!out) break;
            if (aiCache.size > 3000) aiCache.clear();
            aiCache.set(ckey, { ts: Date.now(), text: out });
            return send(res, 200, { ...CORS, "content-type": "application/json" }, JSON.stringify({ text: out, by: prov.name }));
          }
        } catch { transient = true; }                                  // timeout / network → retry once
        finally { clearTimeout(t); }
        if (transient && attempt === 0) { await new Promise((r) => setTimeout(r, 600)); continue; }
        break;
      }
    }
    return send(res, 502, CORS, "all providers failed");
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
      // reuse any cookies captured from a /feed/frame click-through for this host (consent/age unlock), + a Referer
      const h = { "user-agent": UA_DESKTOP, "accept-language": "en-US,en;q=0.9", "accept": "text/html,application/xhtml+xml", "referer": src.origin + "/" };
      if (cookieJar.has(src.hostname)) h.cookie = cookieJar.get(src.hostname);
      const r = await fetch(src.href, { headers: h, signal: ctrl.signal, redirect: "follow" });
      const ct = r.headers.get("content-type") || "";
      const J = { ...CORS, "content-type": "application/json" };
      if (!/html|xml|json/i.test(ct)) return send(res, 200, J, JSON.stringify({ items: [], next: null, note: "not an html page" }));
      const data = parseVideos(await r.text(), r.url);
      if (data.items.length) data.ephemeral = data.items.filter((i) => SIGN_RX.test(i.video)).length >= Math.ceil(data.items.length * 0.6);
      send(res, 200, J, JSON.stringify(data));
    } catch { send(res, 502, CORS, "upstream error"); }
    finally { clearTimeout(t); }
    return;
  }

  // ── interactive reverse-proxy source view (header strip + URL rewrite + cookie jar + harvest shim) ──
  if (p === "/feed/frame" && req.method === "GET") {
    const src = await safeUrl(u.searchParams.get("url"));
    if (!src) return send(res, 400, CORS, "bad or blocked url");
    const host = src.hostname;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const headers = { "user-agent": FRAME_UA, "accept-language": "en-US,en;q=0.9", "accept": "text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.8", "referer": src.origin + "/" };
      if (cookieJar.has(host)) headers.cookie = cookieJar.get(host);
      if (req.headers.range) headers.range = req.headers.range;                             // stream video: forward byte ranges
      const r = await fetch(src.href, { headers, signal: ctrl.signal, redirect: "follow" });
      const setC = r.headers.getSetCookie?.() || [];                                       // capture the click-through cookies
      if (setC.length) { const map = new Map((cookieJar.get(host) || "").split("; ").filter(Boolean).map((c) => [c.split("=")[0], c])); for (const c of setC) { const kv = c.split(";")[0].trim(); if (kv) map.set(kv.split("=")[0], kv); } cookieJar.set(host, [...map.values()].join("; ")); }
      const ct = r.headers.get("content-type") || "";
      // We deliberately DO NOT forward X-Frame-Options / Content-Security-Policy → the page can be iframed.
      if (/text\/html/i.test(ct)) return send(res, 200, { ...CORS, "content-type": "text/html; charset=utf-8" }, rewriteHtml(await r.text(), src.href));
      if (/text\/css/i.test(ct)) return send(res, 200, { ...CORS, "content-type": "text/css; charset=utf-8" }, rewriteCss(await r.text(), src.href));
      const ab = await r.arrayBuffer();                                                    // images / video / js / fonts: pass through as-is
      const oh = { ...CORS, "content-type": ct || "application/octet-stream", "accept-ranges": "bytes" };
      const cr = r.headers.get("content-range"); if (cr) oh["content-range"] = cr;         // 206 partial for <video> seeking
      const cl = r.headers.get("content-length"); if (cl) oh["content-length"] = cl;
      if (!/^(?:video|audio)\//i.test(ct)) oh["cache-control"] = "public, max-age=3600";   // don't cache signed/expiring media
      send(res, r.status, oh, Buffer.from(ab));
    } catch { send(res, 502, CORS, "frame upstream error"); }
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
