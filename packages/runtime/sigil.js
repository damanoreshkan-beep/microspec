// microspec runtime — SIGIL: deterministic sigil geometry from a statement of intent (SYSTEMIC, pure math).
//
// Two authentic historical techniques, composed (see apps/sigil/RESEARCH.md for sources):
//   • Spare distillation — strip vowels + repeated consonants from the intent (chaos-magic method, 1913).
//   • Agrippa kamea trace — map the distilled letters to numbers, locate each on a planetary MAGIC SQUARE,
//     and connect the cell-centres in order into one continuous line (the classical planetary-sigil method,
//     De Occulta Philosophia II, 1533).
// The intent's hash picks a PLANET (Saturn 3×3 … Moon 9×9 — the traditional orders), so geometry varies and
// each sigil carries an attribution. Everything here is pure + deterministic + unit-tested — never in an app
// (depth lives in the runtime, like groove.js / astro.js). The three.js forging (apps/sigil/viz.js) and the
// Canvas2D fallback both consume `sigilPath()`.

// ---- planets: order (kamea side) + the astro.js body key. The 7 classical, by their traditional number. ----
export const PLANETS = [
  { key: "saturn", order: 3 },
  { key: "jupiter", order: 4 },
  { key: "mars", order: 5 },
  { key: "sun", order: 6 },
  { key: "venus", order: 7 },
  { key: "mercury", order: 8 },
  { key: "moon", order: 9 },
];

// ---- letters: Unicode-aware, Latin + Ukrainian. Vowels are struck (Spare); Й/Y count as consonants. ----
const VOWELS = new Set([..."AEIOU", ..."АЕЄИІЇОУЮЯ"]);
const UA = "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ";           // rank table for Cyrillic
const isLetter = (ch) => /\p{L}/u.test(ch);
function rank(ch) {                                        // a stable 0-based alphabet index for the value map
  const code = ch.codePointAt(0);
  if (code >= 65 && code <= 90) return code - 65;          // A..Z → 0..25
  const ui = UA.indexOf(ch);
  if (ui >= 0) return ui;                                  // Ukrainian
  return code % 97;                                        // any other letter — deterministic fallback
}

// FNV-1a 32-bit — a small deterministic string hash for planet attribution + a viz seed.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const normalize = (intent) => Array.from(String(intent || "").toUpperCase()).filter(isLetter);

// Spare: keep first occurrence of each consonant, in order. Falls back to unique-of-all-letters if the intent
// is all vowels, so we never return nothing for a real phrase.
export function distill(intent) {
  const letters = normalize(intent);
  if (!letters.length) return [];
  const seen = new Set(), out = [];
  for (const ch of letters) { if (VOWELS.has(ch)) continue; if (seen.has(ch)) continue; seen.add(ch); out.push(ch); }
  if (out.length >= 2) return out;
  const seen2 = new Set(), all = [];
  for (const ch of letters) { if (seen2.has(ch)) continue; seen2.add(ch); all.push(ch); }
  return all.length ? all : letters.slice(0, 1);
}

// ---- magic squares (kameas) ----
export const magicConstant = (n) => (n * (n * n + 1)) / 2;

function siamese(n) {                                      // odd order (De la Loubère)
  const sq = Array.from({ length: n }, () => Array(n).fill(0));
  let r = 0, c = (n / 2) | 0;
  for (let k = 1; k <= n * n; k++) {
    sq[r][c] = k;
    let nr = (r - 1 + n) % n, nc = (c + 1) % n;
    if (sq[nr][nc]) { nr = (r + 1) % n; nc = c; }
    r = nr; c = nc;
  }
  return sq;
}
function doublyEven(n) {                                   // order % 4 === 0 (diagonal-complement)
  const sq = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i * n + j + 1));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i % 4, b = j % 4;
    if (a === b || a + b === 3) sq[i][j] = n * n + 1 - sq[i][j];
  }
  return sq;
}
// The canonical Agrippa Sun kamea (order 6 — the singly-even case; hard-coded to avoid a Strachey bug). Magic.
const SUN6 = [
  [6, 32, 3, 34, 35, 1],
  [7, 11, 27, 28, 8, 30],
  [19, 14, 16, 15, 23, 24],
  [18, 20, 22, 21, 17, 13],
  [25, 29, 10, 9, 26, 12],
  [36, 5, 33, 4, 2, 31],
];

export function squareFor(n) {
  if (n === 6) return SUN6.map((row) => row.slice());
  if (n % 2 === 1) return siamese(n);
  if (n % 4 === 0) return doublyEven(n);
  throw new Error(`unsupported kamea order ${n}`);
}

export function isMagic(sq) {
  const n = sq.length, want = magicConstant(n);
  let d1 = 0, d2 = 0;
  const cols = Array(n).fill(0);
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) { const v = sq[i][j]; row += v; cols[j] += v; seen.add(v); }
    if (row !== want) return false;
    d1 += sq[i][i]; d2 += sq[i][n - 1 - i];
  }
  if (d1 !== want || d2 !== want) return false;
  if (cols.some((c) => c !== want)) return false;
  return seen.size === n * n;                              // a permutation of 1..n²
}

// value(letter) → a cell number in 1..order²  (alphabet rank, wrapped into the square)
const letterValue = (ch, order) => (((rank(ch) % (order * order)) + order * order) % (order * order)) + 1;

// ---- Catmull-Rom sampler (pure) — the 2D fallback + thumbnails share this; three.js has its own Curve3. ----
export function smooth(pts, steps = 14) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Main entry. intent:string → the full sigil geometry, or null for an empty/letter-less intent.
// Coordinates live in a [-1,1] plane, y up; the whole trace is normalized to fit within a centred box.
export function sigilPath(intent) {
  const letters = distill(intent);
  if (!letters.length) return null;
  const norm = normalize(intent).join("");
  const seed = hash32(norm);
  const planet = PLANETS[seed % PLANETS.length];
  const order = planet.order;
  const sq = squareFor(order);

  // index each value → [row, col]
  const at = new Map();
  for (let i = 0; i < order; i++) for (let j = 0; j < order; j++) at.set(sq[i][j], [i, j]);

  // cell centre in [-1,1], y up; a small inset so end-marks/nodes never rim-hug
  const span = 1.62, cell = span / order;
  const centre = (r, c) => ({ x: -span / 2 + (c + 0.5) * cell, y: span / 2 - (r + 0.5) * cell });

  const cells = [], raw = [];
  for (const ch of letters) {
    const [r, c] = at.get(letterValue(ch, order));
    const p = centre(r, c);
    const prev = raw[raw.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y) continue;  // dedupe consecutive identical cells (curve safety)
    cells.push([r, c]); raw.push(p);
  }
  if (raw.length < 2) { raw.push({ x: 0, y: 0 }); cells.push([(order / 2) | 0, (order / 2) | 0]); }

  // all cell centres — the faint kamea lattice the viz dims/flares
  const nodes = [];
  for (let i = 0; i < order; i++) for (let j = 0; j < order; j++) nodes.push({ ...centre(i, j), v: sq[i][j] });

  // traditional marks: start ring + perpendicular end bar
  const a = raw[raw.length - 2], b = raw[raw.length - 1];
  const endAngle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  return {
    intent: String(intent),
    planet: planet.key,
    order,
    constant: magicConstant(order),
    letters,
    points: raw,
    cells,
    nodes,
    start: { x: raw[0].x, y: raw[0].y, r: cell * 0.22 },
    end: { x: b.x, y: b.y, a: endAngle, len: cell * 0.34 },
    seed,
  };
}
