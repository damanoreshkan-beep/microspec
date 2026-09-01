/* @ts-self-types="./feed.d.ts" */
/**
 * CORS strategy with graceful fallback for a static host with no backend: `viaProxy` tries direct, then the
 * dev `/feed` proxy (localhost only), then our own allowlisted VPS proxy, skipping any response a validator
 * rejects. Also exports `fetchJson` (proxy chain + shape-checked JSON.parse), `pool` (bounded-concurrency
 * map), the `isJsonArray`/`isJsonObject` validators, and the `VPS_PROXY` URL with its pinned `SEALED_KEY`.
 * @module
 */
const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** Our hardened, host-allowlisted CORS proxy (microspec-edge on the VPS) — the last hop of the proxy chain. */
export const VPS_PROXY = "https://dreamstudio.mooo.com/feed";

/** The backend's pinned long-term public key (base64url), used by sealedfetch.js to seal calls to VPS_PROXY. */
export const SEALED_KEY = "BLP-06vCYzSiakKos1Sk7Yqzneb0MrbBjozH3EQ_YRgvzqc_0hcZeeFXoDzMhHlXL3awFtjOMFg08dzcKUmbNOM";

const PROXIES = [
  (u) => u,                                                            
  ...(isLocal ? [(u) => `/feed?url=${encodeURIComponent(u)}`] : []),   
  (u) => `${VPS_PROXY}?url=${encodeURIComponent(u)}`,                  
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
