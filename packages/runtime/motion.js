
export function motionCells(prev, cur, W, H, threshold = 24) {
  const cells = [];
  if (!prev || !cur || prev.length !== cur.length) return cells;
  for (let p = 0; p + 2 < cur.length; p += 4) {
    const dl = Math.abs((cur[p] + cur[p + 1] + cur[p + 2]) - (prev[p] + prev[p + 1] + prev[p + 2])) / 3;
    if (dl > threshold) {
      const idx = p >> 2;
      cells.push({ x: (idx % W) / W, y: Math.floor(idx / W) / H, m: Math.min(1, dl / 128), r: cur[p], g: cur[p + 1], b: cur[p + 2] });
    }
  }
  return cells;
}

export function motionEnergy(prev, cur) {
  if (!prev || !cur || prev.length !== cur.length || !cur.length) return 0;
  let s = 0, n = 0;
  for (let p = 0; p + 2 < cur.length; p += 4) { s += Math.abs((cur[p] + cur[p + 1] + cur[p + 2]) - (prev[p] + prev[p + 1] + prev[p + 2])) / 3; n++; }
  return n ? Math.min(1, s / n / 40) : 0;
}
