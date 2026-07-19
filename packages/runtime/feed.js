// microspec runtime — CORS strategy with graceful fallback. Works on a static host (GitHub Pages) with no
// backend for almost everything. Order: direct (CORS-friendly APIs) → dev /feed proxy (localhost only) →
// our own allowlisted proxy for the few CORS-blocked sources. A validator lets a bad/HTML proxy response be
// skipped to the next.
//
// Public CORS proxies (allorigins, codetabs) used to sit at the end of this list. They are gone on purpose:
// they are a third party we do not control sitting in the farm's data path, and when they degrade — which
// they do, silently and often — an app goes blank for real users AND takes the whole deploy red, because
// `verify` is the farm gate and a data-less app fails its e2e. That is an outage we neither caused nor can
// fix. Our proxy (proxy/feed-proxy.mjs, host-allowlisted, on the VPS behind nginx) is ours to keep up.
const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// Our hardened proxy. NOT an open proxy — it only forwards to hosts in the ALLOW list in
// proxy/feed-proxy.mjs, so a new CORS-blocked source needs a one-line allowlist change + a restart.
export const VPS_PROXY = "https://jobs-map.mooo.com/feed";

const PROXIES = [
  (u) => u,                                                            // direct — API sends its own CORS
  ...(isLocal ? [(u) => `/feed?url=${encodeURIComponent(u)}`] : []),   // dev server same-origin proxy
  (u) => `${VPS_PROXY}?url=${encodeURIComponent(u)}`,                  // ours — allowlisted, and always up
];

export async function viaProxy(url, validate = (x) => !!x, timeout = 10000) {
  let err;
  for (const wrap of PROXIES) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(wrap(url), { signal: ctrl.signal });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const x = await r.text();
      if (validate(x)) return x;
      throw new Error("failed validator");
    } catch (e) { err = e; } finally { clearTimeout(t); }
  }
  throw err;
}

export const isJsonArray = (x) => x.trim().startsWith("[");
export const isJsonObject = (x) => x.trim().startsWith("{");

// fetchJson — the one-liner every data.js repeated: fetch through the proxy chain and JSON.parse, validating
// the shape (object by default, or an array) so a bad/HTML proxy response is skipped rather than parsed.
export async function fetchJson(url, { array = false, timeout = 10000 } = {}) {
  return JSON.parse(await viaProxy(url, array ? isJsonArray : isJsonObject, timeout));
}

// pool — bounded-concurrency map (translate/enrich endpoints rate-limit; a burst of 30 would get throttled).
// Runs at most `n` of `fn` at once over `items`; resolves when all are done. (Was duplicated in translate.js
// + enrich.js.)
export async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
