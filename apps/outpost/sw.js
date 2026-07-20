const CACHE = "outpost-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
// Network-first with REVALIDATION: fetch({cache:"no-cache"}) bypasses the browser HTTP cache (GitHub Pages
// sets max-age=600), so a fresh runtime/app deploy reaches installed PWAs immediately (304 when unchanged).
// Offline → fall back to the cached copy.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try { const r = await fetch(e.request, { cache: "no-cache" }); if (r && r.ok) c.put(e.request, r.clone()); return r; }
    catch { return (await c.match(e.request)) || Response.error(); }
  })());
});
