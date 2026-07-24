// microspec runtime — the sealed envelope. HPKE base mode (RFC 9180) hand-rolled on bare WebCrypto:
// DHKEM(P-256, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM. Zero dependencies, no authorization anywhere — the
// server is authenticated to the client by a pinned public key, the client stays anonymous.
//
// This exact file runs on BOTH sides: the browser imports it, and the Deno backend imports a verbatim copy
// whose hash is asserted in its tests. WebCrypto is the same API in both, which is the whole reason the port
// went to Deno.
//
// P-256 and not X25519, deliberately: X25519 only reached WebCrypto in Chromium 133/137 (2025) and Samsung
// Internet trails Chromium by several releases, whereas ECDH P-256 has shipped since Chromium 44 ≈ Samsung
// Internet 4. The difference costs ~1 ms per request.
//
// WHAT THIS DOES AND DOES NOT BUY. It removes the payload from anything that merely *inspects* TLS — a
// corporate middlebox, an antivirus doing "HTTPS scanning", mitmproxy on the device — and from the server's
// own nginx logs and any future CDN. It does NOT make a browser app immune to an attacker who can rewrite
// the delivered JavaScript, because that attacker simply swaps the pinned key below. Nothing served over the
// web can beat that; see docs/research/e2e-envelope-and-transport.md.

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const P256 = { name: "ECDH", namedCurve: "P-256" };

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const importServerKey = (rawB64u) => crypto.subtle.importKey("raw", unb64u(rawB64u), P256, false, []);

// Two independent keys from one shared secret — never one key for both directions.
async function deriveKeys(priv, pub, epkRaw, serverRaw) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const salt = new Uint8Array(epkRaw.length + serverRaw.length);
  salt.set(epkRaw, 0); salt.set(serverRaw, epkRaw.length);
  const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const one = (info) => crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: ENC.encode(info) },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
  return { req: await one("microspec/v1/req"), res: await one("microspec/v1/res") };
}

// GCM preserves length, so an observer still learns the payload SIZE. Round up to a 256-byte boundary; the
// padding is stripped by length prefix, not by scanning, so a plaintext ending in zeros is safe.
const PAD = 256;
function frame(obj) {
  const body = ENC.encode(JSON.stringify(obj));
  const total = Math.ceil((body.length + 4) / PAD) * PAD;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}
function unframe(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
  if (n > bytes.length - 4) throw new Error("bad frame length");
  return JSON.parse(DEC.decode(bytes.subarray(4, 4 + n)));
}

// ── client ────────────────────────────────────────────────────────────────────────────────────────────────
// Returns the wire bytes plus the response key, which the caller needs to open the reply.
// `payload` carries the real request — {p: "/feed/ai", m: "POST", b: {...}} — so the route itself is inside
// the envelope and never on the wire.
export async function seal(serverKeyB64u, payload) {
  const serverKey = await importServerKey(serverKeyB64u);
  const eph = await crypto.subtle.generateKey(P256, false, ["deriveBits"]);   // fresh per request
  const epkRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const serverRaw = unb64u(serverKeyB64u);
  const { req, res } = await deriveKeys(eph.privateKey, serverKey, epkRaw, serverRaw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, req, frame({ ...payload, ts: Date.now() })));
  const wire = new Uint8Array(1 + 65 + 12 + ct.length);
  wire[0] = 1;                                   // version
  wire.set(epkRaw, 1); wire.set(iv, 66); wire.set(ct, 78);
  return { wire, resKey: res };
}

export async function openResponse(resKey, wire) {
  if (wire[0] !== 1) throw new Error("bad version");
  const iv = wire.subarray(1, 13);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, resKey, wire.subarray(13)));
  return unframe(pt);
}

// ── server ────────────────────────────────────────────────────────────────────────────────────────────────
export const importServerPrivate = (jwk) => crypto.subtle.importKey("jwk", jwk, P256, false, ["deriveBits"]);

export async function unseal(privKey, serverPubB64u, wire) {
  if (wire[0] !== 1) throw new Error("bad version");
  const epkRaw = wire.subarray(1, 66);
  const epk = await crypto.subtle.importKey("raw", epkRaw, P256, false, []);
  const { req, res } = await deriveKeys(privKey, epk, epkRaw, unb64u(serverPubB64u));
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: wire.subarray(66, 78) }, req, wire.subarray(78)));
  return { payload: unframe(pt), resKey: res };
}

export async function sealResponse(resKey, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, resKey, frame(payload)));
  const wire = new Uint8Array(1 + 12 + ct.length);
  wire[0] = 1; wire.set(iv, 1); wire.set(ct, 13);
  return wire;
}
