/* @ts-self-types="./sealedfetch.d.ts" */
/**
 * The sealed-tunnel interceptor: wraps `fetch` so every request to our proxy travels as one sealed
 * envelope to POST /feed/f and comes back as an ordinary Response — no call site changes shape, and
 * turning the tunnel off is deleting one import. Exports `installSealedFetch`, plus `sealedFrameUrl` /
 * `sealedClipUrl` for the element-loaded URLs a fetch wrapper can never see.
 * @module
 */

import { VPS_PROXY, SEALED_KEY } from "./feed.js";
import { seal, openResponse, b64u, unb64u } from "./sealed.js";
import { authWall } from "./authwall.js";

const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };

/**
 * Build the /feed/frame GET URL an element can load, with the destination sealed into `?s=`.
 * @param url the target page or media URL
 * @param ref optional referer the proxy should present
 * @returns the proxy URL string
 */
export async function sealedFrameUrl(url, ref) {
  const { wire } = await seal(SEALED_KEY, { p: "/feed/frame", u: url, r: ref || null });
  return `${VPS_PROXY}/frame?s=${b64u(wire)}`;
}


/**
 * Build the /feed/clip GET URL for the clip exporter, with the destination sealed into `?s=`.
 * @param url the source video URL
 * @param page optional page URL the video came from
 * @param format "gif" (default) or "mp4"
 * @returns the proxy URL string
 */
export async function sealedClipUrl(url, page, format) {
  const { wire } = await seal(SEALED_KEY, { p: "/feed/clip", u: url, g: page || null, f: format === "mp4" ? "mp4" : "gif" });
  return `${VPS_PROXY}/clip?s=${b64u(wire)}`;
}
const PLAIN = [
  `${VPS_PROXY}/frame`,                               
  
  
  `${VPS_PROXY}/clip`,
  
  
  
  
  `${VPS_PROXY}/apk`,
  
  
  
  `${VPS_PROXY}/chat/stream`,
];
const TUNNEL = `${VPS_PROXY}/f`;
const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "");
const innerPath = (url) => "/feed" + url.slice(VPS_PROXY.length);
/**
 * Replace globalThis.fetch with the sealing wrapper; anything off VPS_PROXY and the PLAIN routes pass through untouched.
 * @param realFetch the underlying fetch to wrap (default: the global one)
 * @returns an uninstall function that restores `realFetch`
 */
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

    const sid = sidNow();
    const { wire, resKey } = await seal(SEALED_KEY, { p: innerPath(url), m: method, b: body, ...(sid ? { s: sid } : {}) });
    
    const r = await realFetch(TUNNEL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: wire,
      signal: init.signal,
    });
    
    
    if (!r.ok) throw new Error(`sealed transport ${r.status}`);

    const out = await openResponse(resKey, new Uint8Array(await r.arrayBuffer()));
    const payload = out.enc === "b64" ? unb64u(out.body) : out.body;
    
    if (out.s === 401 && typeof payload === "string" && payload.includes('"sign in"')) authWall.set(authWall.get() + 1);
    return new Response(out.s === 204 || out.s === 304 ? null : payload, {
      status: out.s,
      headers: out.ct ? { "content-type": out.ct } : {},
    });
  };
  globalThis.fetch = patched;
  return () => { globalThis.fetch = realFetch; };      
}