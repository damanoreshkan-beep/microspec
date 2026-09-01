/* @ts-self-types="./tile.d.ts" */
/**
 * Deterministic first-letter placeholder art. Exports `letterTile`, which renders a self-contained data-URI
 * SVG (no fetch, so the "cards always have a thumbnail" gate stays honest offline) with a hue hashed from the
 * text, so the same title always gets the same tile. Extracted from near-identical copies in cinema, books
 * and wiki.
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
