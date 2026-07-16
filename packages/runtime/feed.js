const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export const VPS_PROXY = "https://jobs-map.mooo.com/feed";

const PROXIES = [
  (u) => u,                                                            
  ...(isLocal ? [(u) => `/feed?url=${encodeURIComponent(u)}`] : []),   
  (u) => `${VPS_PROXY}?url=${encodeURIComponent(u)}`,                  
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
