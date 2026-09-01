/**
 * # runtime/sealed.js — the envelope: one file, both ends, bare WebCrypto
 *
 * HPKE base mode (RFC 9180) hand-rolled on WebCrypto: DHKEM(P-256, HKDF-SHA256) / HKDF-SHA256 /
 * AES-256-GCM. Zero dependencies, no authorization anywhere — the server is authenticated to the client by
 * a pinned public key, the client stays anonymous. This exact file runs on BOTH sides: the browser imports it,
 * and the Deno backend imports a verbatim copy whose hash is asserted in its tests; WebCrypto is the same API
 * in both, which is the whole reason the port went to Deno. P-256 rather than X25519, deliberately: X25519
 * only reached WebCrypto in Chromium 133/137 (2025) and Samsung Internet trails Chromium by several releases,
 * whereas ECDH P-256 has shipped since Chromium 44. The difference costs about 1 ms per request. What it buys
 * the farm: the payload — and the route, which rides inside the envelope — is gone from anything that merely
 * inspects TLS (a corporate middlebox, "HTTPS scanning" antivirus, mitmproxy on the device) and from the
 * server's own nginx logs and any future CDN.
 *
 * ![The sealed module map: client seal and openResponse, server unseal and sealResponse, one shared secret split into two keys](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-sealed.svg)
 *
 * ## Import
 * ```js
 * import { seal, openResponse, b64u, unb64u } from "/_rt/sealed.js";                              // an app's page: the import map resolves /_rt/
 * import { importServerPrivate, unseal, sealResponse } from "@microspec/core/runtime/sealed.js";  // the Deno backend or a Deno test
 * ```
 *
 * ## What it exports
 * **Client**
 * - {@link seal} — `seal(serverKeyB64u, payload)` → `{ wire, resKey }`: a fresh ephemeral P-256 keypair per request; `ts: Date.now()` is added to the payload.
 * - {@link openResponse} — `openResponse(resKey, wire)`: decrypt the reply with the key `seal` returned.
 *
 * **Server**
 * - {@link importServerPrivate} — `importServerPrivate(jwk)`: the long-term private key as a CryptoKey for `deriveBits`.
 * - {@link unseal} — `unseal(privKey, serverPubB64u, wire)` → `{ payload, resKey }`: open the request and derive the key the reply must be sealed with.
 * - {@link sealResponse} — `sealResponse(resKey, payload)`: the reply envelope bytes.
 *
 * **Shared**
 * - {@link importServerKey} — `importServerKey(rawB64u)`: the pinned raw P-256 public key as an ECDH peer.
 * - {@link b64u} / {@link unb64u} — unpadded base64url encode / decode.
 *
 * ## In practice
 * ```js
 * import { seal, openResponse, b64u } from "/_rt/sealed.js";
 *
 * // Client (sealedfetch.js): the real request — route, method, body — is the payload; the wire is what POSTs.
 * const { wire, resKey } = await seal(SEALED_KEY, { p: innerPath(url), m: method, b: body, ...(sid ? { s: sid } : {}) });
 * const r = await fetch(VPS_PROXY + "/f", { method: "POST", body: wire });
 * const out = await openResponse(resKey, new Uint8Array(await r.arrayBuffer()));
 *
 * // A destination an ELEMENT loads (iframe, video) rides the same envelope as an opaque query string.
 * const { wire: w2 } = await seal(SEALED_KEY, { p: "/feed/frame", u: url, r: ref || null });
 * const src = `${VPS_PROXY}/frame?s=${b64u(w2)}`;
 *
 * // Server (illustrative — the backend imports a verbatim copy of this file):
 * const priv = await importServerPrivate(SERVER_JWK);
 * const { payload, resKey: k } = await unseal(priv, SERVER_PUB_B64U, new Uint8Array(await req.arrayBuffer()));
 * return new Response(await sealResponse(k, await route(payload)));
 * ```
 *
 * ## How it fits
 * Imports nothing — that is the contract: bare WebCrypto and two text codecs. `sealedfetch.js` is its one
 * importer in the runtime (`seal`, `openResponse`, `b64u`, `unb64u`) and `index.js` installs that wrapper
 * before any app code runs, so all 74 farm apps send every call to the proxy through this file without
 * naming it; the pinned key and proxy origin come from `feed.js` (`SEALED_KEY`, `VPS_PROXY`). The server half
 * is used by the Deno backend, not by anything in the farm. The threat model is written up in
 * `docs/research/e2e-envelope-and-transport.md`.
 *
 * ## Invariants and pitfalls
 * - Two independent keys from one shared secret — `req` and `res`, HKDF info `microspec/v1/req` and
 *   `microspec/v1/res` — never one key for both directions. `openResponse` needs the `resKey` from the SAME
 *   `seal` call.
 * - The HKDF salt is the ephemeral public key followed by the server public key, so `unseal` must be handed the
 *   same raw server key the client pinned; a rotated key breaks every envelope in flight.
 * - Wire layout is fixed: request = `1` (version) · 65 bytes ephemeral point · 12 bytes IV · ciphertext;
 *   reply = `1` · 12 bytes IV · ciphertext. Both `openResponse` and `unseal` throw `bad version` on anything else.
 * - GCM preserves length, so the plaintext is framed with a 4-byte length prefix and padded to a 256-byte
 *   boundary; padding is stripped by the prefix, not by scanning, so a payload ending in zeros is safe. A bad
 *   prefix throws `bad frame length`.
 * - A fresh ephemeral keypair and IV per request; nothing here is reusable across calls except the imported
 *   server key.
 * - Honest limit: an attacker who can rewrite the delivered JavaScript simply swaps the pinned key. This raises
 *   the cost from "read the traffic" to "tamper with the app"; it is not immunity, and nothing served over the
 *   web can beat that.
 * - Never fetch the pinned key over the channel it defends — `SEALED_KEY` is pinned in source (feed.js).
 * @module
 */
// GENERATED by tools/dts.mjs from packages/runtime/sealed.js — edit the JSDoc there, never this file.
/**
 * Client side: seal a request payload to the server's pinned key under a fresh ephemeral keypair.
 * @param serverKeyB64u the server's raw P-256 public key, base64url
 * @param payload the real request, e.g. {p: "/feed/ai", m: "POST", b: {...}}; a `ts` is added
 * @returns `{ wire, resKey }` — the envelope bytes and the AES-GCM key that opens the reply
 */
export function seal(serverKeyB64u: any, payload: any): Promise<{
    wire: Uint8Array;
    resKey: any;
}>;
/**
 * Client side: decrypt a sealed reply with the response key that seal() returned.
 * @param resKey the response key from seal()
 * @param wire the reply envelope bytes
 * @returns the decoded reply payload
 */
export function openResponse(resKey: any, wire: any): Promise<any>;
/**
 * Server side: open a client envelope and derive the key the reply must be sealed with.
 * @param privKey the server private key (see importServerPrivate)
 * @param serverPubB64u the server's raw public key, base64url — part of the HKDF salt
 * @param wire the request envelope bytes
 * @returns `{ payload, resKey }` — the decoded request and the reply key
 */
export function unseal(privKey: any, serverPubB64u: any, wire: any): Promise<{
    payload: any;
    resKey: any;
}>;
/**
 * Server side: seal a reply payload with the response key from unseal().
 * @param resKey the response key
 * @param payload the reply object
 * @returns the reply envelope bytes
 */
export function sealResponse(resKey: any, payload: any): Promise<Uint8Array>;
/**
 * Encode bytes as unpadded base64url.
 * @param bytes an ArrayBuffer or typed array
 * @returns the base64url string
 */
export function b64u(bytes: any): any;
/**
 * Decode an unpadded base64url string to bytes.
 * @param s the base64url string
 * @returns a Uint8Array
 */
export function unb64u(s: any): Uint8Array;
/**
 * Import the server's pinned P-256 public key from its raw base64url form.
 * @param rawB64u the raw uncompressed-point public key, base64url
 * @returns a CryptoKey usable as the ECDH peer
 */
export function importServerKey(rawB64u: any): any;
/**
 * Server side: import the server's P-256 private key from a JWK.
 * @param jwk the private key as a JWK object
 * @returns a CryptoKey usable for deriveBits
 */
export function importServerPrivate(jwk: any): any;
