/* @ts-self-types="./qrcode.d.ts" */
/**
 * # runtime/qrcode.js — a URL on the screen, readable by a phone
 *
 * The thin, unit-tested surface over the vendored QR codec (`./qrgen.vendor.js`). It powers the desktop
 * "open on phone" self-QR that every app's app bar carries: encode a URL, get a boolean module matrix, an
 * SVG string, or a data-URI for an `<img src>`. Byte mode, auto-version (typeNumber 0), ECC "M" (15 %
 * recovery) by default — the right trade for a phone camera reading a screen. The codec is a leaf the
 * runtime loads on demand, so no app pays for it until someone opens the modal.
 *
 * ![The qrcode module map: text through the vendored codec into a matrix, an SVG and a data URI](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-qrcode.svg)
 *
 * ## Import
 * ```js
 * import { qrDataUri, qrSvg, qrMatrix } from "/_rt/qrcode.js";                    // an app's page: the import map resolves /_rt/
 * import { qrDataUri, qrSvg, qrMatrix } from "@microspec/core/runtime/qrcode.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link qrMatrix} — `qrMatrix(text, ecc = "M")`: `boolean[][]` (rows × cols, `true` = a dark module); throws when the text exceeds every QR version.
 * - {@link qrSvg} — `qrSvg(text, { ecc, margin = 4, dark, light })`: one `<path>` of dark modules over a light field with a quiet zone, `shape-rendering="crispEdges"`.
 * - {@link qrDataUri} — `qrDataUri(text, opts)`: the same SVG as a `data:image/svg+xml,` URI, ready for `<img src>`.
 *
 * ## In practice
 * ```js
 * import { qrDataUri } from "/_rt/qrcode.js";
 *
 * // A join link for the room, shown as a QR inside a Sheet; the URL text sits under it as the fallback.
 * html`<${Sheet} id="wall-qr" open=${screen === "qr"} onClose=${closeScreen} title=${T(t, "joinTitle")} icon="lucide:qr-code">
 *   ${url
 *     ? html`<img data-qrimg src=${qrDataUri(url, { margin: 3 })} alt=${T(t, "joinTitle")}
 *              class="w-56 h-56 max-w-full rounded-[var(--ms-r-in)] bg-white p-3" />
 *            <code class="block w-full text-center break-all font-mono">${url}</code>`
 *     : html`<span class="text-base-content/70">${T(t, "noWifi")}</span>`}
 * </${Sheet}>`;                                                                       // wall
 * ```
 *
 * ## How it fits
 * Imports only the vendored codec, `./qrgen.vendor.js`. `render.js` lazy-imports this file the moment the
 * desktop "open on phone" modal opens (`QrModal`, `qrDataUri(location.href, { margin: 3 })`), so every farm
 * app reaches it on a desktop and none of them ships it in the eager bootstrap; the headless mobile gate
 * never opens the modal and never loads it. One farm app imports it directly — wall, for its join-the-room
 * QR. Unit tests: `packages/runtime/tests/qrcode_test.js`.
 *
 * ## Invariants and pitfalls
 * - `qrMatrix` throws only when the text is too long for any QR version. The page URL always fits; a caller that
 *   encodes arbitrary text must guard.
 * - Keep the quiet zone: `margin` is in modules and a QR with no quiet zone often will not scan. The default is
 *   4; the runtime's own modal uses 3 inside a white padded box.
 * - The SVG is `aria-hidden`; put the human-readable URL beside the image, as `QrModal` and wall both do.
 * - `crispEdges` keeps the modules hard at any render size — size the `<img>` with CSS, never re-rasterise.
 * - Unknown `ecc` values fall back to "M".
 * - Load it lazily from app code that shows a QR only on demand; a static import puts the codec in the app's
 *   first paint for a feature most sessions never open.
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
