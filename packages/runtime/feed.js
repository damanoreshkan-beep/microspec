/* @ts-self-types="./feed.d.ts" */
/**
 * CORS strategy with graceful fallback for a static host with no backend: `viaProxy` tries direct, then the
 * dev `/feed` proxy (localhost only), then our own allowlisted VPS proxy, skipping any response a validator
 * rejects. Also exports `fetchJson` (proxy chain + shape-checked JSON.parse), `pool` (bounded-concurrency
 * map), the `isJsonArray`/`isJsonObject` validators, and the `VPS_PROXY` URL with its pinned `SEALED_KEY`.
 * @module
 */
// microspec runtime — CORS strategy with graceful fallback. Works on a static host (GitHub Pages) with no
// backend for almost everything. Order: direct (CORS-friendly APIs) → dev /feed proxy (localhost only) →
// our own allowlisted proxy for the few CORS-blocked sources. A validator lets a bad/HTML proxy response be
// skipped to the next.
//
// Public CORS proxies (allorigins, codetabs) used to sit at the end of this list. They are gone on purpose:
// they are a third party we do not control sitting in the farm's data path, and when they degrade — which
// they do, silently and often — an app goes blank for real users AND takes the whole deploy red, because
// `verify` is the farm gate and a data-less app fails its e2e. That is an outage we neither caused nor can
// fix. Our proxy (microspec-edge, host-allowlisted, on the VPS behind nginx) is ours to keep up.
const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// Our hardened proxy. NOT an open proxy — it only forwards to hosts in the ALLOW list in
// microspec-edge (feed-core.mjs), so a new CORS-blocked source needs a one-line allowlist change + a restart.
/** Our hardened, host-allowlisted CORS proxy (microspec-edge on the VPS) — the last hop of the proxy chain. */
export const VPS_PROXY = "https://dreamstudio.mooo.com/feed";

// The backend's long-term public key, pinned. Used by sealedfetch.js, which re-expresses every call to
// VPS_PROXY as an encrypted envelope so a TLS-inspecting middlebox and our own nginx logs see one constant
// URL and a padded blob instead of paths and prompts.
//
// The server answers GET /feed/pubkey with this key and its SHA-256, which is how you check the pin still
// matches production after a key rotation:
//
//   deno eval 'const l = await (await fetch("https://dreamstudio.mooo.com/feed/pubkey")).json(); console.log(l.key)'
//
// Never fetch it at runtime. A key collected over the channel you are defending pins nothing — whoever could
// swap the response could swap the key. It is deliberately NOT a CI gate either: that would make a proxy
// outage turn the whole farm red, which is the exact failure this file's opening comment describes.
/** The backend's pinned long-term public key (base64url), used by sealedfetch.js to seal calls to VPS_PROXY. */
export const SEALED_KEY = "BLP-06vCYzSiakKos1Sk7Yqzneb0MrbBjozH3EQ_YRgvzqc_0hcZeeFXoDzMhHlXL3awFtjOMFg08dzcKUmbNOM";

const PROXIES = [
  (u) => u,                                                            // direct — API sends its own CORS
  ...(isLocal ? [(u) => `/feed?url=${encodeURIComponent(u)}`] : []),   // dev server same-origin proxy
  (u) => `${VPS_PROXY}?url=${encodeURIComponent(u)}`,                  // ours — allowlisted, and always up
];

/**
 * Fetches a URL as text through the proxy chain (direct → dev proxy → VPS proxy), moving to the next hop on
 * a non-OK status, a timeout, or a response the validator rejects.
 * @param url the upstream URL
 * @param validate predicate on the response text; a false result skips to the next proxy
 * @param timeout per-hop abort timeout in ms
 * @returns the first response text that passed validation; throws the last error when every hop failed
 */
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

/** Validator for `viaProxy`: true when the response text looks like a JSON array (not an HTML error page). */
export const isJsonArray = (x) => x.trim().startsWith("[");
/** Validator for `viaProxy`: true when the response text looks like a JSON object (not an HTML error page). */
export const isJsonObject = (x) => x.trim().startsWith("{");

// fetchJson — the one-liner every data.js repeated: fetch through the proxy chain and JSON.parse, validating
// the shape (object by default, or an array) so a bad/HTML proxy response is skipped rather than parsed.
/**
 * Fetches JSON through the proxy chain, validating the shape before parsing.
 * @param url the upstream URL
 * @param opts options
 * @param opts.array expect a JSON array instead of an object
 * @param opts.timeout per-hop abort timeout in ms
 * @returns the parsed JSON
 */
export async function fetchJson(url, { array = false, timeout = 10000 } = {}) {
  return JSON.parse(await viaProxy(url, array ? isJsonArray : isJsonObject, timeout));
}

// pool — bounded-concurrency map (translate/enrich endpoints rate-limit; a burst of 30 would get throttled).
// Runs at most `n` of `fn` at once over `items`; resolves when all are done. (Was duplicated in translate.js
// + enrich.js.)
/**
 * Runs an async function over items with at most `n` in flight at once.
 * @param items the items to process
 * @param n maximum concurrency
 * @param fn async worker called once per item
 * @returns resolves when every item has been processed
 */
export async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
