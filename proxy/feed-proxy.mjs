// microspec — hardened same-origin feed proxy for the ONE class of source that needs a backend:
// no-CORS sites that also block public proxies (e.g. jobs.dou.ua → allorigins 520). Everything else in
// the farm is CORS-friendly and needs NO backend. Runs on the VPS behind nginx (HTTPS); binds to
// localhost so only nginx reaches it. Node 18+ (global fetch), zero dependencies.
//
//   PORT=8787 node feed-proxy.mjs
//   GET /feed?url=<encoded>  →  upstream body + `access-control-allow-origin: *`   (allowlisted hosts only)
//   GET /health              →  "ok"
import http from "node:http";

const PORT = Number(process.env.PORT) || 8787;
// Allowlist — NEVER an open proxy. Add hosts here as apps need them.
const ALLOW = [/(^|\.)dou\.ua$/i, /(^|\.)wikipedia\.org$/i];
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  if (u.pathname === "/health") { res.writeHead(200, CORS); return res.end("ok"); }
  if (u.pathname !== "/feed" || req.method !== "GET") { res.writeHead(404, CORS); return res.end("not found"); }

  const target = u.searchParams.get("url");
  let host;
  try { host = new URL(target).hostname; } catch { res.writeHead(400, CORS); return res.end("bad url"); }
  if (!ALLOW.some((re) => re.test(host))) { res.writeHead(403, CORS); return res.end("host not allowed"); }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(target, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" });
    const body = await r.text();
    res.writeHead(r.status, { ...CORS, "content-type": r.headers.get("content-type") || "text/plain; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(502, CORS); res.end("upstream error");
  } finally { clearTimeout(t); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`feed-proxy listening on 127.0.0.1:${PORT}`));
