// microspec runtime — the sealed-tunnel interceptor.
//
// Every app already reaches the backend with a plain `fetch("https://…/feed/…")`. Rather than rewrite six
// call sites across dou / imagine / reel / retouch / ai.js — each with its own polling loop, blob handling and
// error path — this wraps `fetch` itself: a request to our proxy is re-expressed as one sealed envelope to
// POST /feed/f, and the reply is handed back as an ordinary Response with the original status, content-type
// and bytes. Callers cannot tell the difference; `r.ok`, `r.json()`, `r.text()` and `r.blob()` all behave.
//
// The point of doing it this way is blast radius. Nothing that works today changes shape, and turning the
// tunnel off is deleting one import — not unpicking an integration.
//
// WHAT IS DELIBERATELY NOT INTERCEPTED
//   • /feed/frame — that URL is an <iframe src>, i.e. browser navigation, not fetch. A POST envelope cannot
//     express it. It stays plaintext and it is the one route whose destination remains visible.
//   • anything not on VPS_PROXY — direct calls to CORS-friendly APIs are not ours to encrypt, and routing
//     them through our VPS would tell the server more, not less.
//
// HONEST LIMIT: the key below is pinned in a file delivered over the same TLS this defends. An attacker who
// can rewrite the delivered JavaScript swaps it and reads everything. This raises the cost from "read the
// traffic" to "tamper with the app"; it is not immunity. See docs/research/e2e-envelope-and-transport.md.

import { VPS_PROXY, SEALED_KEY } from "./feed.js";
import { seal, openResponse, unb64u } from "./sealed.js";

const PLAIN = [`${VPS_PROXY}/frame`];                 // iframe navigation — cannot be tunnelled
const TUNNEL = `${VPS_PROXY}/f`;

const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "");

// Turn an absolute proxy URL into the inner path the backend dispatches on: "https://host/feed/ai" → "/feed/ai".
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
      // Every current caller posts JSON. Anything else is passed through untouched rather than guessed at.
      if (typeof init.body !== "string") return realFetch(input, init);
      try { body = JSON.parse(init.body); } catch { return realFetch(input, init); }
    }

    const { wire, resKey } = await seal(SEALED_KEY, { p: innerPath(url), m: method, b: body });
    // text/plain keeps this CORS-safelisted, so there is no preflight OPTIONS on every call.
    const r = await realFetch(TUNNEL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: wire,
      signal: init.signal,
    });
    // A transport failure must NOT fall back to the plaintext route: a silent downgrade would hand a
    // middlebox everything back for the price of one injected error. Fail loudly instead.
    if (!r.ok) throw new Error(`sealed transport ${r.status}`);

    const out = await openResponse(resKey, new Uint8Array(await r.arrayBuffer()));
    const payload = out.enc === "b64" ? unb64u(out.body) : out.body;
    return new Response(out.s === 204 || out.s === 304 ? null : payload, {
      status: out.s,
      headers: out.ct ? { "content-type": out.ct } : {},
    });
  };
  globalThis.fetch = patched;
  return () => { globalThis.fetch = realFetch; };      // uninstall, for tests
}
