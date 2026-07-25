"use strict";

const CFG = self.MS || { app: "app", version: "0", precache: [] };

const APP_CACHE = `ms-${CFG.app}-${CFG.version}`;
const APP_PREFIX = `ms-${CFG.app}-`;
const CDN_CACHE = "ms-cdn-v1";

const CDN = [
  "https://esm.sh",
  "https://cdn.jsdelivr.net",
  "https://code.iconify.design",
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

const COLD_TIMEOUT = 12000;   
const REVAL_TIMEOUT = 20000;  
const WALK_MAX = 90;          
const WALK_DEPTH = 3;
const WALK_PARSE_MAX = 512 * 1024; 

function cacheNameFor(url) {
  if (url.origin === self.location.origin) {
    return url.pathname.replace(/\/+$/, "").endsWith("/feed") || url.pathname === "/feed" ? null : APP_CACHE;
  }
  return CDN.includes(url.origin) ? CDN_CACHE : null;
}
self.MS_POLICY = { cacheNameFor, APP_CACHE, CDN_CACHE, CDN };   

const isNav = (req) => req.mode === "navigate" || req.destination === "document";
const cacheable = (res) => !!res && res.status === 200 && (res.type === "basic" || res.type === "cors" || res.type === "default");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return;             
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const name = cacheNameFor(url);
  if (!name) return;
  e.respondWith(serve(e, req, url, name));
});

async function serve(e, req, url, name) {
  const cache = await caches.open(name);
  const hit = await lookup(cache, req);
  if (hit) {
    if (shouldRevalidate(req.url)) e.waitUntil(revalidate(cache, req, url));
    return hit;                                      
  }
  try {
    const res = await timedFetch(req, url, COLD_TIMEOUT, false);
    if (cacheable(res)) { const copy = res.clone(); e.waitUntil(cache.put(req, copy).catch(() => {})); }
    return res;
  } catch {
    return (await lookup(cache, req)) || Response.error();
  }
}

async function lookup(cache, req) {
  const exact = await cache.match(req, { ignoreVary: true });
  if (exact) return exact;
  if (!isNav(req)) return null;
  return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ||
    (await cache.match(new URL("./", self.location).href, { ignoreVary: true })) ||
    (await cache.match(new URL("./index.html", self.location).href, { ignoreVary: true })) || null;
}

function timedFetch(req, url, ms, background) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const cross = url.origin !== self.location.origin;
  const p = cross
    ? fetch(url.href, { mode: "cors", credentials: "omit", signal: ctl.signal })
    : fetch(req, background ? { cache: "no-cache", signal: ctl.signal } : { signal: ctl.signal });
  return p.finally(() => clearTimeout(timer));
}

const revalidated = new Set();
let announced = false;

function shouldRevalidate(url) {
  if (revalidated.has(url)) return false;
  try {
    if (self.navigator && self.navigator.onLine === false) return false;
    const c = self.navigator && self.navigator.connection;
    if (c && (c.saveData === true || /^(slow-)?2g$/.test(c.effectiveType || ""))) return false;
  } catch {  }
  revalidated.add(url);
  return true;
}

async function revalidate(cache, req, url) {
  try {
    const res = await timedFetch(req, url, REVAL_TIMEOUT, true);
    if (!cacheable(res)) return;
    const prev = await cache.match(req, { ignoreVary: true });
    await cache.put(req, res.clone());
    if (prev && url.origin === self.location.origin && differs(prev, res)) announce();
  } catch {  }
}

function differs(a, b) {
  for (const h of ["etag", "last-modified", "content-length"]) {
    const x = a.headers.get(h), y = b.headers.get(h);
    if (x && y) return x !== y;
  }
  return false;
}

async function announce() {
  if (announced) return;
  announced = true;
  for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "ms-update" });
}

self.addEventListener("install", (e) => e.waitUntil(precache()));

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

async function precache() {
  const seen = new Set();
  await Promise.allSettled((CFG.precache || []).map((raw) => {
    if (LOCAL && /^https?:\/\//.test(raw)) return Promise.resolve();
    let href;
    try { href = new URL(raw, self.location).href; } catch { return Promise.resolve(); }
    return walk(href, seen, 0);
  }));
}

async function walk(href, seen, depth) {
  if (seen.has(href) || seen.size >= WALK_MAX) return;
  seen.add(href);
  let url;
  try { url = new URL(href); } catch { return; }
  const name = cacheNameFor(url);
  if (!name) return;
  let res;
  try {
    const cross = url.origin !== self.location.origin;
    res = await fetch(url.href, cross ? { mode: "cors", credentials: "omit", cache: "reload" } : { cache: "reload" });
  } catch { return; }
  if (!cacheable(res)) return;
  const cache = await caches.open(name);
  const body = depth < WALK_DEPTH && url.origin !== self.location.origin ? await readIfSmall(res.clone()) : null;
  await cache.put(url.href, res).catch(() => {});
  if (!body) return;
  for (const ref of references(body.type, body.text)) {
    let next;
    try { next = new URL(ref, url).href; } catch { continue; }
    if (!/^https?:/.test(next)) continue;
    await walk(next, seen, depth + 1);
  }
}

async function readIfSmall(res) {
  const type = res.headers.get("content-type") || "";
  const len = parseInt(res.headers.get("content-length") || "0", 10);
  if (len > WALK_PARSE_MAX) return null;
  if (!/javascript|css/.test(type)) return null;
  try {
    const text = await res.text();
    return text.length > WALK_PARSE_MAX ? null : { type, text };
  } catch { return null; }
}

const JS_REF = /(?:\bfrom\s*|\bimport\s+)["']([^"']+)["']/g;
const CSS_REF = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

function references(type, text) {
  const re = /css/.test(type) ? CSS_REF : JS_REF;
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const s = m[1];
    if (!s || s.startsWith("data:") || s.startsWith("#")) continue;
    out.push(s);
  }
  return out;
}

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) {
    if (k === APP_CACHE || k === CDN_CACHE) continue;
    if (k.startsWith(APP_PREFIX) || k === `${CFG.app}-v1` || k === `${CFG.app}-v2`) await caches.delete(k);
  }
  await self.clients.claim();
})()));

self.addEventListener("message", (e) => { if (e.data === "ms-skip-waiting") self.skipWaiting(); });
