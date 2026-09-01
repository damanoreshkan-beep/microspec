/* @ts-self-types="./qrcode.d.ts" */
/**
 * QR encoder wrapper — the thin, unit-tested surface over the vendored codec, powering the desktop
 * "open on phone" self-QR. Exports `qrMatrix` (a boolean module grid), `qrSvg` and `qrDataUri`.
 * @module
 */
// QR encoder wrapper — the thin, unit-tested surface over the vendored codec (./qrgen.vendor.js). Powers the
// desktop "open on phone" self-QR: encode a URL, get a boolean module matrix, an SVG, or a data-URI. Byte
// mode, auto-version (typeNumber 0). ECC "M" (15% recovery) is a good default for a phone reading a screen.
import qrgen from "./qrgen.vendor.js";

const LEVELS = { L: "L", M: "M", Q: "Q", H: "H" };

// text → boolean[][] (rows × cols, true = a dark module). Throws only if the text is too long for any QR
// version — the page URL always fits, and callers that take arbitrary text should guard.
/**
 * Encode text into a boolean module matrix (rows × cols, true = a dark module); throws when the text exceeds every QR version.
 * @param text the text to encode, byte mode
 * @param ecc error-correction level "L" | "M" | "Q" | "H" (default "M")
 * @returns the module matrix as boolean[][]
 */
export function qrMatrix(text, ecc = "M") {
  const qr = qrgen(0, LEVELS[ecc] || "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const row = new Array(n); for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c); m.push(row); }
  return m;
}

// One <path> of every dark module over a white field with the mandatory quiet zone (≥4 modules — a QR with
// no quiet zone often will not scan). crispEdges keeps the modules hard at any render size.
/**
 * Render the QR for `text` as an SVG string: one path of dark modules over a light field with a quiet zone.
 * @param text the text to encode
 * @param opts `ecc`, `margin` (quiet zone in modules), `dark` and `light` colours
 * @returns the SVG markup
 */
export function qrSvg(text, { ecc = "M", margin = 4, dark = "#0A0A0B", light = "#FFFFFF" } = {}) {
  const m = qrMatrix(text, ecc), n = m.length, size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

/**
 * The QR SVG as a `data:image/svg+xml` URI, ready for an <img src>.
 * @param text the text to encode
 * @param opts the same options as qrSvg
 * @returns the data URI string
 */
export const qrDataUri = (text, opts) => "data:image/svg+xml," + encodeURIComponent(qrSvg(text, opts));
