/**
 * # runtime/sealedfetch.js — the sealed tunnel, installed by wrapping `fetch` instead of rewriting call sites
 *
 * Every app already reaches the backend with a plain `fetch("https://…/feed/…")`. Rather than rewrite six
 * call sites across dou / imagine / reel / retouch / ai.js — each with its own polling loop, blob handling
 * and error path — this wraps `fetch` itself: a request to our proxy is re-expressed as one sealed envelope
 * to POST /feed/f, and the reply is handed back as an ordinary Response with the original status,
 * content-type and bytes. Callers cannot tell the difference; `r.ok`, `r.json()`, `r.text()` and `r.blob()`
 * all behave. The point is blast radius: nothing that works today changes shape, and turning the tunnel
 * off is deleting one import — not unpicking an integration. The session rides INSIDE the envelope (field
 * `s`), read straight from where auth.js keeps it (`ms:gh:sid`), so this file needs no auth import.
 *
 * ![The sealed tunnel: a proxy fetch sealed into one envelope on POST /feed/f, the reply opened back into a Response; frame and clip URLs sealed into an opaque query](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sealedfetch.svg)
 *
 * ## Import
 * ```js
 * import { sealedFrameUrl, sealedClipUrl } from "/_rt/sealedfetch.js";                    // an app's page: the import map resolves /_rt/
 * import { installSealedFetch } from "@microspec/core/runtime/sealedfetch.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link installSealedFetch} — `installSealedFetch(realFetch = globalThis.fetch)` replaces `globalThis.fetch`
 *   with the sealing wrapper and returns an uninstall function that restores `realFetch` (for tests). Anything
 *   off VPS_PROXY, the tunnel itself and the PLAIN routes pass through untouched.
 * - {@link sealedFrameUrl} — `async (url, ref) → "${VPS_PROXY}/frame?s=<envelope>"`: a plain GET an ELEMENT
 *   can load (`<video src>`, `<iframe src>`), with the destination sealed into `?s=`. The reply is not sealed.
 * - {@link sealedClipUrl} — `async (url, page, format) → "${VPS_PROXY}/clip?s=<envelope>"` for the clip
 *   exporter; `format` is `"gif"` (default) or `"mp4"`. `fetch` it and read `.blob()`; the reply is not sealed.
 *
 * ## In practice
 * ```js
 * import { sealedFrameUrl, sealedClipUrl } from "/_rt/sealedfetch.js";               // apps/reel/view.js
 *
 * // A stream the player loads by element: the destination travels inside the envelope, the bytes on TLS.
 * settle({ url: await sealedFrameUrl(pick.url, page), type: pick.format === "hls" ? "hls" : "progressive" });
 *
 * // The clip export — tens of megabytes, so the reply stays plain and the status still means what it says.
 * const r = await fetch(await sealedClipUrl(url, item.page || null, format));
 * if (!r.ok) { const why = await r.json().catch(() => null); toast(why?.error || "export failed"); return; }
 * const blob = await r.blob();
 * ```
 * An app never calls `installSealedFetch` itself — the bootstrap (index.js) installs the wrapper before any
 * app code runs, so a plain `fetch(VPS_PROXY + "/ai", { method: "POST", body: JSON.stringify(…) })` is
 * already sealed.
 *
 * ## How it fits
 * Imports `VPS_PROXY` and `SEALED_KEY` from feed.js, `seal` / `openResponse` / `b64u` / `unb64u` from
 * sealed.js and `authWall` from authwall.js. index.js imports `installSealedFetch` and calls it once at
 * bootstrap, so every farm app reaches the tunnel without importing this file; one app imports it by name —
 * reel, for `sealedFrameUrl` and `sealedClipUrl`. Every generated sw.js precaches it.
 *
 * ## Invariants and pitfalls
 * - Only URLs starting with VPS_PROXY are sealed. Direct calls to CORS-friendly APIs are not ours to encrypt,
 *   and routing them through our VPS would tell the server more, not less.
 * - PLAIN routes bypass the envelope for a measured reason each: `/frame` is loaded by an element (navigation,
 *   not fetch); `/clip` replies are tens of megabytes and base64 inflates them by a third (24.4 MB GIF: 42.5 s
 *   sealed against 22.1 s plain, 2026-08-20); `/apk` carries a launcher-icon PNG that pushes the envelope past
 *   the tunnel's size ceiling (400 above ~3.5 KB); `/chat/stream` is text/event-stream and one envelope would
 *   buffer the whole answer — named to the sub-path so `/chats` stays sealed.
 * - Only a string JSON body is sealed. A non-string body, or a string that does not parse as JSON, passes
 *   through untouched rather than being guessed at.
 * - A transport failure must NOT fall back to the plaintext route — a silent downgrade would hand a middlebox
 *   everything back for the price of one injected error. The wrapper throws `sealed transport <status>`.
 * - The tunnel POST is `text/plain`, which keeps it CORS-safelisted: no preflight OPTIONS on every call.
 * - The edge's `401` with `"sign in"` in the body bumps `authWall`, so the runtime shows its sign-in wall; the
 *   app still receives its 401. A 204 or 304 comes back with a null body, as the platform requires.
 * - Honest limit: the key is pinned in a file delivered over the same TLS this defends. An attacker who can
 *   rewrite the delivered JavaScript swaps it and reads everything. This raises the cost from "read the
 *   traffic" to "tamper with the app"; it is not immunity (docs/research/e2e-envelope-and-transport.md).
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/sealedfetch.js — edit the JSDoc there, never this file.
/**
 * Build the /feed/frame GET URL an element can load, with the destination sealed into `?s=`.
 * @param url the target page or media URL
 * @param ref optional referer the proxy should present
 * @returns the proxy URL string
 */
export function sealedFrameUrl(url: any, ref: any): Promise<string>;
/**
 * Build the /feed/clip GET URL for the clip exporter, with the destination sealed into `?s=`.
 * @param url the source video URL
 * @param page optional page URL the video came from
 * @param format "gif" (default) or "mp4"
 * @returns the proxy URL string
 */
export function sealedClipUrl(url: any, page: any, format: any): Promise<string>;
/**
 * Replace globalThis.fetch with the sealing wrapper; anything off VPS_PROXY and the PLAIN routes pass through untouched.
 * @param realFetch the underlying fetch to wrap (default: the global one)
 * @returns an uninstall function that restores `realFetch`
 */
export function installSealedFetch(realFetch?: any): () => void;
