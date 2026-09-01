/* @ts-self-types="./sw-core.d.ts" */
/**
 * THE service worker — one implementation shared by every app in the farm. A classic worker script (not an
 * ES module: `importScripts` cannot load one), so it exports nothing; each app's generated `sw.js` stub sets
 * `self.MS = { app, version, precache }` and imports this file. It precaches the shell (own files, /_rt/
 * closure and the pinned CDN graph), serves stale-while-revalidate, never blocks on a dying link, and backs
 * off on a bad one; the manifest alone is network-first because it is the installed app's identity.
 * @module
 */
// microspec runtime — THE service worker. One implementation, shared by every app in the farm.
//
// Each app ships a generated stub `apps/<id>/sw.js` that sets `self.MS = { app, version, precache }` and then
// `importScripts()` this file. A per-app stub is unavoidable: a worker's scope comes from its own script path
// and GitHub Pages cannot send `Service-Worker-Allowed`. But the *logic* must exist once — the farm previously
// carried 57 hand-copied service workers, which is how 57 copies of the same four bugs shipped.
// Classic worker script on purpose: `importScripts` cannot load an ES module.
//
// The contract (see docs/research/offline-first-sw.md for the full diagnosis):
//   1. PRECACHE the shell at install — the app's files, its /_rt/ module closure, and the CDN code the shell
//      is built from. Cross-origin is NOT optional here: with no build step the app's own dependencies
//      (preact/htm/nanostores, tailwind, iconify, fonts) live on esm.sh/jsdelivr, so a same-origin-only
//      cache leaves an "offline" app unable to boot. Every one of those origins is `access-control-allow-
//      origin: *`, so we re-issue cross-origin requests in cors mode — an opaque response cannot be cached.
//   2. STALE-WHILE-REVALIDATE — serve the cache immediately, refresh behind it. Offline and 2G take the same
//      instant path, and freshness never costs latency.
//   3. NEVER BLOCK on a dying link — a cold miss races a timeout, then falls back to cache, then to `./`.
//   4. BACK OFF on a bad link — no background revalidation when offline / saveData / 2g, and each URL is
//      revalidated at most once per worker lifetime, so revalidation never competes with the app's own data.
//
// Freshness is not traded away: every launch revalidates the shell, so the next launch is current, and a
// changed shell file (or a waiting worker) tells the page, which offers a restart. skipWaiting is NEVER
// automatic — swapping caches under a running page is how you get half-old, half-new code.
"use strict";

const CFG = self.MS || { app: "app", version: "0", precache: [] };

// Cache names are namespaced by app. They MUST be: CacheStorage is per-ORIGIN, and all 57 apps share
// damanoreshkan-beep.github.io — the old `for (k of caches.keys()) if (k !== CACHE) delete(k)` cleanup meant
// every app wiped every other app's cache on its first launch after a version bump. That is the single best
// explanation for "it was cached and now it isn't".
const APP_CACHE = `ms-${CFG.app}-${CFG.version}`;
const APP_PREFIX = `ms-${CFG.app}-`;
// Pinned, immutable, identical for every app → one shared cache instead of 57 copies of tailwind.
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

const COLD_TIMEOUT = 12000;   // cold miss: how long a first fetch may hold the app hostage
const REVAL_TIMEOUT = 20000;  // background: nobody is waiting, but don't leak forever
const WALK_MAX = 90;          // precache module-walk budget (URLs), a runaway-graph backstop
const WALK_DEPTH = 3;
const WALK_PARSE_MAX = 512 * 1024; // don't regex a 400KB bundle for imports it doesn't have

// ── policy ──────────────────────────────────────────────────────────────────────────────────────────────
// Which cache a URL belongs in — or null for "don't touch it" (live data: the feed proxy, APIs, anything
// third-party we haven't pinned).
function cacheNameFor(url) {
  if (url.origin === self.location.origin) {
    return url.pathname.replace(/\/+$/, "").endsWith("/feed") || url.pathname === "/feed" ? null : APP_CACHE;
  }
  return CDN.includes(url.origin) ? CDN_CACHE : null;
}
self.MS_POLICY = { cacheNameFor, APP_CACHE, CDN_CACHE, CDN };   // unit-test surface (runtime_test.js)

const isNav = (req) => req.mode === "navigate" || req.destination === "document";
const cacheable = (res) => !!res && res.status === 200 && (res.type === "basic" || res.type === "cors" || res.type === "default");

// The web manifest is the ONE file stale-while-revalidate must not touch, and the reason is not freshness —
// it is that the manifest is the INSTALLED app's identity. On Android an install mints a WebAPK whose
// AndroidManifest bakes `name`, `icons`, `display`, `start_url` and `orientation` at install time; the OS
// applies them before a line of our code runs, and no web API can override them. The only path by which any
// of those ever changes again is the browser re-reading manifest.json at launch (throttled to once per 24h,
// and backing off to 30 days when a check fails) and diffing it against what it baked. That read is an
// ordinary subresource fetch with `destination: "manifest"` — so it lands in THIS worker, and a cache hit
// hands the update check the manifest the app was installed with. The app's own offline cache then pins its
// own identity, permanently on a link where revalidation is skipped (offline/saveData/2g). reel was
// installed while every manifest in the farm still said `orientation: "portrait"`, and this is the half that
// would have kept it portrait after the fix shipped.
// So: network FIRST for the manifest, cache only as the offline fallback. It costs one request per launch.
const isManifest = (req, url) => req.destination === "manifest" || /\/manifest\.json$/.test(url.pathname);

// ── fetch ───────────────────────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return;             // 206 is not cacheable; let media stream itself
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const name = cacheNameFor(url);
  if (!name) return;
  e.respondWith(serve(e, req, url, name));
});

async function serve(e, req, url, name) {
  const cache = await caches.open(name);
  if (isManifest(req, url)) return manifestFirst(e, cache, req, url);
  const hit = await lookup(cache, req);
  if (hit) {
    if (shouldRevalidate(req.url)) e.waitUntil(revalidate(cache, req, url));
    return hit;                                      // instant, offline or not — the whole point
  }
  try {
    const res = await timedFetch(req, url, COLD_TIMEOUT, false);
    if (cacheable(res)) { const copy = res.clone(); e.waitUntil(cache.put(req, copy).catch(() => {})); }
    return res;
  } catch {
    return (await lookup(cache, req)) || Response.error();
  }
}

// Network first, cache as the fallback — see isManifest. `background: true` is what makes the request
// `cache: "no-cache"`, so the browser's own HTTP cache cannot re-introduce the staleness one layer down.
// Anything that is not a cacheable 200 (a 404 mid-deploy, a captive portal) falls back to the copy we hold:
// a broken manifest read is worse than yesterday's, because the browser treats it as the app's identity.
async function manifestFirst(e, cache, req, url) {
  try {
    const res = await timedFetch(req, url, COLD_TIMEOUT, true);
    if (!cacheable(res)) return (await cache.match(req, { ignoreVary: true })) || res;
    const copy = res.clone();
    e.waitUntil(cache.put(req, copy).catch(() => {}));
    return res;
  } catch {
    return (await cache.match(req, { ignoreVary: true })) || Response.error();
  }
}

// Exact match first; for a NAVIGATION also try query-insensitively and then the scope root — `start_url` is
// "./", so an installed app's navigation cache key is the DIRECTORY, and a launch carrying ?utm/?tab must
// still resolve. That looseness stops at navigations on purpose: for a subresource, `?id=5` and `?id=3` are
// different answers, and serving one for the other would be worse than being offline.
async function lookup(cache, req) {
  const exact = await cache.match(req, { ignoreVary: true });
  if (exact) return exact;
  if (!isNav(req)) return null;
  return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ||
    (await cache.match(new URL("./", self.location).href, { ignoreVary: true })) ||
    (await cache.match(new URL("./index.html", self.location).href, { ignoreVary: true })) || null;
}

// A cross-origin subresource is requested by the page in `no-cors` mode, whose response is opaque and which
// `cache.put` rejects. So we re-issue it ourselves as cors (every pinned CDN sends `access-control-allow-
// origin: *`). Returning a cors response to a no-cors request is legal — only a `same-origin` request mode
// forbids it.
function timedFetch(req, url, ms, background) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const cross = url.origin !== self.location.origin;
  const p = cross
    ? fetch(url.href, { mode: "cors", credentials: "omit", signal: ctl.signal })
    : fetch(req, background ? { cache: "no-cache", signal: ctl.signal } : { signal: ctl.signal });
  return p.finally(() => clearTimeout(timer));
}

// ── revalidation (the freshness half) ───────────────────────────────────────────────────────────────────
const revalidated = new Set();
let announced = false;

// Refuse to spend a bad link's bandwidth on refreshing something we already have. This is what makes a weak
// connection behave like no connection instead of worse than one.
function shouldRevalidate(url) {
  if (revalidated.has(url)) return false;
  try {
    if (self.navigator && self.navigator.onLine === false) return false;
    const c = self.navigator && self.navigator.connection;
    if (c && (c.saveData === true || /^(slow-)?2g$/.test(c.effectiveType || ""))) return false;
  } catch { /* no NetworkInformation — assume a usable link */ }
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
  } catch { /* the entire point of revalidating in the background: failing changes nothing */ }
}

// Cheap "did this file actually change" using validators the server already sends (GitHub Pages sends both
// ETag and Last-Modified). No validator on either side → assume unchanged; a false "update ready" prompt is
// worse than a late one.
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

// ── install: precache the shell ─────────────────────────────────────────────────────────────────────────
self.addEventListener("install", (e) => e.waitUntil(precache()));

// On localhost (the Chromium gate) the CDN half is skipped: the gate proves the worker installs and serves,
// and 57 matrix jobs each pulling tailwind + the whole esm.sh graph would buy nothing but CI minutes and
// third-party load. The same-origin half still runs, so the code path itself is exercised.
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

// Fetch + cache one URL, then follow what it references. The walk is not optional for esm.sh: an entry URL
// returns a re-export STUB, not the code —
//   GET https://esm.sh/preact@10.27.1  →  export * from "/preact@10.27.1/es2022/preact.mjs";
// so precaching only the import-map URL leaves the actual module uncached and the app still dead offline.
// Same for a Google Fonts stylesheet and its woff2 files.
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
    // cache: "reload" — a precache must never inherit a stale copy from the browser's HTTP cache.
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

// ── activate ────────────────────────────────────────────────────────────────────────────────────────────
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) {
    if (k === APP_CACHE || k === CDN_CACHE) continue;
    // ONLY this app's own caches (plus the pre-namespace one it used to write). Another app's cache is not
    // ours to delete, even though CacheStorage hands us the key.
    if (k.startsWith(APP_PREFIX) || k === `${CFG.app}-v1` || k === `${CFG.app}-v2`) await caches.delete(k);
  }
  await self.clients.claim();
})()));

// The page asks for the swap when the user taps "restart" on the update snackbar — never on our own.
self.addEventListener("message", (e) => { if (e.data === "ms-skip-waiting") self.skipWaiting(); });

// A tap on one of the app's notifications (/_rt/notify.js) brings the app back: focus the window that is
// already open under this scope, or open a fresh one at the app root — never a second copy beside the first.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const scope = self.registration.scope, url = new URL(e.notification.data?.url || "./", scope).href;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (c.url.startsWith(scope) && "focus" in c) return c.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  })());
});
