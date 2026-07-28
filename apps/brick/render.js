
import { SCRW, SCRH, TILE, ROWS, LCD, SHADOW, LAYERS, SPRITE, T, K, decodeEntry, digits, parallaxX, isBackdrop } from "/_rt/brick.js";
import { tileCell, spriteCell } from "./atlas.js";

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x; };
function backdrop(p, camx) {
  const horizon = ROWS * TILE - TILE * 2;
  
  const off0 = parallaxX(camx, LAYERS[0]);
  for (let i = -1; i < 8; i++) {
    const seed = hash(i + ((off0 / 96) | 0));
    const x = i * 96 - (off0 % 96) + (seed % 40);
    const w = 92 + (seed >> 8) % 70, h = 44 + (seed >> 16) % 38;
    for (let dy = 0; dy < h; dy++) {
      const half = Math.round((w / 2) * Math.sqrt(1 - (dy / h) ** 2));
      p.rect(x + w / 2 - half, horizon - dy, half * 2, 1, 1);
    }
  }
  
  const off2 = parallaxX(camx, LAYERS[2] * 0.5);
  for (let i = -1; i < 8; i++) {
    const seed = hash(500 + i + ((off2 / 74) | 0));
    const x = i * 74 - (off2 % 74) + (seed % 30);
    const w = 58 + (seed >> 8) % 40, h = 20 + (seed >> 16) % 18;
    for (let dy = 0; dy < h; dy++) {
      const half = Math.round((w / 2) * Math.sqrt(1 - (dy / h) ** 2));
      p.rect(x + w / 2 - half, horizon - dy + TILE, half * 2, 1, 1);
    }
  }
  
  const off1 = parallaxX(camx, LAYERS[1]);
  for (let i = -1; i < 6; i++) {
    const seed = hash(1000 + i + ((off1 / 150) | 0));
    const x = i * 150 - (off1 % 150) + (seed % 60), y = 16 + (seed >> 9) % 44;
    
    
    for (const [cx, cy, r] of [[x + 10, y, 10], [x + 22, y - 3, 8], [x + 32, y + 1, 6]])
      for (let dy = -r; dy <= r; dy++) {
        const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)) * (dy > 0 ? 0.6 : 1));
        if (half > 0) p.rect(cx - half, cy + dy, half * 2, 1, 1);
      }
  }
}

/**
 * Draw one frame.
 *
 * @param p       a painter: plate · ghost · rect · cell · grid · sheen
 * @param dl      Int16Array display list from the engine
 * @param dln     entry count
 * @param st      Int32Array state block
 * @param opts    { hud: true }
 */
export function renderFrame(p, dl, dln, st, { hud = true } = {}) {
  const camx = st[4];

  p.plate();
  p.ghost(LCD.ghost);               
  backdrop(p, camx);

  const solids = [];
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite) { solids.push(e); continue; }
    const cell = tileCell(e.tile);
    if (!cell.w) continue;
    if (isBackdrop(e.tile)) p.cell(cell, e.x, e.y);
    else solids.push(e);
  }

  for (const e of solids) {
    if (e.isSprite) continue;
    p.cell(tileCell(e.tile), e.x, e.y);
  }

  
  for (const e of solids) {
    if (!e.isSprite || e.kind === K.POP || e.kind === K.DEBRIS) continue;
    const cell = spriteCell(e.kind, e.frame);
    if (!cell.w) continue;
    p.cell(cell, e.x + SHADOW.dx, e.y + SHADOW.dy, { level: 4, alpha: SHADOW.alpha, flip: e.flip });
  }
  for (const e of solids) {
    if (!e.isSprite) continue;
    const cell = spriteCell(e.kind, e.frame);
    if (!cell.w) continue;
    
    
    p.cell(cell, e.x + ((TILE - cell.w) >> 1), e.y + TILE - cell.h, { flip: e.flip });
  }
  if (hud) {
    const glyph = (ch, x, y) => p.glyph(ch, x, y);
    let x = 6;
    for (const ch of digits(st[1], 6)) { glyph(ch, x, 6); x += 8; }
    x = SCRW - 6 - 3 * 8;
    for (const ch of digits(st[2], 3)) { glyph(ch, x, 6); x += 8; }
  }

  p.grid(LCD.grid);                 
  p.sheen(LCD.sheen);               
}

const FONT = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
};
export function glyphRects(ch) {
  const rows = FONT[ch];
  if (!rows) return [];
  const out = [];
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (rows[y][x] === "1") out.push([x, y]);
  return out;
}
export { SCRW, SCRH };
