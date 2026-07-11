// microspec — hardened same-origin feed proxy for the sources that need a backend: no-CORS sites that
// block public proxies (jobs.dou.ua) and token-gated APIs whose secret must NOT reach the browser
// (api.alerts.in.ua). Runs on the VPS behind nginx (HTTPS); binds to localhost so only nginx reaches
// it. Node 18+ (global fetch), zero dependencies.
//
//   PORT=8787 node feed-proxy.mjs
//   GET /feed?url=<encoded>  →  upstream body + CORS *   (allowlisted hosts only; token injected server-side)
//   GET /health              →  "ok"
//
// Secrets: reads ~/feed-proxy/.env (KEY=VALUE, chmod 600) — e.g. ALERTS_TOKEN=... — never in git/client.
// Caching: a short TTL (per host) collapses many client requests into one upstream call, so a rate-limited
// API (alerts.in.ua: 8–12 req/min/IP) stays safe no matter how many app users refresh.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// load ~/feed-proxy/.env into process.env (does not overwrite existing vars)
try {
  for (const line of fs.readFileSync(path.join(os.homedir(), "feed-proxy", ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* no .env yet */ }

const PORT = Number(process.env.PORT) || 8787;
const ALERTS_TOKEN = process.env.ALERTS_TOKEN || "";
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

// allowlist — NEVER an open proxy. Add hosts here as apps need them.
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i, /(^|\.)alerts\.in\.ua$/i];
const TTL_MS = 15000;                 // cache window; protects the alerts.in.ua rate limit
const cache = new Map();              // targetUrl -> { at, status, ct, body }

function upstreamHeaders(host) {
  const h = { "user-agent": UA };
  if (/(^|\.)alerts\.in\.ua$/i.test(host) && ALERTS_TOKEN) h["authorization"] = "Bearer " + ALERTS_TOKEN;
  return h;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  if (u.pathname === "/health") { res.writeHead(200, CORS); return res.end("ok"); }
  if (u.pathname !== "/feed" || req.method !== "GET") { res.writeHead(404, CORS); return res.end("not found"); }

  const target = u.searchParams.get("url");
  let host;
  try { host = new URL(target).hostname; } catch { res.writeHead(400, CORS); return res.end("bad url"); }
  if (!ALLOW.some((re) => re.test(host))) { res.writeHead(403, CORS); return res.end("host not allowed"); }

  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.writeHead(hit.status, { ...CORS, "content-type": hit.ct, "x-cache": "hit" });
    return res.end(hit.body);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(target, { headers: upstreamHeaders(host), signal: ctrl.signal, redirect: "follow" });
    const body = await r.text();
    const ct = r.headers.get("content-type") || "text/plain; charset=utf-8";
    if (r.ok) cache.set(target, { at: Date.now(), status: r.status, ct, body });
    res.writeHead(r.status, { ...CORS, "content-type": ct, "x-cache": "miss" });
    res.end(body);
  } catch {
    res.writeHead(502, CORS); res.end("upstream error");
  } finally { clearTimeout(t); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`feed-proxy on 127.0.0.1:${PORT} · alerts token: ${ALERTS_TOKEN ? "set" : "MISSING"}`));
