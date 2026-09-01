/* @ts-self-types="./sealed.d.ts" */
/**
 * The sealed envelope: HPKE base mode (RFC 9180) on bare WebCrypto — DHKEM(P-256, HKDF-SHA256) /
 * HKDF-SHA256 / AES-256-GCM — the same file running in the browser and the Deno backend. Exports the
 * client side (`seal`, `openResponse`), the server side (`importServerPrivate`, `unseal`, `sealResponse`),
 * `importServerKey` and the base64url helpers `b64u` / `unb64u`.
 * @module
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const P256 = { name: "ECDH", namedCurve: "P-256" };

/**
 * Encode bytes as unpadded base64url.
 * @param bytes an ArrayBuffer or typed array
 * @returns the base64url string
 */
export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/**
 * Decode an unpadded base64url string to bytes.
 * @param s the base64url string
 * @returns a Uint8Array
 */
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * Import the server's pinned P-256 public key from its raw base64url form.
 * @param rawB64u the raw uncompressed-point public key, base64url
 * @returns a CryptoKey usable as the ECDH peer
 */
export const importServerKey = (rawB64u) => crypto.subtle.importKey("raw", unb64u(rawB64u), P256, false, []);

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

/**
 * Client side: seal a request payload to the server's pinned key under a fresh ephemeral keypair.
 * @param serverKeyB64u the server's raw P-256 public key, base64url
 * @param payload the real request, e.g. {p: "/feed/ai", m: "POST", b: {...}}; a `ts` is added
 * @returns `{ wire, resKey }` — the envelope bytes and the AES-GCM key that opens the reply
 */
export async function seal(serverKeyB64u, payload) {
  const serverKey = await importServerKey(serverKeyB64u);
  const eph = await crypto.subtle.generateKey(P256, false, ["deriveBits"]);   
  const epkRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const serverRaw = unb64u(serverKeyB64u);
  const { req, res } = await deriveKeys(eph.privateKey, serverKey, epkRaw, serverRaw);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, req, frame({ ...payload, ts: Date.now() })));
  const wire = new Uint8Array(1 + 65 + 12 + ct.length);
  wire[0] = 1;                                   
  wire.set(epkRaw, 1); wire.set(iv, 66); wire.set(ct, 78);
  return { wire, resKey: res };
}

/**
 * Client side: decrypt a sealed reply with the response key that seal() returned.
 * @param resKey the response key from seal()
 * @param wire the reply envelope bytes
 * @returns the decoded reply payload
 */
export async function openResponse(resKey, wire) {
  if (wire[0] !== 1) throw new Error("bad version");
  const iv = wire.subarray(1, 13);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, resKey, wire.subarray(13)));
  return unframe(pt);
}

/**
 * Server side: import the server's P-256 private key from a JWK.
 * @param jwk the private key as a JWK object
 * @returns a CryptoKey usable for deriveBits
 */
export const importServerPrivate = (jwk) => crypto.subtle.importKey("jwk", jwk, P256, false, ["deriveBits"]);

/**
 * Server side: open a client envelope and derive the key the reply must be sealed with.
 * @param privKey the server private key (see importServerPrivate)
 * @param serverPubB64u the server's raw public key, base64url — part of the HKDF salt
 * @param wire the request envelope bytes
 * @returns `{ payload, resKey }` — the decoded request and the reply key
 */
export async function unseal(privKey, serverPubB64u, wire) {
  if (wire[0] !== 1) throw new Error("bad version");
  const epkRaw = wire.subarray(1, 66);
  const epk = await crypto.subtle.importKey("raw", epkRaw, P256, false, []);
  const { req, res } = await deriveKeys(privKey, epk, epkRaw, unb64u(serverPubB64u));
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: wire.subarray(66, 78) }, req, wire.subarray(78)));
  return { payload: unframe(pt), resKey: res };
}

/**
 * Server side: seal a reply payload with the response key from unseal().
 * @param resKey the response key
 * @param payload the reply object
 * @returns the reply envelope bytes
 */
export async function sealResponse(resKey, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, resKey, frame(payload)));
  const wire = new Uint8Array(1 + 12 + ct.length);
  wire[0] = 1; wire.set(iv, 1); wire.set(ct, 13);
  return wire;
}
