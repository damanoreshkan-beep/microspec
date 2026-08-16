
import { VPS_PROXY, SEALED_KEY } from "./feed.js";
import { seal, openResponse, b64u, unb64u } from "./sealed.js";

export async function sealedFrameUrl(url, ref) {
  const { wire } = await seal(SEALED_KEY, { p: "/feed/frame", u: url, r: ref || null });
  return `${VPS_PROXY}/frame?s=${b64u(wire)}`;
}
const PLAIN = [
  `${VPS_PROXY}/frame`,                               
  
  
  `${VPS_PROXY}/apk`,
  
  
  
  `${VPS_PROXY}/chat/stream`,
];
const TUNNEL = `${VPS_PROXY}/f`;
const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "");

const innerPath = (url) => "/feed" + url.slice(VPS_PROXY.length);
export function installSealedFetch(realFetch = globalThis.fetch.bind(globalThis)) {
  const patched = async (input, init = {}) => {
    const url = urlOf(input);
    if (!url.startsWith(VPS_PROXY) || url.startsWith(TUNNEL) || PLAIN.some((p) => url.startsWith(p))) {
      return realFetch(input, init);
    }
    const method = (init.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    let body = null;
    if (init.body != null) {
      
      if (typeof init.body !== "string") return realFetch(input, init);
      try { body = JSON.parse(init.body); } catch { return realFetch(input, init); }
    }

    const { wire, resKey } = await seal(SEALED_KEY, { p: innerPath(url), m: method, b: body });
    
    const r = await realFetch(TUNNEL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: wire,
      signal: init.signal,
    });
    
    
    if (!r.ok) throw new Error(`sealed transport ${r.status}`);

    const out = await openResponse(resKey, new Uint8Array(await r.arrayBuffer()));
    const payload = out.enc === "b64" ? unb64u(out.body) : out.body;
    return new Response(out.s === 204 || out.s === 304 ? null : payload, {
      status: out.s,
      headers: out.ct ? { "content-type": out.ct } : {},
    });
  };
  globalThis.fetch = patched;
  return () => { globalThis.fetch = realFetch; };      
}
