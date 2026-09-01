/* @ts-self-types="./tile.d.ts" */
/**
 * # runtime/tile.js — a card is never image-less
 *
 * Deterministic first-letter placeholder art. Its one export, `letterTile`, renders the first character of
 * a title on a solid HSL ground as a self-contained `data:image/svg+xml` string — no fetch, so the "cards
 * always have a thumbnail" gate stays honest with the network unplugged and a fixture feed looks like a
 * feed. The hue is a stable hash of the text, so the same title always gets the same tile across reloads,
 * apps and screenshots. It was hand-rolled near-identically in cinema, books and wiki before it was
 * extracted here: three copies of one function is three places for a colour to drift.
 *
 * ![The tile map: a title flowing into first-letter extraction and the hue hash, composed onto an SVG rect and text, encoded as a data URI](https://cdn.jsdelivr.net/gh/damanoreshkan-beep/microspec@main/docs/art/module-tile.svg)
 *
 * ## Import
 * ```js
 * import { letterTile } from "/_rt/tile.js";                    // an app's page: the import map resolves /_rt/
 * import { letterTile } from "@microspec/core/runtime/tile.js";  // a product rt/ module or a Deno test
 * ```
 *
 * ## What it exports
 * - {@link letterTile} — `letterTile(text, { w = 300, h = 450, sat = 30, light = 24, fontSize, hue } = {})` → a
 *   `data:image/svg+xml,…` string usable directly as an image `src`; `fontSize` defaults to half the shorter side, `hue`
 *   (0–359) to a hash of `text`.
 *
 * ## In practice
 * ```js
 * // cinema — data.js: the gate fixture's posters are tiles, so a card is never image-less when archive is unreachable
 * import { letterTile } from "/_rt/tile.js";
 * const poster = (t, hue) => letterTile(t, { hue, sat: 34, light: 22 });
 * const FIXTURE = [
 *   { id: "Nosferatu", title: "Nosferatu", year: "1922", lang: "de", era: "silent" },
 *   { id: "Zvenyhora", title: "Zvenyhora", year: "1928", lang: "uk", era: "silent" },
 * ].map((f, i) => ({ ...f, thumb: poster(f.title, (i * 47) % 360) }));   // a spread of hues, pinned per row
 *
 * // books — data.js: the default proportions
 * const bcover = (t, hue) => letterTile(t, { hue, sat: 30, light: 24 });
 * ```
 *
 * ## How it fits
 * Imports nothing and no runtime module imports it — it is a leaf an app's `data.js` or `view.js` reaches
 * directly. 7 farm apps import it: arc, books, cinema, nova, persona, reel and wiki — the card families whose
 * real thumbnail lives on a host the gate never calls.
 *
 * ## Invariants and pitfalls
 * - Self-contained by design: the output is a data URI, never a URL — it must not fetch, or the thumbnail gate would be
 *   proving the network rather than the app.
 * - Deterministic: the hue is `(hue * 31 + charCode) % 360` over the whole string, so equal titles hash equal, and the tile
 *   survives a reload and a screenshot unchanged. Pass `hue` only to pin a specific colour.
 * - Empty or blank text draws `?`; the shown character is the first non-blank one, upper-cased.
 * - The SVG is `encodeURIComponent`-encoded, not base64 — fine for `src`, and small enough to sit inline in a fixture list.
 * - Default proportions are a 300×450 poster (2:3); pass `w`/`h` for a square avatar or a wide card, and `fontSize` if half
 *   the shorter side is not the weight you want.
 * @module
 */
// letterTile — a deterministic first-letter placeholder as a self-contained data-URI SVG (no fetch, so the
// "cards always have a thumbnail" gate stays honest offline). Was near-identically hand-rolled in cinema,
// books and wiki; extracted here. hue defaults to a stable hash of the text; sat/light/size are overridable.
/**
 * Build a data-URI SVG tile showing the first letter of `text` on a solid HSL ground.
 * @param text the title to tile; its first non-blank character is shown upper-cased ("?" when empty)
 * @param opts optional `w`/`h` in px (300×450), `sat`/`light` in percent (30/24), `fontSize` (half the
 *             shorter side) and `hue` (0–359; defaults to a stable hash of `text`)
 * @returns a `data:image/svg+xml,…` string usable directly as an image src
 */
export function letterTile(text, { w = 300, h = 450, sat = 30, light = 24, fontSize, hue } = {}) {
  const s = String(text || "");
  const ch = (s.trim()[0] || "?").toUpperCase();
  if (hue == null) { hue = 0; for (const c of s) hue = (hue * 31 + c.charCodeAt(0)) % 360; }
  const fs = fontSize ?? Math.round(Math.min(w, h) * 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${hue} ${sat}% ${light}%)"/><text x="50%" y="52%" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="rgba(255,255,255,.92)">${ch}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
