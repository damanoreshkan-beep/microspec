const CACHE = "ruler-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener("fetch", (e) => { const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== location.origin) return; e.respondWith((async () => { const c = await caches.open(CACHE); try { const r = await fetch(e.request); if (r && r.ok) c.put(e.request, r.clone()); return r; } catch { return (await c.match(e.request)) || Response.error(); } })()); });
