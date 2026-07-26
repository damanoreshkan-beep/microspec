// microspec runtime — V2 Player: the archive's parsing + the size maths (SYSTEMIC, pure, unit-tested).
//
// The store reads a LIVE public archive: modland's V2 tree, which is nginx directory listings (there is no
// JSON API for V2M anywhere). A listing carries exactly two facts — a filename and a BYTE SIZE — and that is
// the app's headline number, so nothing else is needed to render the store. Duration only exists once the
// synth has opened a tune (`v2m_duration_ms`), which is why the "×N smaller than MP3" line belongs to the
// player, not the store.
//
// Three mirrors serve the same tree with `Access-Control-Allow-Origin: *`, so the app fetches them directly
// (no proxy) and fails over between them.

export const MIRRORS = [
  "https://modland.com/pub/modules/V2/",
  "https://ftp.modland.com/pub/modules/V2/",
  "https://modland.ziphoid.com/pub/modules/V2/",
];

// 128 kbit/s — the reference the size story compares against. 1 s of MP3 = 16 000 bytes.
export const MP3_BPS = 16000;

const encPath = (s) => String(s).split("/").map(encodeURIComponent).join("/");

/** Author sub-directories of the V2 tree. Skips the sort links (`?C=N&O=A`) and the parent link. */
export function parseAuthors(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a href="([^"?][^"]*)\/"/g)) {
    const a = decodeURIComponent(m[1]);
    if (a !== ".." && a !== "." && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Tunes in one author's listing: `<a href="x.v2m" …>…</a> … <td class="size">  12345</td>`.
 * `size` is the byte COUNT. It is deliberately NOT called `bytes` — a track record's `bytes` is the audio
 * buffer, and the one time the two shared a name, `9216.slice()` threw into a swallowing catch and the
 * library silently never saved anything.
 */
export function parseListing(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a href="([^"]+\.v2mz?)"[^>]*>[\s\S]*?<td class="size">\s*([0-9]+)/g)) {
    out.push({ file: decodeURIComponent(m[1]), size: +m[2] });
  }
  return out;
}

/** A tune's display title — the filename without its extension. */
export function titleOf(file) {
  return String(file).replace(/\.v2mz?$/i, "");
}

/** Stable id for a tune across mirrors (library key + "already downloaded" lookup). */
export function trackId(author, file) {
  return "V2/" + author + "/" + file;
}

/** The tune's URL on a given mirror (0-based index, wraps — so a caller can just increment to fail over). */
export function trackURL(author, file, mirror = 0) {
  return MIRRORS[mirror % MIRRORS.length] + encPath(author) + "/" + encPath(file);
}

export function authorURL(author, mirror = 0) {
  return MIRRORS[mirror % MIRRORS.length] + encPath(author) + "/";
}

/** How many times smaller this tune is than the same music as a 128 kbit/s MP3. 0 when unknown. */
export function mp3Ratio(bytes, seconds) {
  if (!(bytes > 0) || !(seconds > 0)) return 0;
  return (seconds * MP3_BPS) / bytes;
}

/**
 * Playback gain. The V2 synth clips hard — measured over the archive, most tunes peak above 1.0 and one
 * reached 15.5 — so the player normalises by LOUDNESS (rms), never by peak alone: a tune whose peak is 15×
 * is usually loud throughout, and scaling it by 1/15 would make it inaudible. Whatever peak survives is the
 * limiter's job. Both readings come from the live analyser, so this stays honest without an offline pass.
 */
export const TARGET_RMS = 0.1;
export function normGain(rms, { min = 0.25, max = 2.5 } = {}) {
  if (!(rms > 0)) return 1;
  return Math.max(min, Math.min(max, TARGET_RMS / rms));
}

/**
 * The hero: the tune's OWN BYTES as a point cloud. Byte triples become spherical coordinates, so the number
 * of points IS the file size (one point per 3 bytes, sub-sampled by a stride above `max`) and a 9 KB tune is
 * visibly a sparser object than a 90 KB one. Returns interleaved xyz in a Float32Array, radius ≤ 1.
 */
export function byteCloud(bytes, max = 16384) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const triples = Math.floor(u8.length / 3);
  if (triples < 1) return new Float32Array(0);
  const stride = Math.max(1, Math.ceil(triples / max));
  const n = Math.floor((triples + stride - 1) / stride);
  const out = new Float32Array(n * 3);
  for (let k = 0, i = 0; k < n; k++, i += stride) {
    const o = i * 3;
    const theta = (u8[o] / 255) * Math.PI * 2;
    const phi = Math.acos(2 * (u8[o + 1] / 255) - 1);
    const r = 0.55 + 0.45 * (u8[o + 2] / 255);
    const s = Math.sin(phi);
    out[k * 3] = r * s * Math.cos(theta);
    out[k * 3 + 1] = r * Math.cos(phi);
    out[k * 3 + 2] = r * s * Math.sin(theta);
  }
  return out;
}

/** A deterministic stand-in cloud, so the hero is never an empty stage (headless gate, nothing loaded yet). */
export function seedBytes(n = 6144, seed = 0x5eed) {
  const u8 = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    u8[i] = (s >>> 16) & 0xff;
  }
  return u8;
}
