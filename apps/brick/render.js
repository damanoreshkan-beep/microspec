
import { SCRW, SCRH, TILE, ROWS, LCD, SHADOW, shadowFor, LAYERS, SPRITE, T, K, decodeEntry, digits, parallaxX, isBackdrop } from "/_rt/brick.js";
import { tileCell, spriteCell } from "./atlas.js";

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x; };
function backdrop(p, camx) {
  const horizon = ROWS * TILE - TILE * 2;

  
  const base = horizon - TILE;
  const range = (x, off, period, salt, lo, span) => {
    const wx = x + off;
    const i = Math.floor(wx / period), u = (((wx % period) + period) % period) / period;
    const seed = hash(salt + i);
    const h = lo + (seed >> 4) % span;
    const skew = 0.34 + ((seed >> 12) % 30) / 100;         
    const up = u < skew ? u / skew : (1 - u) / (1 - skew); 
    if (up <= 0) return base;
    const rough = (hash(salt * 7 + (wx | 0)) % 3) - 1;     
    return base - Math.round(h * up ** 1.15) + rough;
  };
  for (let x = -1; x < SCRW + 1; x++) {
    const top = Math.min(range(x, parallaxX(camx, 0.05), 137, 2000, 58, 46),
                         range(x, parallaxX(camx, 0.07), 91, 3000, 44, 40));
    if (top < base) p.rect(x, top, 1, base - top, 1);
  }

  
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
      p.rect(x + w / 2 - half, horizon - dy + TILE, half * 2, 1, 2);
    }
  }
  
  const off1 = parallaxX(camx, LAYERS[1]);
  for (let i = -1; i < 9; i++) {
    const seed = hash(1000 + i + ((off1 / 104) | 0));
    const x = i * 104 - (off1 % 104) + (seed % 48), y = 28 + (seed >> 9) % 52;
    
    for (const [cx, cy, r] of [[x + 10, y, 10], [x + 22, y - 3, 8], [x + 32, y + 1, 6]])
      for (let dy = -r; dy <= r; dy++) {
        const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)) * (dy > 0 ? 0.6 : 1));
        if (half > 0) p.rect(cx - half, cy + dy, half * 2, 1, 1);
      }
  }
}


function groundMap(dl, dln) {
  const cols = new Int16Array(SCRW / TILE + 4).fill(32767);
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite || e.tile < T.SOLID) continue;
    const c = Math.round(e.x / TILE) + 1;                       
    if (c >= 0 && c < cols.length && e.y < cols[c]) cols[c] = e.y;
  }
  return cols;
}
const floorUnder = (cols, x, feet) => {
  const c = Math.round(x / TILE) + 1;
  const y = c >= 0 && c < cols.length ? cols[c] : 32767;
  return y === 32767 || y < feet - 2 ? null : y;                
};

/** A hard-edged ellipse, drawn as rows. No blur: at this size a blur is four muddy pixels. */
function ellipse(p, cx, cy, rx, ry, alpha) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    if (half > 0) p.rect(cx - half, cy + dy, half * 2, 1, 4, alpha);
  }
}

/**
 * Draw one frame.
 *
 * @param p       a painter: plate · rect · cell · glyph · grid · sheen
 * @param dl      Int16Array display list from the engine
 * @param dln     entry count
 * @param st      Int32Array state block
 * @param opts    { hud: true }
 */
export function renderFrame(p, dl, dln, st, { hud = true } = {}) {
  const camx = st[4];

  
  p.plate();
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

  
  const floors = groundMap(dl, dln);
  for (const e of solids) {
    if (!e.isSprite || e.kind === K.POP || e.kind === K.DEBRIS) continue;
    const cell = spriteCell(e.kind, e.frame);
    if (!cell.w) continue;
    const feet = e.y + TILE;
    const gy = floorUnder(floors, e.x, feet);
    if (gy == null) continue;
    const sh = shadowFor(gy - feet, cell.w);
    ellipse(p, e.x + TILE / 2 + sh.dx, gy + sh.ry, sh.rx, sh.ry, sh.alpha);
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
