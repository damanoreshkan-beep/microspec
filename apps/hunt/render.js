
import {
  SCRW, SCRH, TILE, ROWS, LAYERS, shadowFor, parallaxX, worldAt,
  T, K, S, POSE, ANIM, animFrame, decodeEntry,
} from "/_rt/hunt.js";
import { tileCell, frameCell, spearCell, anim, WORLD_INDEX as W } from "./atlas.js";

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x; };

const DEPTH = Object.freeze({ range: 0.06, far: LAYERS[0], mid: LAYERS[1], near: LAYERS[2] });
/** Smooth 1-D value noise in [0,1): nodes every `period` px, smoothstepped between them. This is
    the difference between rolling land and a row of triangles, and it costs one lerp. */
function vnoise(wx, period, salt) {
  const i = Math.floor(wx / period), u = (wx - i * period) / period;
  const a = hash(salt + i) & 1023, b = hash(salt + i + 1) & 1023;
  return (a + (b - a) * (u * u * (3 - 2 * u))) / 1024;
}

/**
 * A per-column silhouette, emitted as horizontal RUNS rather than 384 one-pixel rects.
 *
 * Both painters charge per rect (a fillRect in the browser, a fill loop in the preview) and this
 * renderer has four full-width bands in it. Neighbouring columns share a top most of the time, so
 * batching cuts the call count by roughly an order of magnitude for nothing but a comparison.
 * `top(x)` at or below `base` draws nothing, which is how a pit opts out of the deep-soil band.
 */
function silhouette(p, ink, base, top) {
  let x0 = 0, cur = top(0);
  for (let x = 1; x <= SCRW; x++) {
    const t = x < SCRW ? top(x) : Infinity;
    if (t === cur) continue;
    if (cur < base) p.rect(x0, cur, x - x0, base - cur, ink);
    x0 = x; cur = t;
  }
}

/**
 * One band of conifers, drawn tree by tree rather than column by column.
 *
 * Per-tree is what buys the near band its TRUNKS: a tree whose crown stops short of the base leaves
 * a gap you see the next band through, which is what the edge of a forest actually looks like. A
 * per-column silhouette can only produce one continuous skyline, which is right for the far bands
 * and wrong for the one you are standing in.
 */
function conifers(p, camx, o) {
  const off = parallaxX(camx, o.depth);
  
  if (o.floor) silhouette(p, o.ink, o.base, (x) => o.base - o.floor - Math.round(vnoise(x + off, 13, o.salt + 9) * 7));
  const i0 = Math.floor((off - o.period) / o.period), i1 = Math.ceil((off + SCRW + o.period) / o.period);
  for (let i = i0; i <= i1; i++) {
    
    const seed = hash(o.salt + i);
    const w = o.wlo + (seed >>> 2) % o.wspan;
    
    const h = ((seed >>> 26) % 7 ? 1 : 1.35) * (o.hlo + (seed >>> 8) % o.hspan);
    const cx = i * o.period + ((seed >>> 4) % o.period) - off;
    if (cx + w < 0 || cx - w > SCRW) continue;
    const trunk = o.trunk && (seed >>> 17) % 3 ? o.trunk + ((seed >>> 19) % 12) : 0;
    const bot = o.base - trunk;
    const half = w >> 1;
    
    const taper = 1 + ((seed >>> 12) % 90) / 100;
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= SCRW) continue;
      const top = bot - Math.round(h * (1 - Math.abs(dx) / half) ** taper) + (hash(o.salt * 31 + x + i * 7) & 1);
      if (top < bot) {
        p.rect(x, top, 1, bot - top, o.ink);
        
        if (o.litInk && dx < 0 && (x & 1) === 0) p.rect(x, top, 1, 1, o.litInk);
      }
    }
    if (trunk) {
      const bw = 2 + ((seed >>> 21) & 3);
      p.rect(cx - (bw >> 1), bot, bw, trunk, W.bark);
      p.rect(cx - (bw >> 1), bot, 1, trunk, W.barkLit);
    }
  }
}

/**
 * Where the darkness under a PIT starts, per tile column.
 *
 * A pit has no soil to take the answer from, so it borrows the lip beside it — the chasm then opens
 * at the edge you actually walked off. Clamped to the standard crust line, because a pit next to a
 * plateau would otherwise be blacked out from three rows up, hiding the forest behind it.
 */
function pitTops(crust, horizon) {
  const n = crust.length, out = new Int16Array(n);
  let prev = horizon;
  for (let c = 0; c < n; c++) { if (crust[c] !== 32767) prev = crust[c]; out[c] = prev; }
  let next = out[n - 1];
  for (let c = n - 1; c >= 0; c--) {
    if (crust[c] !== 32767) next = crust[c];
    out[c] = Math.max(horizon, Math.min(out[c], next));
  }
  return out;
}

const colOf = (x) => Math.round(x / TILE) + 1;

function backdrop(p, camx, crust, world, frameNo) {
  p.sky(world.sky[0], world.sky[1]);
  const horizon = ROWS * TILE - TILE * 3;
  
  const base = horizon + 2;

  
  if (world.stars > 0.03) {
    for (let i = 0; i < 54; i++) {
      const s = hash(i * 2711 + 17);
      p.rect(s % SCRW, 30 + ((s >>> 9) % 92), 1, 1, (s >>> 20) % 6 ? W.star : W.moon, world.stars);
    }
  }

  
  {
    const { x: cx, y: cy, r: R, kind, tones, alpha } = world.orb;
    if (alpha > 0.05) {
      if (kind === 1) {
        for (const [hr, ha] of [[R + 6, 0.08], [R + 3, 0.14]]) {         
          for (let dy = -hr; dy <= hr; dy++) {
            const hw = Math.floor(Math.sqrt(Math.max(0, hr * hr - dy * dy)));
            if (hw > 0) p.rect(cx - hw, cy + dy, hw * 2, 1, W.moonMid, ha * alpha);
          }
        }
      }
      const KL = Math.sqrt(1 / 3);
      for (let dy = -R; dy <= R; dy++) {
        const hw = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)));
        let runFrom = -hw, runTone = null;
        for (let dx = -hw; dx <= hw + 1; dx++) {
          let tone = null;
          if (dx <= hw) {
            if (kind === 1) {
              const rr = Math.sqrt(dx * dx + dy * dy) / R;
              tone = rr > 0.82 ? W.moonMid : W.moon;
            } else {
              const nx = dx / R, ny = dy / R;
              const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
              const lam = (-nx - ny + nz) * KL;                 
              tone = lam > 0.66 ? W.moon : lam > 0.3 ? W.moonMid : W.moonDim;
            }
          }
          if (tone !== runTone) {
            if (runTone !== null) p.rect(cx + runFrom, cy + dy, dx - runFrom, 1, runTone, alpha);
            runFrom = dx; runTone = tone;
          }
        }
      }
    }
  }

  {
    const coff = parallaxX(camx, 0.04) + (frameNo >> 3);
    const period = 168;
    const i0 = Math.floor((coff - period) / period), i1 = Math.ceil((coff + SCRW + period) / period);
    for (let i = i0; i <= i1; i++) {
      const s = hash(9000 + i * 131);
      const cx = i * period + (s % period) - coff;
      const cy = 34 + ((s >>> 7) % 44);
      const cw = 34 + ((s >>> 13) % 30);
      if (cx + cw < -10 || cx - cw > SCRW + 10) continue;
      const rows = [[0.55, -3, W.cloudLit], [0.85, -2, W.cloudLit], [1, -1, W.cloud], [0.9, 0, W.cloud]];
      for (const [f, dy, ink] of rows) {
        const hw = Math.round(cw * f / 2);
        p.rect(cx - hw, cy + dy, hw * 2, 1, ink, 0.9);
      }
      p.rect(cx - Math.round(cw * 0.3), cy - 4, Math.round(cw * 0.42), 1, W.cloudLit, 0.9);
    }
  }

  const roff = parallaxX(camx, DEPTH.range);
  silhouette(p, W.ridge, base, (x) => {
    const wx = x + roff;
    const n = vnoise(wx, 173, 4001) * 0.68 + vnoise(wx, 59, 4200) * 0.32;
    return base - 44 - Math.round(n * 34) + (hash(wx * 3 + 91) & 1);
  });

  
  conifers(p, camx, { depth: DEPTH.far, base, salt: 5100, period: 17, wlo: 20, wspan: 12, hlo: 18, hspan: 18, floor: 16, ink: W.canopyFar });
  conifers(p, camx, { depth: DEPTH.mid, base, salt: 6100, period: 26, wlo: 30, wspan: 16, hlo: 30, hspan: 26, floor: 20, ink: W.canopyMid });
  conifers(p, camx, {
    depth: DEPTH.near, base, salt: 7100, period: 54, wlo: 34, wspan: 16, hlo: 46, hspan: 34,
    ink: W.canopy, litInk: W.canopyLit, trunk: 11,
  });
  
  silhouette(p, W.earthDeep, SCRH, (x) => (crust[colOf(x)] === 32767 ? SCRH : horizon));
  
  
  silhouette(p, W.earthDark, horizon + 3, (x) => {
    const c = crust[colOf(x)];
    return c !== 32767 && c > horizon ? horizon : horizon + 3;
  });
  const pits = pitTops(crust, horizon);
  silhouette(p, W.abyss, SCRH, (x) => (crust[colOf(x)] === 32767 ? pits[colOf(x)] : SCRH));
}

/**
 * The crust's top edge, roughened at 1px resolution against WORLD x.
 *
 * The tile is 24px and every ground tile is the same object, so any texture inside it repeats at
 * 24px and the eye finds that grid instantly — which is why the horizon read as a ruled highlighter
 * stroke. Smooth noise (adjacent columns correlate) so the result is tufts rather than a comb, and
 * seeded from world position so the period is the level's rather than the tile's.
 */
function fringe(p, sx, sy, wx) {
  for (let i = 0; i < TILE; i++) {
    const x = wx + i;
    let t = Math.round(vnoise(x, 5, 8800) * 3) - 1;
    if (hash(x * 13 + 41) % 23 === 0) t += 3;             
    if (t <= 0) continue;
    p.rect(sx + i, sy - t, 1, t, hash(x + 999) & 3 ? W.grass : W.grassLit);
  }
}

/**
 * The soil gets heavy toward the bottom of the frame.
 *
 * A tile cannot say this: every DIRT cell is the same object whether it is one row under the grass
 * or eight, so depth has to be drawn over them. Ragged rather than banded (a ruled edge here is the
 * same mistake the grass line was making), keyed to world x so it does not crawl with the camera,
 * and skipped over columns with no floor — a pit is a drop, and giving it a soil bottom would put
 * a floor in it.
 */
function deepSoil(p, camx, crust) {
  silhouette(p, W.earthDeep, SCRH, (x) =>
    (crust[colOf(x)] === 32767 ? SCRH : SCRH - 20 - Math.round(vnoise(x + camx, 41, 9100) * 16)));
}
/** The floor under each column, so a shadow has something to fall on — and a pit has none. */
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
/**
 * The top of the SOIL per column — GROUND and DIRT only.
 *
 * Deliberately not groundMap(): that one answers "what can a shadow land on", so a floating stone
 * ledge counts and it should. This one answers "where does the earth start", and a ledge over a pit
 * must not make the pit report a floor — it would fill the drop with soil.
 */
function crustMap(dl, dln) {
  const cols = new Int16Array(SCRW / TILE + 4).fill(32767);
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite || (e.tile !== T.GROUND && e.tile !== T.DIRT)) continue;
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

function ellipse(p, cx, cy, rx, ry, alpha) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    if (half > 0) p.shadow(cx - half, cy + dy, half * 2, 1, alpha);
  }
}

/** Which decoded animation a sprite kind uses. */
const whoOf = (kind) => (kind === K.PLAYER ? "hero" : kind === K.HERO || kind === K.WALKER || kind === K.HOPPER ? "foe" : null);

export function renderFrame(p, dl, dln, st, { hud = true, box = null } = {}) {
  
  const boxH = (kind) => (box ? box(kind).h : TILE);
  const camx = st[S.CAMX], frameNo = st[S.FRAME];
  
  const qd = st[S.DIST] - (st[S.DIST] % 4);
  const world = worldAt(qd);
  p.setWorld?.(world.colors, qd);
  const floors = groundMap(dl, dln), crust = crustMap(dl, dln);
  backdrop(p, camx, crust, world, frameNo);

  const sprites = [];
  for (let i = 0; i < dln; i++) {
    const e = decodeEntry(dl, i);
    if (e.isSprite) { sprites.push(e); continue; }
    
    const wx = e.x + camx;
    const c = tileCell(e.tile, hash(wx * 7 + e.y * 31) >>> 8);
    if (c.w) p.cell(c, e.x, e.y);
    if (e.tile === T.GROUND) fringe(p, e.x, e.y, wx);
  }
  deepSoil(p, camx, crust);

  
  for (const e of sprites) {
    const who = whoOf(e.kind);
    if (!who) continue;
    const a = anim(who, "idle");
    const w = a ? a.w : TILE;
    const feet = e.y + boxH(e.kind);
    const gy = floorUnder(floors, e.x, feet);
    if (gy == null) continue;
    const sh = shadowFor(gy - feet, w);
    ellipse(p, e.x + TILE / 2 + sh.dx, gy + sh.ry, sh.rx, sh.ry, sh.alpha);
  }

  for (const e of sprites) {
    if (e.kind === K.SPEAR) {
      
      const back = e.flip ? 1 : -1;
      for (let k = 1; k <= 3; k++) {
        p.rect(e.x + (e.flip ? 12 : -4) + back * k * 7, e.y + 2, 4, 1, W.spearTip, 0.3 / k);
      }
      p.cell(spearCell(e.frame - 2), e.x - 8, e.y - 4, { flip: e.flip });
      continue;
    }
    const who = whoOf(e.kind);
    if (!who) continue;
    const name = ANIM[e.frame] ?? "idle";
    const a = anim(who, name) ?? anim(who, "idle");
    if (!a) continue;
    const cell = frameCell(who, ANIM[e.frame] && anim(who, ANIM[e.frame]) ? ANIM[e.frame] : "idle",
                           animFrame(a, e.frame, frameNo), e.frame === POSE.LOW);
    const ox = e.x + ((TILE - cell.w) >> 1), oy = e.y + boxH(e.kind) - cell.h;
    
    const blink = e.kind === K.PLAYER && st[S.INVULN] > 0 && (frameNo >> 2) % 2 ? 0.4 : 1;
    
    const rim = e.kind === K.PLAYER && world.rimA > 0.03 ? { hex: world.rim, a: world.rimA } : null;
    p.cell(cell, ox, oy, { flip: e.flip, alpha: blink, rim });
  }

  
  const flyN = Math.round(9 * world.fireflies);
  for (let i = 0; i < flyN; i++) {
    const s = hash(i * 517 + 29);
    const px = (((s % SCRW) + Math.round(Math.sin(frameNo / 34 + i * 1.7) * 16) - (camx >> 3)) % SCRW + SCRW) % SCRW;
    const py = 128 + ((s >>> 9) % 96) + Math.round(Math.sin(frameNo / 52 + i * 2.3) * 9);
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(frameNo / 22 + i * 2.9));
    p.rect(px - 1, py, 3, 1, W.fly, 0.10 * tw);
    p.rect(px, py - 1, 1, 3, W.fly, 0.10 * tw);
    p.rect(px, py, 1, 1, W.fly, tw * world.fireflies);
  }
  const moteN = Math.round(7 * world.motes);
  for (let i = 0; i < moteN; i++) {
    const s = hash(i * 733 + 91);
    const px = (((s % SCRW) + ((frameNo >> 2) % SCRW) * ((s >>> 5) & 1 ? 1 : -1) - (camx >> 2)) % SCRW + SCRW) % SCRW;
    const py = (((s >>> 9) % SCRH) + (frameNo >> 3)) % SCRH;
    p.rect(px, py, 1, 1, W.mote, 0.22 * world.motes);
  }

  if (hud) {
    
    for (let i = 0; i < st[S.HP]; i++) p.cell(tileCell(T.HEART), -1 + i * 14, -3);

    
    const ammo = Math.max(0, Math.min(20, st[S.AMMO]));
    for (let i = 0; i < Math.max(8, ammo); i++) {
      const x = 6 + i * 5;
      if (i < ammo) { p.rect(x, 16, 2, 10, W.spear); p.rect(x, 16, 2, 2, W.spearTip); }
      else p.rect(x, 18, 2, 8, W.quiverEmpty);
    }
    
    const score = String(Math.max(0, Math.floor(st[S.SCORE] || 0)));
    let x = SCRW - 11 - (score.length - 1) * 8;
    for (const ch of score) { p.glyph(ch, x, 5); x += 8; }

    
    if (st[S.COINS] > 0) {
      const coins = String(st[S.COINS]);
      let cx = SCRW - 11 - (coins.length - 1) * 8;
      p.rect(cx - 10, 16, 5, 5, W.gold);
      p.rect(cx - 10, 16, 5, 1, W.goldLit);
      p.rect(cx - 10, 16, 1, 3, W.goldLit);
      p.rect(cx - 7, 20, 2, 1, W.goldDark);
      for (const ch of coins) { p.glyph(ch, cx, 15); cx += 8; }
    }
  }
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
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === "1") out.push([x, y]);
  return out;
}
export { SCRW, SCRH };
