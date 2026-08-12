
import { parseAd, adSummary, smooth } from "./radar.js";

/** The SIG's internal / interoperability-test space. The shell fixes it so a page cannot wear a vendor id. */
export const COMPANY = 0xffff;

export const MAGIC = 0xe1;

export const HEADER = 5;        
export const MAX_PAYLOAD = 27;
export const MAX_TEXT = MAX_PAYLOAD - HEADER;   

export const VOICE_TTL_MS = 180_000;

const enc = new TextEncoder();

/**
 * Trim to what fits, on a CODE POINT boundary.
 *
 * Slicing to a byte count would cut a Cyrillic character in half, and a half sequence does not decode one
 * character shorter — it decodes to a replacement diamond, or with fatal:true drops the whole message.
 * `for…of` iterates code points, so surrogate pairs survive too.
 */
export function fitText(text, max = MAX_TEXT) {
  const s = typeof text === "string" ? text : "";
  const full = enc.encode(s);
  if (full.length <= max) return { text: s, bytes: full.length, left: max - full.length, over: 0 };
  let out = "", n = 0;
  for (const ch of s) {
    const w = enc.encode(ch).length;
    if (n + w > max) break;
    out += ch; n += w;
  }
  return { text: out, bytes: n, left: max - n, over: [...s].length - [...out].length };
}

/** null for an empty throw — silence is not a message, and an empty payload is a legal AD nobody can read. */
export function encodeVoice({ sender, seq, text } = {}) {
  const fit = fitText(text);
  if (!fit.bytes) return null;
  const out = new Uint8Array(HEADER + fit.bytes);
  out[0] = MAGIC;
  out[1] = (sender >>> 16) & 0xff;
  out[2] = (sender >>> 8) & 0xff;
  out[3] = sender & 0xff;
  out[4] = seq & 0xff;
  out.set(enc.encode(fit.text), HEADER);
  return out;
}

/**
 * fatal:true is load-bearing, not tidiness. Another protocol's payload can begin with our magic by
 * coincidence; refusing to decode invalid UTF-8 is what stops that noise being rendered as a voice.
 */
export function decodeVoice(bytes) {
  if (!bytes || bytes.length <= HEADER || bytes[0] !== MAGIC) return null;
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(HEADER)); }
  catch { return null; }
  if (!text) return null;
  return { sender: (bytes[1] << 16) | (bytes[2] << 8) | bytes[3], seq: bytes[4], text };
}

/** One ble.scan frame → a voice, or null if it is not one of ours. */
export function readFrame(frame) {
  if (!frame || typeof frame.raw !== "string" || !frame.raw) return null;
  const mfg = adSummary(parseAd(frame.raw)).mfg[COMPANY];
  if (!mfg) return null;
  const v = decodeVoice(mfg);
  if (!v) return null;
  return { ...v, rssi: Number.isFinite(frame.rssi) ? frame.rssi : null, at: frame.at };
}

export const hexOf = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A sender id is 3 random bytes chosen at install, because the MAC cannot be one: Android rotates the
 * advertising address every 7-15 minutes and getOwnAddress is privileged, so a message keyed on the
 * address splits into strangers mid-conversation. 24 bits is ample for "phones within 30 metres".
 */
export const newSender = (rand = Math.random) => Math.floor(rand() * 0x1000000) & 0xffffff;

/** Golden-angle hue: consecutive ids land far apart, so two speakers are rarely the same colour. */
export const hueOf = (sender) => Math.round(((sender >>> 0) * 137.508) % 360);

const CONS = "bdfgklmnprstvz";
const VOW = "aeiou";

export function callsign(sender) {
  let n = (sender >>> 0);
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += CONS[n % CONS.length]; n = Math.floor(n / CONS.length);
    out += VOW[n % VOW.length]; n = Math.floor(n / VOW.length);
  }
  return out;
}

/**
 * Fold sightings into the voices on screen.
 *
 * Keyed on (sender, seq) and NEVER on the address: one throw is re-advertised every 100 ms for as long as
 * the speaker holds it, and its address rotates underneath. Without the dedup the screen would fill with
 * hundreds of copies of one sentence; keyed on the address instead, one voice would become several.
 *
 * RSSI is smoothed rather than replaced — a stationary BLE trace wanders 5-15 dB on its own, so a raw
 * value would make every voice pulse in size while nobody moved.
 */
export function mergeVoices(voices, sightings, now, ttlMs = VOICE_TTL_MS) {
  const by = new Map();
  for (const v of Array.isArray(voices) ? voices : []) by.set(`${v.sender}:${v.seq}`, { ...v });
  for (const s of Array.isArray(sightings) ? sightings : []) {
    if (!s || typeof s.text !== "string") continue;
    const key = `${s.sender}:${s.seq}`;
    const prev = by.get(key);
    if (prev) {
      by.set(key, {
        ...prev,
        text: s.text,
        rssi: Number.isFinite(s.rssi) ? smooth(prev.rssi, s.rssi, now - (prev.last ?? now)) : prev.rssi,
        last: now,
        heard: (prev.heard || 1) + 1,
      });
    } else {
      by.set(key, { sender: s.sender, seq: s.seq, text: s.text, rssi: s.rssi ?? null, first: now, last: now, heard: 1 });
    }
  }
  return [...by.values()].filter((v) => now - v.last <= ttlMs);
}
