// motion.js — frame-differencing for the camera motion-art app. Pure, unit-tested: it takes two RGBA pixel
// buffers of the same W×H (previous frame, current frame) and reports WHERE the image changed. The app then
// paints glowing particles at those spots — you paint with movement. Runs in the gate on seeded buffers
// (no canvas needed for the maths), so the detection is verified without a camera.

// Cells whose luma changed beyond `threshold` (0..255), as { x, y (0..1 normalized), m (0..1 magnitude),
// r, g, b (the current colour there — so the app can paint with the world's own colours) }.
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

// Mean luma change across the frame, 0..1 — the "how much is moving" meter.
export function motionEnergy(prev, cur) {
  if (!prev || !cur || prev.length !== cur.length || !cur.length) return 0;
  let s = 0, n = 0;
  for (let p = 0; p + 2 < cur.length; p += 4) { s += Math.abs((cur[p] + cur[p + 1] + cur[p + 2]) - (prev[p] + prev[p + 1] + prev[p + 2])) / 3; n++; }
  return n ? Math.min(1, s / n / 40) : 0;
}
