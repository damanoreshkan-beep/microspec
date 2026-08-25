
const enc = new TextEncoder();
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

export const NONCE_LEN = 12;         
export const PBKDF2_ITERS = 150_000; 

export async function deriveKey(passphrase, room = "") {
  const s = subtle();
  if (!s) throw new Error("WebCrypto unavailable");
  const base = await s.importKey("raw", enc.encode(String(passphrase ?? "")), "PBKDF2", false, ["deriveKey"]);
  const salt = enc.encode("meshchat/1:" + String(room ?? ""));
  return s.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key, plaintext) {
  const s = subtle();
  if (!s) throw new Error("WebCrypto unavailable");
  const pt = plaintext instanceof Uint8Array ? plaintext : enc.encode(String(plaintext ?? ""));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const ct = new Uint8Array(await s.encrypt({ name: "AES-GCM", iv: nonce }, key, pt));
  const box = new Uint8Array(NONCE_LEN + ct.length);
  box.set(nonce, 0); box.set(ct, NONCE_LEN);
  return box;
}

export async function open(key, box) {
  const s = subtle();
  if (!s || !box || box.length <= NONCE_LEN) return null;
  const b = box instanceof Uint8Array ? box : new Uint8Array(box);
  const nonce = b.subarray(0, NONCE_LEN), ct = b.subarray(NONCE_LEN);
  try { return new Uint8Array(await s.decrypt({ name: "AES-GCM", iv: nonce }, key, ct)); }
  catch { return null; }
}

export async function fingerprint(passphrase, room = "") {
  const s = subtle();
  if (!s) return "";
  try {
    const base = await s.importKey("raw", enc.encode(String(passphrase ?? "")), "PBKDF2", false, ["deriveBits"]);
    const bits = await s.deriveBits(
      { name: "PBKDF2", salt: enc.encode("meshchat-fp/1:" + String(room ?? "")), iterations: 20_000, hash: "SHA-256" },
      base, 48,
    );
    return Array.from(new Uint8Array(bits), (x) => x.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}
