// microspec runtime — offline-first service worker unit tests. Pure logic: no browser, no import map.
//   deno test -A packages/runtime/runtime_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
// ===================== offline-first service worker (sw-core.js + deploy/sw.mjs) =====================
// The SW is a CLASSIC worker script (importScripts can't load an ES module), so it can't be imported here.
// We evaluate it against a stubbed `self` instead — which is also the only honest way to prove the policy,
// since the farm's whole offline story turns on WHICH origins get cached and which app owns which cache.
import { manifestFor } from "../../../deploy/sw.mjs";
import { pkgRoot } from "../pkgroot.js";

// A CacheStorage/Cache pair faithful enough for the two behaviours that matter: exact match, and the
// ignoreSearch/scope-root fallback an installed PWA's `start_url: "./"` navigation depends on.
class FakeCache {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  key(req) { return typeof req === "string" ? req : req.url; }
  // deno-lint-ignore require-await
  async match(req, opts) {
    const url = this.key(req);
    if (this.map.has(url)) return this.map.get(url);
    if (!opts?.ignoreSearch) return undefined;
    const bare = url.split("?")[0];
    for (const [k, v] of this.map) if (k.split("?")[0] === bare) return v;
    return undefined;
  }
  // deno-lint-ignore require-await
  async put(req, res) { this.map.set(this.key(req), res); }
}
const swReq = (url, extra = {}) => ({ url, method: "GET", headers: new Headers(), mode: "no-cors", destination: "script", ...extra });
const swEvent = (request) => {
  const e = { request, waits: [], respondWith(p) { this.responded = p; }, waitUntil(p) { this.waits.push(p); } };
  return e;
};

function loadSwCore(app = "rave", { origin = "https://damanoreshkan-beep.github.io", cached = {}, fetch, connection, onLine = true } = {}) {
  const src = Deno.readTextFileSync(new URL("packages/runtime/sw-core.js", pkgRoot(import.meta.url, 3)));
  const events = {};
  const cache = new FakeCache(cached);
  const calls = [];
  const self = {
    MS: { app, version: "abc123", precache: [] },
    location: new URL(`${origin}/microspec/${app}/sw.js`),
    addEventListener: (k, fn) => { events[k] = fn; },
    navigator: { onLine, connection },
    clients: { matchAll: () => Promise.resolve([]), claim: () => Promise.resolve() },
  };
  const caches = { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
  const doFetch = (input, init) => { calls.push(typeof input === "string" ? input : input.url); return (fetch || (() => Promise.reject(new TypeError("offline"))))(input, init); };
  new Function("self", "caches", "fetch", src)(self, caches, doFetch);
  const fire = async (request) => { const e = swEvent(request); events.fetch(e); const res = e.responded ? await e.responded : null; await Promise.allSettled(e.waits); return res; };
  return { self, events, cache, calls, fire };
}

Deno.test("sw: caches the CDN origins the shell is BUILT from — same-origin-only can't boot an app offline", () => {
  const { self } = loadSwCore();
  const { cacheNameFor, APP_CACHE, CDN_CACHE } = self.MS_POLICY;
  const at = (u) => cacheNameFor(new URL(u));
  assertEquals(at("https://damanoreshkan-beep.github.io/microspec/rave/view.js"), APP_CACHE);
  assertEquals(at("https://damanoreshkan-beep.github.io/microspec/_rt/index.js"), APP_CACHE, "the runtime is out of scope but still ours");
  for (const u of ["https://esm.sh/preact@10.27.1", "https://cdn.jsdelivr.net/npm/daisyui@5", "https://code.iconify.design/x.js", "https://fonts.gstatic.com/s/geist/x.woff2"]) {
    assertEquals(at(u), CDN_CACHE, `${u} is the app's own code/asset — not caching it is why offline failed`);
  }
});

Deno.test("sw: live data is never cached — the feed proxy and unpinned third parties pass through", () => {
  const { self } = loadSwCore();
  const { cacheNameFor } = self.MS_POLICY;
  assertEquals(cacheNameFor(new URL("https://damanoreshkan-beep.github.io/feed?url=x")), null, "the dev/gate proxy is live data");
  assertEquals(cacheNameFor(new URL("https://dreamstudio.mooo.com/feed?url=x")), null);
  assertEquals(cacheNameFor(new URL("https://api.open-meteo.com/v1/forecast")), null);
});

Deno.test("sw: cache names are app-namespaced — CacheStorage is per-ORIGIN and all 57 apps share one", () => {
  const a = loadSwCore("rave").self.MS_POLICY, b = loadSwCore("sun").self.MS_POLICY;
  assert(a.APP_CACHE !== b.APP_CACHE, "two apps must not share an app cache");
  assert(a.APP_CACHE.startsWith("ms-rave-") && b.APP_CACHE.startsWith("ms-sun-"));
  assertEquals(a.CDN_CACHE, b.CDN_CACHE, "pinned immutable CDN URLs are shared on purpose — one copy, not 57");
});

Deno.test("sw: registers install/activate/fetch/message — a worker with no fetch handler is not installable", () => {
  const { events } = loadSwCore();
  for (const k of ["install", "activate", "fetch", "message"]) assert(typeof events[k] === "function", `missing ${k} handler`);
});

// These two fixtures are PRODUCT apps (rave; hoard/persona/iching shaders) — absent in the public framework
// tree (the dreamstudio split); the product repo's CI runs them in full.
const HAVE_FARM = await Deno.stat("apps/rave/view.js").then(() => true).catch(() => false); // cwd — the apps live in the CONSUMER'S tree, not in the package
Deno.test({ name: "sw manifest: a real app's shell covers document, spec, locales, runtime closure and CDN code", ignore: !HAVE_FARM, fn: () => {
  const m = manifestFor("rave");
  for (const u of ["./", "./index.html", "./spec.json", "./i18n/en.json", "./i18n/uk.json", "./view.js", "/_rt/index.js", "/_rt/render.js", "/_rt/theme.css"]) {
    assert(m.includes(u), `precache is missing ${u} — the app would not boot offline`);
  }
  assert(m.some((u) => u.startsWith("https://esm.sh/preact@")), "preact is a STATIC import of the runtime: no preact, no app");
  assert(m.some((u) => u.startsWith("https://cdn.jsdelivr.net/npm/@tailwindcss/browser")));
  assert(!m.some((u) => /esm\.sh\/three@/.test(u)), "three is dynamic + fallback-guarded — cached on use, not at install");
  assert(!m.some((u) => u.includes("brand.svg")), "brand.svg is a build input, never fetched at runtime");
} });

// A shader is fetched, not imported, so the import graph cannot see it — it used to be TWO hardcoded
// filenames, and an app whose shader was named anything else booted offline to a blank canvas.
Deno.test({ name: "sw manifest: an app's shader is discovered, not listed by name", ignore: !HAVE_FARM, fn: () => {
  for (const [id, file] of [["hoard", "./hoard.frag"], ["persona", "./presence.frag"], ["iching", "./hero.wgsl"]]) {
    assert(manifestFor(id).includes(file), `${id}: ${file} missing from the precache — the stage is blank offline`);
  }
} });

// The four behaviours the whole change exists for. Proved browser-free, against the real sw-core.js source.
Deno.test("sw: offline, a cached app still opens — the cache is consulted FIRST, not after a fetch fails", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  const { fire, calls } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, onLine: false });
  const res = await fire(swReq(url));
  assertEquals(await res.text(), "cached");
  assertEquals(calls.length, 0, "offline: no network attempt at all — and no revalidation to hang on either");
});

Deno.test("sw: a weak link is served from cache instantly; the refresh happens BEHIND the response", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  let release;
  const slow = () => new Promise((r) => { release = () => r(new Response("fresh", { status: 200 })); });
  const { events, cache } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, fetch: slow });
  const e = swEvent(swReq(url));
  events.fetch(e);
  const res = await e.responded;   // resolves while the network request is STILL in flight — the 2G fix
  assertEquals(await res.text(), "cached", "the response must never wait on a slow link when we hold a copy");
  release();                        // now let the background revalidation land
  await Promise.allSettled(e.waits);
  assertEquals(await (await cache.match(url)).text(), "fresh", "…and freshness still arrives, just behind the user");
});

Deno.test("sw: an installed app's navigation resolves through ?query and the scope root, not a byte-exact URL", async () => {
  const root = "https://damanoreshkan-beep.github.io/microspec/rave/";
  const { fire } = loadSwCore("rave", { cached: { [root]: new Response("<html>shell</html>", { status: 200 }) } });
  const res = await fire(swReq(root + "?utm=x", { mode: "navigate", destination: "document" }));
  assertEquals(await res.text(), "<html>shell</html>", "start_url is './' — a launch carrying a query must still open offline");
});

Deno.test("sw: on a 2g/saveData link we do NOT spend bandwidth revalidating what we already have", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/view.js";
  const mk = (connection) => loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) }, fetch: () => Promise.resolve(new Response("fresh", { status: 200 })), connection });
  const good = mk({ effectiveType: "4g" });
  await good.fire(swReq(url));
  assertEquals(good.calls.length, 1, "a usable link refreshes in the background — freshness is not traded away");
  for (const c of [{ effectiveType: "2g" }, { effectiveType: "slow-2g" }, { saveData: true }]) {
    const bad = mk(c);
    await bad.fire(swReq(url));
    assertEquals(bad.calls.length, 0, `${JSON.stringify(c)}: revalidation must not compete with the app's own data`);
  }
  const twice = mk({ effectiveType: "4g" });
  await twice.fire(swReq(url));
  await twice.fire(swReq(url));
  assertEquals(twice.calls.length, 1, "at most one revalidation per URL per worker lifetime");
});

// The one exception to stale-while-revalidate, and the most expensive bug this worker has shipped. An
// Android install BAKES orientation/display/name/icons into a WebAPK; the only way they ever change again is
// the browser re-reading manifest.json (once a day at best) and diffing. That read is `destination:
// "manifest"` and lands here — so a cache hit hands the update check the manifest the app was installed
// with, and the app's own cache pins its own identity. reel was installed while every manifest said
// `orientation: "portrait"`; a stale read is what would have kept it portrait after the fix shipped.
Deno.test("sw: the manifest is fetched network-FIRST — a cached one pins the installed app's identity", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/reel/manifest.json";
  const stale = () => new Response('{"orientation":"portrait"}', { status: 200 });
  const fresh = () => Promise.resolve(new Response('{"orientation":"any"}', { status: 200 }));

  for (const req of [swReq(url, { destination: "manifest" }), swReq(url)]) {
    const { fire, cache, calls } = loadSwCore("reel", { cached: { [url]: stale() }, fetch: fresh });
    const res = await fire(req);
    assertEquals(JSON.parse(await res.text()).orientation, "any", `${req.destination}: the update check must read the LIVE manifest, never the cached one`);
    assertEquals(calls.length, 1, "network first — one request, and the response is the one we return");
    assertEquals(JSON.parse(await (await cache.match(url)).text()).orientation, "any", "…and the fresh copy replaces the stale one, so the offline fallback is current too");
  }
});

Deno.test("sw: offline (or mid-deploy 404), the manifest still answers from the precache", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/reel/manifest.json";
  const req = () => swReq(url, { destination: "manifest" });
  const held = () => new Response('{"orientation":"any"}', { status: 200 });

  const off = loadSwCore("reel", { cached: { [url]: held() }, onLine: false });
  assertEquals(JSON.parse(await (await off.fire(req())).text()).orientation, "any", "offline: the installed app must still have a manifest");

  const gone = loadSwCore("reel", { cached: { [url]: held() }, fetch: () => Promise.resolve(new Response("nope", { status: 404 })) });
  assertEquals(JSON.parse(await (await gone.fire(req())).text()).orientation, "any", "a 404 mid-deploy must not be read as the app's identity");
});

Deno.test("sw: a cross-origin CDN asset is re-issued as cors — an opaque response cannot be cached", async () => {
  const url = "https://esm.sh/preact@10.27.1";
  let mode;
  const { fire, cache } = loadSwCore("rave", { fetch: (_u, init) => { mode = init?.mode; return Promise.resolve(new Response("export{}", { status: 200 })); } });
  await fire(swReq(url));
  assertEquals(mode, "cors", "the page requests this no-cors; caching the opaque result would throw");
  assert(await cache.match(url), "the app's own dependency has to end up in the cache");
});

Deno.test("sw: a media Range request is passed straight through — cache.put rejects a 206", async () => {
  const url = "https://damanoreshkan-beep.github.io/microspec/rave/assets/kick.wav";
  const { fire } = loadSwCore("rave", { cached: { [url]: new Response("cached", { status: 200 }) } });
  const req = swReq(url, { headers: new Headers({ range: "bytes=0-1" }) });
  assertEquals(await fire(req), null, "respondWith must not be called at all");
});
