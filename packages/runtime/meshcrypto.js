// microspec runtime — the encryption envelope for the off-grid chat (meshchat.js).
//
// The medium is a broadcast in the clear: anyone with the adapter hears every beacon. So a room is defined
// by a shared PASSPHRASE, not by its 16-bit roomId (which is only a cheap pre-filter and can collide). The
// passphrase derives an AES-256-GCM key; membership IS holding the key. A wrong key does not error — the
// message simply fails to open and is dropped, which is also how two rooms that happen to share a roomId stay
// separate.
//
// v1 is a single symmetric GROUP key (everyone in the room shares it). Per-pair X25519 is a later layer; the
// wire already carries a sender id, so a directed/encrypted-to-one message is an additive step, not a rewrite.
//
// This is the async half (WebCrypto SubtleCrypto), separate from meshchat.js's sync codec so that module
// stays pure. WebCrypto exists in both the browser and Deno, so the seal/open round-trip is unit-tested.

const enc = new TextEncoder();
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

export const NONCE_LEN = 12;         // AES-GCM standard nonce
export const PBKDF2_ITERS = 150_000; // one-time cost at room-join, not per message

// deriveKey(passphrase, room) -> CryptoKey (AES-GCM 256). Salt is derived from the room name so every peer
// with the same passphrase+room lands on the same key without exchanging a salt. The "meshchat/1" pepper
// namespaces the KDF so a passphrase reused elsewhere does not yield this app's key.
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

// seal(key, plaintextBytes) -> Uint8Array box = nonce(12) || ciphertext+tag. This box is what meshchat
// fragments and radiates (with FLAG_ENCRYPTED set). A fresh random nonce per message: never reuse one under a
// GCM key.
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

// open(key, box) -> Uint8Array | null. Null on a wrong key, a tampered box, or a runt — the caller drops it.
// Never throws on bad input, because it is fed attacker-influenced bytes off the air.
export async function open(key, box) {
  const s = subtle();
  if (!s || !box || box.length <= NONCE_LEN) return null;
  const b = box instanceof Uint8Array ? box : new Uint8Array(box);
  const nonce = b.subarray(0, NONCE_LEN), ct = b.subarray(NONCE_LEN);
  try { return new Uint8Array(await s.decrypt({ name: "AES-GCM", iv: nonce }, key, ct)); }
  catch { return null; }
}

// fingerprint(passphrase, room) -> short hex, for the UI to show two people they are on the same room without
// revealing the key. It is a SEPARATE KDF output (different salt namespace than deriveKey), so the encryption
// key never has to be made extractable and the shown bytes are not a shortcut to it. Deterministic across
// peers, so both see the same code. A visual check, not a security boundary — that is the AES-GCM key.
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
