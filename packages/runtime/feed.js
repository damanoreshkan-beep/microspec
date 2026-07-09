// microspec runtime — CORS strategy with graceful fallback. Works on a static host (GitHub Pages)
// with no backend. Order: direct (CORS-friendly APIs) → dev /feed proxy (localhost only) → public
// proxies for CORS-blocked sources. A validator lets a bad/HTML proxy response be skipped to the next.
const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const PROXIES = [
  (u) => u,                                                            // direct — API sends its own CORS
  ...(isLocal ? [(u) => `/feed?url=${encodeURIComponent(u)}`] : []),   // dev server same-origin proxy
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
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
