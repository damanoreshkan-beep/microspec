const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export const VPS_PROXY = "https://dreamstudio.mooo.com/feed";

export const SEALED_KEY = "BLP-06vCYzSiakKos1Sk7Yqzneb0MrbBjozH3EQ_YRgvzqc_0hcZeeFXoDzMhHlXL3awFtjOMFg08dzcKUmbNOM";

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

export async function fetchJson(url, { array = false, timeout = 10000 } = {}) {
  return JSON.parse(await viaProxy(url, array ? isJsonArray : isJsonObject, timeout));
}

export async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
