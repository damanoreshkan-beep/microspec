// Import brick's art from Kenney's CC0 "Pixel Platformer" pack.
//
//   deno run -A tools/art/brick-import.mjs            # → apps/brick/art.js
//   deno run -A tools/art/brick-import.mjs --check    # fail if the committed file is stale
//   deno run -A tools/art/brick-import.mjs --preview out.png    # look at what it produced
//
// Why an importer and not a committed PNG: the game does not draw colours. Its whole palette is
// five DENSITIES of one ink, because a passive-matrix LCD has a backplate and a polariser and no
// colour at all (packages/runtime/brick.js `INK`). So the pack's art is quantised by LUMINANCE
// into those five levels once, offline, and committed as text — which keeps the app's asset
// budget at zero PNGs, survives the theme flipping under it, and lets the light model in
// apps/brick/atlas.js add the volume that the flat source art does not have.
//
// The zip is fetched on demand and never committed (same pattern as tools/wasm/v2m/build.sh).
// LICENCE: Kenney's packs are CC0 1.0 — see apps/brick/assets/NOTICE.md (provenance for both
// vendored things in this app: the engine we wrote and the art we did not).

import { decodePNG, encodePNG, unzipOne } from "./png.mjs";

const ROOT = new URL("../../", import.meta.url);
const ZIP_URL = "https://kenney.nl/media/pages/assets/pixel-platformer/33bb4921eb-1696667883/kenney_pixel-platformer.zip";
const CACHE = new URL("tools/art/.cache/kenney_pixel-platformer.zip", ROOT);
const OUT = new URL("apps/brick/art.js", ROOT);

const TILE = 18;                       // tilemap_packed.png — 20 columns
const CHAR = 24;                       // tilemap-characters_packed.png — 9 columns, 24px sprites
const TCOLS = 20, CCOLS = 9;

/* The picks. Every one of these was chosen by rendering the sheet with a counting grid and
   LOOKING at it — the indices are not guessable from the file name, and a wrong index yields a
   perfectly plausible wrong tile. */
const TILES = {
  ground: 1,        // grass-topped surface — the row the generator exposes to the sky
  dirt: 4,          // its interior fill
  brick: 6,         // crate: the breakable one
  question: 10,     // the "!" box
  used: 9,          // …and the same box, spent
  stone: 29,        // plain crate — an unbreakable ledge
  coin: 151,
  pipeTop: 95,      // one column wide, rim on top
  pipeBod: 115,
  bush: 16,
  hill: 17,         // a green mass; at background density it reads as a far hill
};
const CHARS = {
  player: [9, 10],        // row 1, cols 0-1 — the only humanoid in the pack
  walker: [15, 16],       // row 1, cols 6-7 — tracked robot
  hopper: [24, 25],       // row 2, cols 6-7 — bat
};

/* Luminance → ink level. An opaque pixel never maps to 0: level 0 is bare plate, so a rounding
   accident there would punch a hole through the middle of a sprite.
   The black and white points are MEASURED from the picked art rather than guessed — the first
   cut used a hand-chosen curve and the whole set came out inside one density band, flat and
   unreadable. Kenney's palette occupies a narrow, mid-bright slice of luminance; stretching
   that slice across the ramp is the difference between a picture and a mush. */
const LEVELS = 5;
let LO = 0, HI = 1;
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function calibrate(samples) {
  const s = samples.slice().sort((a, b) => a - b);
  LO = s[Math.floor(s.length * 0.03)];
  HI = s[Math.floor(s.length * 0.97)];
  if (HI - LO < 0.05) throw new Error("the source art has no tonal range to stretch");
  return { LO, HI };
}

function quantise(r, g, b, a) {
  if (a < 128) return ".";
  const t = Math.min(1, Math.max(0, (lum(r, g, b) - LO) / (HI - LO)));
  return String(Math.min(LEVELS - 1, Math.max(1, Math.round((1 - t) * (LEVELS - 1) + 0.15))));
}

/** Every opaque pixel of every picked cell — the sample the calibration is derived from. */
function samplesOf(img, indices, size, cols) {
  const out = [];
  for (const index of indices) {
    const cx = (index % cols) * size, cy = ((index / cols) | 0) * size;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const o = ((cy + y) * img.w + cx + x) * 4;
        if (img.rgba[o + 3] >= 128) out.push(lum(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]));
      }
  }
  return out;
}

function cut(img, index, size, cols) {
  const cx = (index % cols) * size, cy = ((index / cols) | 0) * size;
  const rows = [];
  for (let y = 0; y < size; y++) {
    let s = "";
    for (let x = 0; x < size; x++) {
      const o = ((cy + y) * img.w + cx + x) * 4;
      s += quantise(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2], img.rgba[o + 3]);
    }
    rows.push(s);
  }
  return rows;
}

/** Drop fully transparent rows/cols from the top and sides so a 24px sprite sits on its feet. */
function trim(rows) {
  let top = 0, bottom = rows.length - 1;
  while (top < bottom && /^\.+$/.test(rows[top])) top++;
  while (bottom > top && /^\.+$/.test(rows[bottom])) bottom--;
  return { rows: rows.slice(top, bottom + 1), top, height: bottom - top + 1 };
}

async function zipBytes() {
  try { return Deno.readFileSync(CACHE); } catch { /* fetch below */ }
  console.log("fetching", ZIP_URL);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`kenney download failed: ${res.status}`);
  const b = new Uint8Array(await res.arrayBuffer());
  Deno.mkdirSync(new URL(".", CACHE), { recursive: true });
  Deno.writeFileSync(CACHE, b);
  return b;
}

const zip = await zipBytes();
const licence = new TextDecoder().decode(await unzipOne(zip, "License.txt"));
if (!/Creative Commons Zero/i.test(licence))
  throw new Error("the pack's License.txt no longer says CC0 — stop and re-check before shipping it");

const tiles = await decodePNG(await unzipOne(zip, "Tilemap/tilemap_packed.png"));
const chars = await decodePNG(await unzipOne(zip, "Tilemap/tilemap-characters_packed.png"));
if (tiles.w / TILE !== TCOLS) throw new Error(`tilemap is ${tiles.w / TILE} columns, expected ${TCOLS} — the picks are indices into it`);
if (chars.w / CHAR !== CCOLS) throw new Error(`character sheet is ${chars.w / CHAR} columns, expected ${CCOLS}`);

const cal = calibrate([
  ...samplesOf(tiles, Object.values(TILES), TILE, TCOLS),
  ...samplesOf(chars, Object.values(CHARS).flat(), CHAR, CCOLS),
]);
console.log(`calibrated on the picked art: luminance ${cal.LO.toFixed(3)} … ${cal.HI.toFixed(3)} → ink levels 1…${LEVELS - 1}`);

const outTiles = {}, outChars = {};
for (const [name, idx] of Object.entries(TILES)) outTiles[name] = cut(tiles, idx, TILE, TCOLS);
for (const [name, list] of Object.entries(CHARS)) outChars[name] = list.map((i) => trim(cut(chars, i, CHAR, CCOLS)).rows);

const body = `// GENERATED by tools/art/brick-import.mjs — do not edit by hand.
//
// Kenney "Pixel Platformer" (CC0 1.0), quantised from colour into the five ink densities of a
// passive-matrix LCD. '.' is bare plate; '1'-'4' are increasing segment densities. The volume
// you see in the game is NOT in here — atlas.js adds it from the silhouette, under the same
// 45° upper-left light as the console around it. See apps/brick/assets/NOTICE.md.

export const TILE_ART = ${JSON.stringify(outTiles, null, 1)};

export const CHAR_ART = ${JSON.stringify(outChars, null, 1)};
`;

if (Deno.args.includes("--check")) {
  const have = (() => { try { return Deno.readTextFileSync(OUT); } catch { return null; } })();
  if (have !== body) {
    console.error("✗ apps/brick/art.js is stale — run: deno run -A tools/art/brick-import.mjs");
    Deno.exit(1);
  }
  console.log("✓ brick art is up to date");
} else if (Deno.args.includes("--preview")) {
  const at = Deno.args[Deno.args.indexOf("--preview") + 1] ?? "brick-art.png";
  const cells = [...Object.values(outTiles), ...Object.values(outChars).flat()];
  const CW = Math.max(...cells.map((c) => c[0].length)), CH = Math.max(...cells.map((c) => c.length));
  const S = 6, W = cells.length * CW * S, H = CH * S;
  const img = new Uint8ClampedArray(W * H * 4);
  const INK = [0, 0.16, 0.34, 0.58, 0.86], plate = [180, 188, 150], ink = [35, 40, 28];
  for (let i = 0; i < W * H; i++) { img[i * 4] = plate[0]; img[i * 4 + 1] = plate[1]; img[i * 4 + 2] = plate[2]; img[i * 4 + 3] = 255; }
  cells.forEach((cell, k) => {
    for (let y = 0; y < cell.length; y++)
      for (let x = 0; x < cell[y].length; x++) {
        const ch = cell[y][x]; if (ch === ".") continue;
        const a = INK[+ch];
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const o = ((y * S + dy) * W + (k * CW + x) * S + dx) * 4;
          for (let c = 0; c < 3; c++) img[o + c] = plate[c] * (1 - a) + ink[c] * a;
        }
      }
  });
  Deno.writeFileSync(at, await encodePNG(img, W, H));
  console.log("wrote", at, `${W}x${H}`, "·", [...Object.keys(outTiles), ...Object.keys(outChars).flatMap((k) => outChars[k].map((_, i) => `${k}${i}`))].join(" "));
} else {
  Deno.writeTextFileSync(OUT, body);
  console.log(`wrote apps/brick/art.js — ${Object.keys(outTiles).length} tiles, ${Object.values(outChars).flat().length} sprite frames, ${(body.length / 1024).toFixed(1)} KB`);
}
