// Link-preview material for EVERY app, generated at build — the 1200×630 card (og.png) and the meta block
// (Open Graph + Twitter card + description + canonical) — so a farm URL pasted into Telegram / WhatsApp /
// Signal / Slack / X unfurls with the app's name, its one line and its brand, and no app author ever writes
// a preview by hand. Research + sources: docs/research/link-previews.md.
//
// Facts the shape rests on: preview bots read the RAW HTML (no JS), want an ABSOLUTE og:image that is
// JPEG/PNG/WebP (never SVG) at ~1200×630, and lay it out full-width only with twitter:card=summary_large_image.
// The card is drawn from what every app already has (brand.json, brand.svg, i18n/uk.json) by resvg — the
// same WASM renderer as the PWA icons — with Geist/Geist Mono fetched as TTF once per build.
import { Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { ensure } from "./icons.mjs";   // the one initWasm() for the process

export const SITE = "https://dreamstudio.mooo.com";
export const SITE_NAME = "DreamStudio";   // the product; "microspec" is the core technology's name (docs/research/luminous-icons.md)
export const OG_W = 1200, OG_H = 630;

let fontsP = null;
// Google Fonts hands out TTF (what resvg reads) to an OLD user-agent; the modern answer is woff2, which it cannot.
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Geist:wght@700&family=Geist+Mono:wght@500";
const fonts = () => (fontsP ||= (async () => {
  const css = await (await fetch(FONT_CSS, { headers: { "user-agent": "Mozilla/4.0" } })).text();
  const urls = [...css.matchAll(/url\(([^)]+\.ttf)\)/g)].map((m) => m[1]);
  if (urls.length < 2) throw new Error("og: Google Fonts did not return TTF faces for Geist + Geist Mono");
  return Promise.all(urls.map(async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer())));
})());

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Wrap a line by words to a character budget — resvg has no text wrapping; two lines is the card's ceiling.
function wrap(text, perLine, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  return lines;
}

/** Render the card: brand tile with the glyph on the left, name / site / tagline on the right. */
export async function renderOgCard({ brand, paths, title, tagline }) {
  await ensure();
  const fb = await fonts();
  // The title must FIT the 612px column: Geist Bold runs ~0.6em per glyph (Cyrillic a touch wider), so the
  // size follows the length — 88px for a short name, down to whatever a long one needs, never clipped.
  const titleSize = Math.max(40, Math.min(88, Math.floor(612 / (0.62 * Math.max(1, title.length)))));
  const tagLines = wrap(tagline, 34);
  const tagSize = 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
<rect width="${OG_W}" height="${OG_H}" fill="${brand.bg}"/>
<rect x="96" y="135" width="360" height="360" rx="80" fill="${brand.fg}" fill-opacity="0.12"/>
<g transform="translate(156,195) scale(10)" fill="none" stroke="${brand.fg}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
<text x="528" y="${tagLines.length > 1 ? 262 : 292}" font-family="Geist" font-weight="700" font-size="${titleSize}" fill="#F2EEF0">${esc(title)}</text>
<text x="530" y="${tagLines.length > 1 ? 318 : 352}" font-family="Geist Mono" font-weight="500" font-size="28" fill="${brand.fg}" letter-spacing="2">${SITE_NAME.toUpperCase()}</text>
${tagLines.map((l, i) => `<text x="528" y="${(tagLines.length > 1 ? 386 : 424) + i * 44}" font-family="Geist" font-weight="700" font-size="${tagSize}" fill="#F2EEF0" fill-opacity="0.75">${esc(l)}</text>`).join("\n")}
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_W }, font: { loadSystemFonts: false, fontBuffers: fb, defaultFontFamily: "Geist" } }).render().asPng();
}

/** The meta block for one page. `path` is the site-relative directory ("/persona/"), image is `${path}og.png`. */
// A preview description is one or two lines: bots clip around 200 characters, so a long tagline is cut at a
// word boundary here rather than mid-word by the bot.
export const shortDescription = (s, max = 200) => { s = String(s || "").trim(); if (s.length <= max) return s; const cut = s.slice(0, max).replace(/\s+\S*$/, ""); return cut + "…"; };

export function metaBlock({ path, title, description, image = `${path}og.png`, alt }) {
  description = shortDescription(description);
  const url = SITE + path, img = SITE + image;
  const t = esc(title), d = esc(description), a = esc(alt || `${title} — ${SITE_NAME}`);
  return [
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:secure_url" content="${img}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${OG_W}">`,
    `<meta property="og:image:height" content="${OG_H}">`,
    `<meta property="og:image:alt" content="${a}">`,
    `<meta property="og:locale" content="uk_UA">`,
    `<meta property="og:locale:alternate" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="twitter:image:alt" content="${a}">`,
  ].map((l) => "  " + l).join("\n");
}

/** Inject the block right after <title>…</title>; idempotent (an existing og:title block is replaced). */
export function injectMeta(html, block) {
  const stripped = html.replace(/\n?  <!-- link preview -->[\s\S]*?<!-- \/link preview -->/, "");
  const m = /<title>[^<]*<\/title>/.exec(stripped);
  if (!m) throw new Error("og: index.html has no <title> to anchor the preview block");
  const at = m.index + m[0].length;
  return stripped.slice(0, at) + `\n  <!-- link preview -->\n${block}\n  <!-- /link preview -->` + stripped.slice(at);
}

/** Every tag a preview bot needs, or the list of what is missing — the build's assertion. */
export function previewGaps(html) {
  const need = ["og:title", "og:description", "og:image", "og:url", "twitter:card"];
  const gaps = need.filter((k) => !new RegExp(`(property|name)="${k}"`).test(html));
  if (!/property="og:image" content="https:\/\/[^"]+\.(png|jpe?g|webp)"/.test(html)) gaps.push("og:image absolute png/jpg/webp");
  if (!/name="twitter:card" content="summary_large_image"/.test(html)) gaps.push("twitter:card=summary_large_image");
  return gaps;
}
