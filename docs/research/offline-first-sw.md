# Offline-first service worker — why the farm did NOT work offline

Research note for the SW rewrite. The README claimed *"They work offline"*; it was not true, and the
reasons are structural, not per-app. Four independent defects, each sufficient on its own.

## Symptom

An app that needs no network at all (`rave` — a synth + WebGL visualiser) does not start offline, even
after being used online many times. On a weak connection the same app hangs on the boot bar instead of
opening from cache.

## Defect 1 — the shell is CDN-hosted, and the SW refused to cache cross-origin

The old per-app `sw.js` began:

```js
if (e.request.method !== "GET" || u.origin !== location.origin) return;   // ← everything below is uncached
```

But an app's *code* is cross-origin by design (the fixed stack: no build step, esm.sh import map):

| origin | what | needed to boot? |
|---|---|---|
| `esm.sh` | preact, htm/preact, nanostores, @nanostores/*, motion | **yes** — `index.js` static-imports them |
| `cdn.jsdelivr.net` | `@tailwindcss/browser@4`, `daisyui@5`, `daisyui@5/themes.css` | styling |
| `code.iconify.design` | `iconify-icon` custom element | every icon |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Geist / Geist Mono | typography |

So offline the module graph fails at `import { start } from "../_rt/index.js"` → `import "preact"` → network
error. Nothing renders; `#boot` stays up forever. Same-origin caching could never have fixed this.

Whether it "sometimes worked" depended entirely on the browser HTTP disk cache (esm.sh sends
`max-age=31536000, immutable`, jsdelivr `604800`, iconify `86400`, Google Fonts CSS `private, max-age=86400`)
— i.e. on eviction luck, not on anything we controlled.

**Verified**: every one of those origins responds `access-control-allow-origin: *`, so a service worker may
re-issue the request in `cors` mode and `cache.put` the result. (`cache.put` rejects opaque/status-0
responses, which is why a plain `no-cors` passthrough could not be cached — the SW must force `cors`.)
Returning a `cors` response to a `no-cors` request is legal: the spec only forbids returning a `cors`
response when the request mode is `same-origin`.

**Verified**: esm.sh entry URLs are *re-export stubs*, not the code —

```
GET https://esm.sh/preact@10.27.1
/* esm.sh - preact@10.27.1 */
export * from "/preact@10.27.1/es2022/preact.mjs";
```

so caching the import-map URL alone still leaves the real module uncached. The precache must **walk the
module graph** (fetch → regex the import specifiers → recurse). Depth is 1–2 for every entry we use.

## Defect 2 — every app deleted every other app's cache

All 57 apps are served from one origin (`damanoreshkan-beep.github.io`), and `caches.keys()` is
**per-origin**, not per-scope. The old activate handler:

```js
for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
```

So the first launch of `sun` after its SW version bumped wiped `rave-v2`, `store-v2` and 54 others. Those
apps' service workers were already activated, so they never re-precached — they silently degraded to
"whatever runtime caching happens to refill". This is the single best explanation for *"it was cached and
now it isn't"*. Cache names are now namespaced (`ms-<app>-<version>`) and cleanup is prefix-scoped.

## Defect 3 — network-first with no timeout ⇒ a weak link is worse than no link

```js
try { const r = await fetch(e.request, { cache: "no-cache" }); ... } catch { return cached }
```

`cache: "no-cache"` forces a conditional revalidation **to the server on every single request** — the
browser HTTP cache is deliberately bypassed. On a good link that is a 304 and costs a round-trip; on a weak
link it is a stall, and Chrome's network timeout is minutes, not seconds. The cached copy was sitting right
there and was only consulted after `fetch` *rejected* — which a slow network never does. Offline (fast
`TypeError`) was strictly better than 2G.

## Defect 4 — nothing was ever precached

The cache was populated exclusively as a side effect of requests that passed through the SW. On a first
visit the document and its whole module graph are fetched **before** the SW is registered and claims the
page, so they are not cached. Only a *second* online launch populated the shell. Nothing guaranteed the
lazily-reached files (per-locale JSON, a tab's assets) were ever in there at all.

## The design that replaces it

One shared implementation — `packages/runtime/sw-core.js` — pulled in by a generated per-app stub
(`apps/<id>/sw.js`) that carries only the app's identity and its precache manifest. A per-app `sw.js` file
must exist because scope is derived from the SW script's path and GitHub Pages cannot send
`Service-Worker-Allowed`; `importScripts("/_rt/sw-core.js")` keeps the *logic* in exactly one place.

1. **Precache at install** — the app's own files, the transitive `/_rt/` module closure (computed from the
   real import graph by `tools/graph.mjs`), and the CDN URLs the shell statically needs, module-walked.
   `Promise.allSettled` + per-entry `put`, never `addAll`: a single flaky asset must not fail the install.
   Fetched with `cache: "reload"` so a precache can't inherit a stale HTTP-cached copy.
2. **Stale-while-revalidate for everything cacheable** — serve the cache hit *immediately*, revalidate in
   the background. Offline and 2G take the identical instant path; freshness costs no latency, ever.
3. **Never block on a dying link** — a cold miss races the network against a timeout, then falls back to a
   query-insensitive cache match, then to `./` for navigations (`start_url: "./"`, so the navigation cache
   key is the directory, not `index.html`).
4. **Back off on a bad link** — background revalidation is skipped when `onLine === false`, when
   `connection.saveData` is set, or on `2g`/`slow-2g`; and each URL is revalidated at most once per SW
   lifetime. A slow link must not be flooded with revalidations competing with the app's real data.
5. **Freshness is not lost** — every launch revalidates the shell in the background, so the next launch is
   current. When a revalidation finds a *changed* same-origin shell file, or a new SW reaches `waiting`, the
   page is told and offers a restart (`S.update` → snackbar). `skipWaiting` is never automatic: a cache-first
   SW that swaps caches under a running page causes version skew.

### What is deliberately *not* precached

`apps/<id>/assets/*` (card scans, wasm, samples) and heavy lazy modules (`three` — always reached through
`import("three")`, guarded, with a DOM fallback). They are cached on first use like everything else. The
shell is a fixed small cost at install; media is not.

### Range requests

`cache.put` rejects a `206`. Requests carrying a `Range` header (media elements) pass straight through.
